# Remote browser streaming (prototype)

Owner: `gameflexresearch` worker. Code: `services/remote-browser/`. This document
records what was built, what was actually executed, and what is still unproven.

## 1. Scope and non-claims

Delivered: a runnable prototype that opens a catalogue game inside a disposable,
sandboxed container browser and streams it to a client as JPEG frames over
WebSocket, with keyboard/mouse/wheel input returned to the page.

Explicitly **not** claimed:

- No audio. The container Chromium is launched with `--mute-audio`; there is no
  audio channel in the protocol.
- No relative-mouse guarantee. Pointer lock inside the streamed page is not
  modelled; the prototype sends absolute viewport coordinates. FPS-style aiming
  is expected to be poor and was not scored.
- No gameplay verification of any game. "Frames arrived and the page loaded" is
  not the same as "the game is playable". Nothing here updates the catalogue or
  any review decision.
- No performance, cost or capacity claims beyond the measurements in §5.
- Universal runtime compatibility is not claimed. Games requiring GPU-only
  features, DRM/anti-bot checks, proprietary codecs, or downloads will not work;
  only three catalogue entries were exercised at all.
- `wasmarcade` was deliberately never launched (excluded in `GF_RB_DENY_IDS`).

## 2. Shape

    player UI ──HTTP──▶ session gateway (host, loopback) ──docker run──▶ session container
        └────WebSocket frames + input ────┘                                  │
                                                            Chromium (sandboxed, non-root)
                                                            CDP screencast + input dispatch

- Gateway: `services/remote-browser/src/gateway.mjs`. Loopback-bound HTTP API and
  the WebSocket relay. It owns the catalogue allowlist, session TTLs and Docker.
- Runner: `services/remote-browser/runner/runner.mjs`, inside the container. It
  launches Chromium, collects CDP screencast frames, applies the egress policy and
  dispatches input.
- One container per session, `--rm`, labelled `gameflex.remote-browser=1`. The
  container is a single-use process: it never receives host paths, the Docker
  socket, user cookies, or anything from a previous session.

Session flow: `POST /api/sessions {gameId}` → allowlist + key + origin checks →
private-address pre-flight check → `docker run` → poll `/healthz` (bearer: runner
token) → `201 {id,token,wsUrl,expiresAt}` → `WS /ws/:id?token=…` → frames down,
input up → `DELETE /api/sessions/:id` (Bearer session token) or TTL/idle reap →
`docker rm -f`. If the caller's response socket is already closed when the
container finishes starting, the creation is not handed off: the reservation is
released and the container is removed instead of leaving an unreachable session.

## 3. Controls, and what they do not cover

| Control | Implementation | Not covered |
| --- | --- | --- |
| Destinations | Only `gameId` is accepted; the URL comes from `dist/games.json` | A catalogue entry itself could be malicious |
| Cross-site creation | Exact `Origin` allowlist + mandatory gateway key + CORS without `*` | The prototype key is one shared secret; no per-user identity |
| Token hygiene | 32-byte tokens, only SHA-256 hashes stored, timing-safe compare, query-string tokens redacted from all logs, TTL-bound | Gateway-to-runner hop is plain HTTP on loopback |
| Private network | Loopback/private/link-local/`.internal`/`.local` blocked, IP literals refused, and the game host is resolved **once at session start** and refused if that answer is a private address | Not a connection-pinning defence: the check classifies one resolver answer made before launch, so a host that re-resolves to a private address after the check is not caught by it (the runner's per-request check is separate, and container egress is not firewalled to the checked address) |
| Egress | Every request not on the game's origin is aborted; popups closed; downloads denied; no permission grants | A game that is itself served from a public-but-hostile origin is still allowed |
| Container | `--read-only` + tmpfs, `--cap-drop ALL`, `no-new-privileges`, memory/swap/cpu/pid/shm caps, `--rm`, loopback-only port, no mounts, no Docker socket, non-root `pwuser` | Kernel/hypervisor boundary is Docker Desktop's own |
| Browser | Chromium's own sandbox **enabled** (`chromiumSandbox: true`), seccomp profile built for it, verified at startup | LinuxKit VM is a plain Docker Desktop VM, not a hardened micro-VM |
| Lifetime | Hard TTL (120 s default), idle timeout (30 s), `maxSessions` (3), reaper every 2 s, runner self-terminates at TTL | No per-IP or per-user quotas |

Failing the sandbox check is terminal: the runner logs `SANDBOX_UNAVAILABLE` and
exits non-zero, the gateway reports `runner_not_ready` and removes the container.
There is no code path that relaunches Chromium unsandboxed.

## 4. Sandbox verification (executed)

The Docker default seccomp profile permits `clone`/`unshare`/`mount` only with
`CAP_SYS_ADMIN`; with `--cap-drop ALL` that rule does not apply, so Chromium's
namespace sandbox cannot start. `runner/seccomp/build-profile.mjs` rebuilds the
profile from the upstream Docker default (moby/profiles) and adds the namespace
allowances the browser sandbox needs. Measured, not assumed:

1. Positive control — custom profile, `--cap-drop ALL`:
   `npm run sandbox:check` → exit 0, and Chromium's own report reads
   `Layer 1 Sandbox: Namespace / PID namespaces: Yes / Network namespaces: Yes /
   Seccomp-BPF sandbox: Yes / You are adequately sandboxed.`
   plus 5 child processes in PID and NET namespaces other than the browser's,
   `noSandboxFlagsFound: 0`. Re-run during this pass with the same image: same
   verdict (`ok: true`, `failures: []`, `sandboxPageSaysAdequate: true`,
   `noSandboxFlagsFound: 0`).
2. Negative control A — same container, Docker's default seccomp, no profile:
   Chromium aborts at launch (`SIGABRT`, no sandbox) — the container cannot run a
   sandboxed browser without the profile, and does not silently run unsandboxed.
3. Negative control B — fault injection (`npm run sandbox:selftest`) launches
   Chromium with `chromiumSandbox: false`: the checker detects it
   (`no_sandbox_flag_present`, 8 `--no-sandbox` flags, 0 isolated children) and
   prints `SELF_TEST_OK`.
4. Negative control C — runner started without the seccomp profile: logs
   `SANDBOX_UNAVAILABLE: sandboxed chromium failed to start`, exit code 3.

Engine: Docker Desktop 4.92.0, engine 29.8.0, linux/amd64. Runner image
`gameflex/browser-runner:0.1.0` (3.54 GB), base
`mcr.microsoft.com/playwright:v1.62.1-noble`, Chromium 151.0.7922.34.

## 5. Measured results (executed)

`node --test --test-reporter=tap test/*.test.mjs` → 55/55 pass (auth, allowlist,
input validation, TTL/idle/capacity, HTTP+CORS+key, WebSocket relay, teardown,
log redaction, plus the review regressions: concurrent capacity reservation,
abort-mid-create cleanup, input-driven idle expiry). The regressions cover the
gateway logic against a fake runner and a simulated resolver only; they do not
exercise Docker, Chromium or real DNS. Two tests caught real defects: `reap()`
removed the session record but skipped teardown, which would have leaked
containers on every TTL/idle expiry; and an aborted `POST /api/sessions` could
hand off a session the caller could never reach.

`scripts/e2e-smoke.mjs` against the live catalogue (single run each, one machine;
not a benchmark):

| Measurement | quake (`q1.pieter.com`) | quake3 (`q3.pieter.com`) |
| --- | --- | --- |
| API call → session created | 5.9 s (warm), 43.5 s (first run after image rebuild) | 10.6 s |
| API call → first frame | 6.0 s (warm), 43.6 s (cold) | 11.0 s |
| Runner-side startup (`/healthz`) | 3.4 s cold, 2.9 s warm | 2.9 s |
| Frames (until client stopped) | 8–10 | 8 |
| Frame size | 27–30 KB JPEG, 960×540 | ~27 KB JPEG, 960×540 |
| Observed frame rate | 6–10.5 fps | 6.4 fps |
| Input events accepted / rejected | 6 / 0 | 6 / 0 |
| `DELETE` | 204, container gone, store empty | 204, container gone, store empty |

Re-run during this pass (gateway-only changes, same image, same machine): both
games completed, containers removed, store empty. quake: session created 7.1 s,
first frame 7.4 s, 8 frames at 11 fps; quake3: 7.9 s, 8.3 s, 8 frames at 6.7 fps;
6/6 inputs accepted each, `DELETE` 204. Frames were written to
`services/remote-browser/artifacts/remote/frames/` (git-ignored): real JPEGs (SOI
`ffd8ff`). In the earlier run consecutive `quake` frames differed while `quake3`
frames were byte-identical (static launch menu); in this re-run `quake3` frames
also changed (first 28 KB → last 39 KB), so byte-identity is not a stable
property of the prototype. Egress blocking fired in practice:
`https://pieter.com` and `https://scripts.simpleanalyticscdn.com` were aborted on
the quake page.

Not measured: input latency round-trip, sustained CPU/memory per session,
concurrent-session behaviour, bandwidth over a real network, mobile/touch input.

## 6. Deploying this for real

The prototype is local-only by design. To put it in front of players it needs:

- An authenticated broker: the player's identity, quota and session ownership are
  established server-side; the gateway key must never reach the browser.
- TLS (`https`/`wss`) and a real origin allowlist for the production site.
- Per-user rate limits and a queue, plus a capacity plan for N concurrent
  containers (each is ~1 GB RAM / 1.5 CPU here).
- Session affinity if the gateway is scaled horizontally, and orphan cleanup for
  containers left behind by a crashed gateway.
- An explicit decision on the streaming/redistribution terms of each destination.
  Nothing in this prototype infers hosting or streaming permission from missing
  framing headers.
- Anti-abuse: container-based browsing can be used to reach the public internet;
  egress is allowlisted per session, but that allowlist is per game, not per user.

## 7. Integration contract for the player UI

`services/remote-browser/README.md` §API is the contract. Blockers for the UI
worker today:

1. The frontend offers a memory-only owner-key field only when both the page
   and gateway are loopback. It never stores that key or offers it on the hosted
   site. Production needs the authenticated broker above, not a shared key in
   the public client.
2. The viewer must scale pointer coordinates from its rendered rect to the
   960×540 stream viewport and send them as `input` events; coordinates are not
   normalised.
3. Before public streaming, the client must distinguish fatal runner errors
   from blocked nonessential requests and surface meaningful recovery. The
   current preview primarily handles socket failure and first-frame timeout.
   It must never offer an external-new-tab fallback (AGENTS.md).

## Integration follow-up, 2026-10-10

The catalogue now includes 21 DOS listings marked `sandbox-pending`. `loadCatalog`
omits pending entries, and `resolveGame` also refuses injected pending records.
Listing approval cannot enable a remote session. A local fixture test covers
both paths and confirms ordinary catalogue games still resolve: 55 tests pass.

Pinned `ws` was updated from 8.18.3 to 8.22.0 after npm reported known
vulnerabilities. The updated package audit reports zero vulnerabilities. The
runner image was rebuilt; its sandbox check passed, and a fresh Quake smoke
test returned its first frame in 7.1 seconds, streamed 8 frames at about 11 fps,
accepted 6 input events and deleted its session with no containers left behind.
These remain short feasibility samples, not gameplay certification.
