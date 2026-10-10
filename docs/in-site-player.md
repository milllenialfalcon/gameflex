# In-site player architecture

Decision: every launch stays inside Gameflex. No external-new-tab fallback. The existing private Sites project is the review environment; no ads are enabled.

## Delivery

The catalogue links to `#play/<catalogue-id>`. The player resolves IDs against the fixed catalogue, never a user-supplied URL. Direct iframe mode runs on the visitor's device inside a restricted cross-origin iframe. Streamed mode connects to a separate authenticated session broker; Sites does not run Chromium or Docker.

The player owns start/restart/exit/fullscreen, requirements, focus and status. Loading a frame is not proof of playable gameplay. Errors stay inside Gameflex. Explicit publisher prohibitions remain unavailable pending an authorised source.

## Streaming boundary

Prototype protocol: POST `/api/sessions` with `{gameId}` returns `{id,token,wsUrl,expiresAt}`; WebSocket carries JPEG frames and validated input; authenticated DELETE terminates a session. This prototype is for feasibility review. It is not a production FPS streaming service: audio, relative mouse, gamepad and production latency/cost must be separately established.

Production requires an authenticated broker, per-player container or stronger isolation, controlled egress, TLS, lifecycle limits, and a measured low-latency video/audio path. Browser containers must not receive the Docker socket, host files or other players' cookies. Public traffic remains disabled until these boundaries are verified.

## Version control and review

`feat/in-site-player` is based on `feat/gameflex-catalogue`. Its draft PR targets that branch until catalogue PR #1 merges, then retargets main. Keep source changes in reviewable commits: player UI, remote prototype, integration/verification. Do not merge automatically.

Hermes `gameflex` owns UI files; Hermes `gameflexresearch` owns `services/remote-browser/` and its documentation. Shared-file edits remain sequential. The primary agent reviews and integrates, runs release checks, commits, updates Trello and publishes the owner-private review build.

Acceptance: every tile/detail/hero launch is internal; no catalogue regression; iframe sandbox enforced; unknown IDs and loading failures recover internally; restart/exit destroys prior resources; desktop/mobile layouts and keyboard access pass. Streaming claims must be backed by actual runtime evidence. Research candidates remain outside the catalogue until separately verified by both reviewers.
