# Claude handoff: Gameflex sandbox backend

Updated 2026-10-12. Repo: https://github.com/milllenialfalcon/gameflex. Start from `fix/player-viewport` / PR #14 (commit `959125d`), which is the latest published frontend baseline. Do not start from an older player branch without reconciling it first.

## Role and working agreement

You are the Gameflex backend engineer. GPT (ChatGPT desktop) owns frontend architecture, UI implementation, integration and product release. Hermes is the shared heavy worker for bounded research, bulk checks and routine implementation; either engineer can invoke it from a terminal. The human product owner reviews material product/security choices and verifies new games before publication.

Use Trello board **Gameflex** as the shared progress surface: https://trello.com/b/1kXnmQJJ/gameflex. Each substantial task gets an owner, concise scope, acceptance checks and links to its GitHub branch/PR. Move cards through the existing workflow and leave brief comments at start, when blocked, and when ready for review. GitHub commits/PRs remain the technical record; Trello mirrors status and links. Never report another agent's work as your own.

No shared mutable checkout. Use a separate Git worktree/branch per human or Hermes task, push early, and coordinate file ownership in the Trello card. Do not edit another active worker's assigned files. Keep product source changes in PRs. Each human engineer updates the Trello card they own; the release owner handles merges and Sites publication.

## Read first

1. `AGENTS.md` and `README.md` for project rules and the Hermes invocation.
2. `docs/player-ui.md` for the frontend's current remote-session request/response contract and failure cleanup.
3. `docs/player-isolation-audit.md` and `docs/player-viewport-qa.md` for verified hosting limits and frontend evidence.
4. Backend prototype PR #4 (`feat/remote-browser-prototype`, `services/remote-browser/`, `docs/remote-browser.md`) and frontend PR #14 (`fix/player-viewport`). PR #4 is the existing backend to continue, not a suggestion to recreate. It depends historically on player PR #2; reconcile its base/contract against the newer PR #14 before backend changes. Check GitHub for newer merged work before coding.
5. `docs/worker.md` and `research/browser-hosting/recommendation.md` for the current Hermes setup and previous infrastructure review.

Treat every document as dated context. Confirm the actual code and current deployment before relying on old branch notes or measurements.

## Current product/runtime state

- Live site: https://www.gameflex.lol (public audience). Static frontend under `dist/`; this release has no application backend, account system, telemetry, or server-side favourites.
- All launches stay inside the Gameflex player. Sandboxed iframe mode is the shipped path for selected records. There is no new-tab fallback.
- `dist/player-config.json` has `remote.enabled: false`. The frontend has a prototype client contract in `dist/player.mjs`; it is disabled in production. The backend prototype is in PR #4 at `services/remote-browser/`, not merged or hosted.
- Prototype API: `POST /api/sessions` with `{ gameId }` returns `{ id, token, wsUrl, expiresAt }`; WebSocket accepts bounded `{type:"input", event:…}` and emits `{type:"frame", data:<base64 JPEG>, width, height}`; DELETE session ends it. See `docs/player-ui.md` for exact types and generation/late-create cleanup.
- PR #4 runs an owner-local gateway and one disposable Docker/Chromium container per session. It accepts catalogue IDs, uses exact-origin checks and a local owner key, mints short-lived tokens, streams JPEG over WebSocket and validates keyboard/mouse/wheel input. Containers run non-root with Chromium sandbox enabled, resource limits, read-only filesystem, no host mounts or Docker socket, plus cleanup on exit/expiry/failure. It is still a feasibility prototype: no audio or relative-mouse guarantee, no production identity/broker, no hosted deployment, no sustained or concurrent load evidence. Its shared owner key must never be exposed to visitors.
- BO1 reports SharedArrayBuffer unavailable; Hermes traced its exact message to a `crossOriginIsolated` capability check. Halo CE Mobile and The Simpsons also use shared-memory paths. See `docs/player-isolation-audit.md`. Adding headers to an unrelated origin, a frame load, or HTTP 200 is not proof of a fix or playable game.
- Remote-streamed sessions are different from first-party static game hosting and from iframe embedding. Do not proxy third-party sites to strip security headers. Do not assume hosting, framing, streaming, game-file, or ad/monetization rights.
- No production deployment credentials belong in Git, prompts, Trello, logs, or Hermes memory.

## First task: audit PR #4 and plan the production pilot

Use the existing Trello card **Production remote streaming: broker, audio, input and isolation**: https://trello.com/c/Me7Vy60A/10-production-remote-streaming-broker-audio-input-and-isolation. Link this handoff, PR #4 and frontend PR #14. Do not create a duplicate card. Then:

1. Audit PR #4 itself (`feat/remote-browser-prototype`) and its `services/remote-browser/` code, tests, `docs/remote-browser.md`, open PR #2 dependency, latest frontend PR #14 and hosting recommendation. Do not recreate or overwrite the prototype. The PR #4 record reports 55 gateway tests and short real-Docker Quake/Quake 3 smoke runs, including about 6–11 fps and a 43.6s cold start after image rebuild. Tests use fake runner/DNS; real runs were one machine and short. No sustained, concurrent or hosted test is claimed. Attribute any new rerun to its date and machine.
2. Write a short, evidence-backed backend proposal covering the smallest production vertical slice: broker API/auth, isolated per-session browser or runtime, game allowlist, input/video/audio, lifecycle/cleanup, quotas/abuse controls, secrets, hosting/cost, observability and operational failure modes. Separate local prototype behavior from tested production facts.
3. Identify decisions only the owner can make, especially provider/budget, retention, public access/rate limits, audio requirements and monetization policy. Put the concrete options, tradeoffs and recommendation in the Trello card and a repo note/PR; ask the owner in Claude Code before making a costly or externally visible choice.
4. Once those choices are resolved, implement one vertical slice on your own branch/worktree. Keep remote mode disabled on the live frontend until the broker and runner pass the agreed release checks. Do not deploy, merge, edit `dist/games.json`, change verification decisions, or enable monetization as part of backend work without owner approval.
5. Include abuse/security tests and a repeatable local run. Validate create → connect → stream → input → delete, unauthorized access, limits, expiry, disconnect, abandoned creation, concurrent sessions, and runner isolation. Document what remains untested. Request frontend contract changes through a Trello card/PR comment so GPT can adapt its owned UI.

## Hermes use

Both engineers can run the installed Hermes CLI from Claude Code or ChatGPT's terminal, using the shared profiles and model. The project-required form is:

```powershell
hermes -p gameflex --in D:\AI\Gameflex --provider opencode-go -m deepseek-v4.1-flash -t terminal,file -z 'Bounded task. Read AGENTS.md first. Modify only the files assigned below. Report changed paths, commands/results, limitations, and do not commit, push, publish, or update Trello.'
```

Use `gameflexresearch` for external discovery or broad research. Always provide a bounded scope, exact file ownership, and a report path under `research/` for research work. Hermes workers do not commit, push, merge, publish, change Trello, or edit another worker's files; their human owner reviews and integrates. Never paste secrets into a worker prompt. If CLI/profile configuration differs on Claude's machine, inspect `docs/worker.md` and validate the profile without copying API credentials into the repo.

## Shared progress and notifications

Trello is the shared progress record, not shared model memory. Keep each card current with owner, status, next action, blockers and branch/PR links. GitHub PRs are authoritative for code and review. Both desktop apps are separate clients; Claude cannot see GPT's conversation, and GPT cannot see Claude's. Each engineer must leave a short Trello update when starting, blocked, or ready for review.

The ChatGPT desktop task already has a connected Trello tool. Claude Code can connect to MCP servers, but do not assume that connection is present: verify Trello read/write access in Claude before relying on it. If there is no approved Trello connector for Claude, keep the shared board open in a browser and post updates there manually while we select a supported MCP/API integration. Store any auth in the client's protected local credential store, never `.mcp.json` or Git. A checked-in project MCP config must contain only non-secret endpoint metadata.

For fast human awareness, enable Trello card/board notifications and GitHub PR/CI notifications in both apps. Webhooks can deliver GitHub/Trello events into a shared notification service or activity feed, but they do not automatically inject messages into an idle Claude or ChatGPT conversation. A custom event bridge should be a separate, small project with an authenticated receiver, signature validation, an allowlist, deduplication and clear retention. Never expose Hermes or a local Claude/ChatGPT CLI as a public webhook endpoint.

## Prompt to start Claude Code

Paste the following after opening this repository at the handoff branch:

> You are the Gameflex backend engineer. Read `docs/claude-sandbox-handoff.md`, `AGENTS.md`, `docs/player-ui.md`, `docs/player-isolation-audit.md`, `docs/worker.md`, and `research/browser-hosting/recommendation.md`. Check for newer GitHub changes than this handoff before you act. First inspect the existing remote-session prototype and all relevant backend/service branches or PRs. Then update the existing Trello card **Production remote streaming: broker, audio, input and isolation**, assign yourself as owner in the description, and post a short start update. Do not edit files yet. Return: (1) what backend code already exists and its tested state, (2) a recommended minimum production architecture that fits the existing frontend API, (3) risks/cost drivers and concrete owner decisions needed, and (4) a proposed vertical-slice scope with acceptance tests. Do not deploy, enable remote mode, change game approvals, or put secrets in Git. When the owner answers the listed choices, continue implementation in your own worktree/branch, delegate bounded bulk work to Hermes using the Gameflex profile and `--in D:\AI\Gameflex`, and keep Trello and GitHub current. If you need clarification from GPT, ask in the shared Trello card with a direct question and tag/link the relevant PR; do not assume GPT can see your Claude conversation.

## Claude's questions for the owner

Ask only after the initial code/PR audit, and group them into one short Trello comment:

- Which hosting provider and monthly spend ceiling should the first pilot target?
- Should pilot sessions be open to every visitor, or limited to a private test group?
- What is the maximum session length and concurrency? Should any video/session data be retained (recommend no recording by default)?
- Is audio required for the first pilot, or can a silent visual/input slice validate the runner first?
- Should monetization/ad insertion remain explicitly out of scope until hosting and game distribution rights are reviewed per title?

Default recommendation: private pilot, no recording, short session TTL, conservative concurrency/rate limits, audio called out as a release requirement before public launch, and no ad insertion until per-title rights and product policy are established.
