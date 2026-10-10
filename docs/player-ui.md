# gameflex in-site player

Implemented 2026-10-10 on `feat/in-site-player`. Every launch path stays inside gameflex: a sandboxed cross-origin iframe on the same page, or (when a remote relay is configured) a streamed session in a canvas. There is no external-new-tab fallback anywhere in the frontend.

## Routes

- `#play/<id>` is the only launch address. Tiles, card titles, the details dialog action, the hero "Let's play" button and "Pick for me" all resolve to it (`#play/halo`).
- Opening pushes one history entry; Back and Forward move in and out of the player; `Escape`, the in-player Back button and browser Back all close it.
- A deep load or reload of `#play/<id>` opens that game directly.
- Unknown ids show a recoverable in-site empty state ("That game is not in the collection") with a Back button. An id that is missing from the player config, or a config that fails to load, is treated the same way rather than assumed playable.
- The hash is only ever matched against `^[A-Za-z0-9_-]{1,64}$`. Nothing from the hash or query string is inserted as HTML, and it is never used as a frame URL. Only a `https:` URL taken from `dist/games.json` is framed.

## Player chrome

Title, tag, genre/platform/own-files meta, game requirements, Back, Start game / Restart game, Fullscreen, Favourite, and a polite live status region. The stage shows one of: start panel, loading label, the frame, the timeout panel, the blocked panel, or the remote canvas.

- Closing destroys the frame (and any remote session), clears the hash, releases the page scroll lock, restores the previous scroll position and returns focus to the tile that launched the game.
- The catalogue behind the player is made `inert`, and Tab is trapped inside the player while it is open. The catalogue `/` search shortcut and ArrowLeft/ArrowRight shelf shortcuts are suspended while the player is open.
- Favourites are one store: the player heart, the card hearts and the "My favourites" count stay in sync, and favourites saved in the player survive reload (localStorage).

## Frame rules

```html
<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
        allow="fullscreen; autoplay; gamepad" allowfullscreen referrerpolicy="no-referrer">
```

No `allow-popups`, no `allow-top-navigation`, no `allow-top-navigation-by-user-activation`, no `allow-modals`, no `allow-downloads`. Chrome logs two informational warnings about this combination ("allow-scripts with allow-same-origin", and `allow` taking precedence over `allowfullscreen`); both are expected given the requested token set.

Honesty rules the UI follows:

- A frame `load` event means the host page loaded. Status then says "Halo: Combat Evolved game page opened. If it stays blank, use Restart game." It never says verified, ready, playable or working.
- No load event within 20 s (`window.__GAMEFLEX_PLAYER_TIMEOUT_MS` overrides this for automated tests) shows "did not finish loading" with Restart game and Back to games — never an external link.
- A note under the stage offers Restart game if the screen stays blank and explains that some ports may not run here yet.
- Framing permission is not inferred from a missing `X-Frame-Options`. `dist/player-config.json` is the decision record.
- Games the player cannot host keep their catalogue entry and explain themselves in place: `wasmarcade` is `unavailable` because that host's terms expressly prohibit embedding ("WASM Arcade's own terms prohibit embedding their pages, so gameflex can't load it in this player"). No off-site link is offered for it.
- The other 15 games are `iframe` mode: the user asked for iframe previews, and iframe compatibility is **not** verified gameplay. Several may still fail to run inside a frame.
- The combined release preserves the separately published 21 DOS listings and 11-slide carousel. `availability: sandbox-pending` overrides the player config and opens an internal blocked explanation. Listing approval cannot enable an iframe or remote session. The carousel CTA follows the selected slide.

## player-config.json

```json
{ "version": 1, "remote": { "enabled": false, "apiBase": "" },
  "games": { "halo": { "mode": "iframe" },
             "wasmarcade": { "mode": "unavailable", "reason": "…" } } }
```

`mode` is `iframe` or `unavailable`; any other value, a missing entry, or an unreadable config fails closed to the blocked panel.

## Remote session support (prototype, disabled)

Client code exists for a relay-streamed session, but the shipped config has `remote.enabled: false`, so **this build talks to no backend and claims no live service**. When enabled with an HTTPS `apiBase` (loopback HTTP is accepted for dev only):

- `POST {apiBase}/api/sessions` with `{gameId}` must return `{id, token, wsUrl, expiresAt}`; the response is shape-checked and a non-HTTPS/non-loopback `wsUrl` is rejected.
- Frames arrive as `{type:'frame', data:<base64 JPEG>, width, height}` and are drawn to a canvas; unknown types, non-base64 payloads and oversized payloads are ignored. This prototype has no audio path: nothing in the UI or the protocol mentions sound.
- Input is sent as `{type:'input', event:{…}}` with `kind: mouse` (`mouseMoved|mousePressed|mouseReleased`, `x`, `y`, `button`), `kind: key` (`keyDown|keyUp`, `key`, `code`) or `kind: wheel` (`x`, `y`, `deltaX`, `deltaY`).
- **The owner key is loopback-only.** The field is rendered, and the `X-Gameflex-Key` header is sent, only when both `location.hostname` and the configured `apiBase` hostname are loopback (`127.0.0.1`, `localhost`, `::1`). A non-loopback HTTPS broker is still reachable through "Remote session", but it is contacted without the key — the ready panel says the key is only offered for a relay on this machine. The key never touches `localStorage`, `sessionStorage` or the config file; it lives in the input field and, for an in-flight create, on the pending session record. A future authenticated broker needs its own identity flow, not this shared key.
- **Exit with a create still in flight**: keep the request alive under its own 60-second timeout, allowing for the measured cold container startup. If a response arrives after exit, the generation guard deletes the returned session instead of displaying it. Once an id exists, exit closes the socket and deletes the session immediately. A timed-out create is aborted; the gateway removes creations whose caller disconnected, and its TTL provides a further lifecycle bound. Tests override the timeout using `window.__GAMEFLEX_REMOTE_CREATE_TIMEOUT_MS`.
- Every launch carries a generation token; stale load, socket and fetch callbacks are discarded after restart or exit.
- The stream is presented as a preview. Relative mouse movement, latency and frame rate are **not** promised anywhere in the UI or here.

## Accessibility and mobile

`role="dialog"`, `aria-modal="true"`, labelled by the game title, focus moved into the player on open and returned on close, Tab trapped, `Escape` closes, and every state change is announced through a `role="status"` live region. Buttons keep 44 px touch targets; the bar wraps, the stage fills the viewport width and the player has no horizontal overflow at 390 px.

## Verification

`npm run test:browser` (`node scripts/browser-qa.mjs`) passes 24 checks across catalogue regression and the player: pixel wordmark, readable text, one-card shelf stepping, favourites, search, filters, details, internal launch paths, sandbox attributes, restart/timeout/exit cleanup, focus and scroll restore, history, hostile IDs, unavailable games, mobile layout and fullscreen. A local HTTP/WebSocket relay fixture also verifies owner-key restrictions, frame bounds, forwarded input, session deletion, late-create cleanup and timeout. The deliberately rejected owner key produces one expected HTTP 401 console message; no unexpected console errors or popups occur.

Every non-loopback request in that run is answered by a local fixture page (`GAMEFLEX QA FIXTURE`), and the suite asserts the fixture is what the frame rendered. **No real game host was contacted and no gameplay was verified by this suite.** Interception, sandboxing, routing, status wording and cleanup are what it proves.

Real-host observations are recorded separately in `iframe-audit.md`: 15 iframe documents observed, one host skipped because its terms prohibit embedding. These observations do not establish gameplay, mobile/touch behaviour on real devices, or future host availability. The separate remote-service PR records real Docker streaming smoke tests for Quake and Quake 3; the frontend suite uses a mock, and hosted remote streaming remains disabled.

## Release checks

- `npm run check` syntax-checks both frontend modules and validates all 37 catalogue entries.
- `npm run test:research` verifies both review gates and confirms the live catalogue remains unchanged.
- The local preview server serves JavaScript modules and PNG/WebP artwork with their correct MIME types.
- `artifacts/qa/` holds the run report and desktop/mobile screenshots.
- `npm run test:catalogue` verifies the combined 37-listing catalogue, 11 slides, pending DOS flows, covers and responsive layout. `npm run test:catalogue-gate` confirms listing approval cannot enable gameplay.
