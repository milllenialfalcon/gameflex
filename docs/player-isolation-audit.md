# Embedded player compatibility — 2026-10-12

Hermes `gameflexresearch` / `opencode-go` / `deepseek-v4.1-flash` audited all 15 configured iframe destinations with ordinary GET requests and inspected selected first-party launch code. Invocation root: D:\AI\Gameflex. The primary agent reviewed the findings and ran bounded Edge browser probes. No game data, catalogue approvals or remote-service activation changed.

## Findings

- The published Gameflex document sends neither COOP nor COEP. Edge reports `crossOriginIsolated === false` and `typeof SharedArrayBuffer === 'undefined'`.
- BO1 Zombies: https://vel.gg/bo1z/capabilities.js contains the user's exact shared-memory error. https://vel.gg/bo1z/play.js maps the error to “Unsupported browser”. This is an embedding prerequisite failure, not evidence that the visitor's browser is obsolete. The host sends COOP same-origin, COEP require-corp and CORP same-origin. Its further requirements include JSPI, WASM threads/SIMD, OPFS/locks, OffscreenCanvas and WebGL2. Fixing shared memory alone does not establish playability.
- Halo CE Mobile: launch code checks cross-origin isolation and reports “Threads: unavailable”. In the live embedded page Edge displayed that message with no SharedArrayBuffer. The launch response lacked COOP/COEP; its service-worker behaviour requires further investigation. Own game files are also required.
- The Simpsons: its host sends COOP/COEP and its audio code requires SharedArrayBuffer. The live frame reported no SharedArrayBuffer. A Play screen is not evidence that gameplay or audio works.
- Other destinations: absence of an isolation indicator in the inspected code is inconclusive. No HTTP success or iframe load event is treated as gameplay evidence.

## Primary review of the worker's advice

COOP is relevant to the top-level browsing context; an iframe's own COOP header alone does not isolate a non-isolated ancestor. Cross-origin embedded contexts additionally need compatible COEP and explicit `cross-origin-isolated` delegation. Do not interpret the raw worker report as saying every child must independently send top-level COOP, or that adding delegation alone repairs isolation.

A controlled localhost probe served an isolated top-level document and delegated `cross-origin-isolated` to sandboxed frames. The probe did not establish compatible embedding; BO1 specifically rejected the request with `ERR_BLOCKED_BY_RESPONSE`. This is a prerequisite/embedding probe, not gameplay. Consequently no blanket COOP/COEP, credentialless iframe, response-header stripping, or unsupported static `_headers` deployment is being shipped as a claimed fix.

Next engineering step for affected titles: a separately validated Gameflex-controlled isolated player route with real response headers and compatible destination responses, a permitted independently hosted runtime, or the production remote runner. Keep launches inside Gameflex. Do not proxy third-party content to remove security policies. Do not enable the existing local streaming prototype on the public site.

Sources: [MDN crossOriginIsolated](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated), [MDN iframe credentialless](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/IFrame_credentialless), [BO1 capability check](https://vel.gg/bo1z/capabilities.js), [Halo Mobile](https://hcemobile.com/), [The Simpsons port](https://shar-wasm.cjoseph.workers.dev/?skipmovie).

## Layout boundary

The old live player at 1366×768 gave its stage approximately 1240×508 with a 139px top offset. The Quake launch page inside that frame had a 1090px document height against a 506px frame viewport. A compact Gameflex wrapper can give the game more room; it cannot restyle another origin's landing page or promise to remove every internal scrollbar. Do not clip hosted content or disable its scrolling to disguise overflow.
