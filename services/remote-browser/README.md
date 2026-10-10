# remote-browser (prototype)

Gameflex in-site player backend: a host **session gateway** plus a Dockerised
**browser runner**. One gaming session = one throwaway container = one sandboxed
Chromium pointed at one catalogue URL, streamed to the player as JPEG frames.

Status: **runnable prototype, not production.** No audio, no relative-mouse
guarantee, low frame rate by design, and no claim that any particular game is
playable through it.

## Layout

    src/                 gateway (runs on the host)
      config.mjs         config + catalogue allowlist + private-IP classification
      auth.mjs           token mint/verify/redaction
      input.mjs          strict input-event validation
      http.mjs           CORS, access key, body limits, status codes
      sessions.mjs       session store: TTL, idle timeout, capacity
      docker.mjs         container arguments + lifecycle (bounded, read-only)
      gateway.mjs        HTTP API, WebSocket relay, private-address pre-flight
    runner/              runs inside the session container
      runner.mjs         Chromium + CDP screencast + input dispatch
      policy.mjs         egress policy (origin allowlist, private-IP block)
      sandbox-check.mjs  proves Chromium's own sandbox is engaged
      seccomp/           seccomp profile builder + generated profile
      Dockerfile
    test/                node:test suites (no Docker needed)
    scripts/e2e-smoke.mjs real end-to-end run against Docker + a live game page

## Run

    cd services/remote-browser
    npm install                       # or npm ci
    npm test                          # 54 tests, no Docker required
    npm run build:runner              # builds gameflex/browser-runner:0.1.0
    npm run sandbox:check             # container self-check, must exit 0
    npm run sandbox:selftest          # fault injection: must detect an unsandboxed launch

    # gateway (loopback only; both env vars are mandatory)
    GF_RB_KEY=dev-gateway-key GF_RB_ORIGINS=http://127.0.0.1:5500 npm start

    # real session: create -> frames -> input -> delete
    GF_RB_KEY=dev-gateway-key GF_RB_ORIGINS=http://127.0.0.1:5500 node scripts/e2e-smoke.mjs quake

Env: `GF_RB_KEY`, `GF_RB_ORIGINS` (comma-separated exact origins), `GF_RB_PORT`,
`GF_RB_CATALOG`, `GF_RB_TTL_MS`, `GF_RB_IDLE_MS`, `GF_RB_MAX_SESSIONS`,
`GF_RB_READY_MS`, `GF_RB_IMAGE`, `GF_RB_SECCOMP`, `GF_RB_DENY_IDS`.

## API

`POST /api/sessions` — headers `Origin` (must be allowlisted) and
`x-gameflex-key`; body `{"gameId":"quake"}`. Only catalogue ids are accepted; a
URL in the body is ignored. `201`:

    {"id","token","wsUrl","expiresAt",
     "game":{"id","title","origin"},
     "viewer":{"width":960,"height":540,"format":"jpeg","targetFps":12},
     "capabilities":{"audio":false,"relativeMouse":false,...}}

`DELETE /api/sessions/:id` — `Authorization: Bearer <token>`. `204`, container removed.

`GET /api/health` — engine version, session count, limits.

`ws://…/ws/:id?token=…` — the token may travel in the query string because
browsers cannot set headers on a WebSocket handshake; every log line passes
through redaction first.

Server → client: `accepted`, `frame` (`{type,format:'jpeg',data:<base64>,width,height,ts}`),
`stats`, `status` (`attached` / `expiring` / `egress_blocked`), `error`.
Client → server: `{type:'input',event:{…}}` with `kind` `mouse` /
`key` / `wheel`, exactly as validated in `src/input.mjs`. Coordinates are CSS
pixels in the 960×540 viewer viewport; the UI scales rendered size → viewport.

## Container bounds (per session)

`--rm`, `--read-only` + tmpfs `/tmp`, `--cap-drop ALL`,
`--security-opt no-new-privileges`, `--memory 1g --memory-swap 1g`, `--cpus 1.5`,
`--pids-limit 256`, `--shm-size 512m`, `--network bridge`, published port bound
to `127.0.0.1` only, no host mounts, no Docker socket, non-root `pwuser`, and a
seccomp profile that enables Chromium's own sandbox. See
`../../docs/remote-browser.md` for the threat model, evidence and limits.
