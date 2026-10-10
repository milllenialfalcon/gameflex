# Iframe compatibility audit

Generated 2026-10-10T08:03:37.665Z by hermes:gameflexqa (scripts/iframe-audit.mjs). Bounded automated observation of every published catalogue destination inside a sandboxed cross-origin frame. Source evidence: `docs/iframe-audit.json`; screenshots and raw console logs in the git-ignored `artifacts/iframe-audit/`.

## What this does and does not establish

- Establishes: whether the remote page produced a document ("frame document observed"), and what the frame reported about loading, console security messages, failed requests and asset volume inside a 12s budget.
- Does **not** establish: gameplay. A visible loader, launch page or canvas is not proof a game is playable. No human play was performed.
- Does **not** infer permission. Cross-origin frame. Harness served from 127.0.0.1, games are remote https origins. The standalone harness mirrors the player sandbox and permission configuration.
- User review remains **pending** for every entry. Nothing here is assistant or user verification of a review decision.

## Method

- Harness: http://127.0.0.1:4174 with sandbox `allow-scripts allow-same-origin allow-forms allow-pointer-lock` and iframe `allow="fullscreen; autoplay; gamepad"`, one cross-origin frame per game, viewport 1360x820, frame box 1280x720.
- Browser: Microsoft Edge (headless) 155.0.4283.45 (headless, no GPU), launched through bundled Playwright.
- Budget: 12000 ms per page, concurrency 3, asset budget 50 MB per session (enforcement NOT active for this run: the budget was measured, not enforced, so cancellation is not established).
- Asset byte figures: Bytes are estimates: the sum of declared response Content-Length headers, cross-checked against Playwright request.sizes() responseBodySize, reported as the larger of the two. These are not measured transferred bytes — compressed, chunked or header-less responses are missed, WebSocket traffic is not counted, and the same bytes may be counted once per observed response.
- Budget enforcement correction: enforcement was configured for this run but did not fire — the route guard tested a state flag that the byte counter never set, so no request was aborted once the budget estimate was passed. Fixed afterwards in `scripts/iframe-audit.mjs` (the state flag is now set, plus a pre-body guard that refuses known large-asset resources as the remaining budget runs down). An actual rerun is required before any enforcement claim can be made for the real hosts.
- 0 clicks were performed: no account creation, no proprietary file supply, no consent dialogs.
- Permission handling: fullscreen, autoplay, gamepad were requested through Playwright's `grantPermissions`, which rejects these names as unknown; enforcement came from the iframe `allow` attribute plus the `--autoplay-policy=no-user-gesture-required` launch flag. Recorded per game as `permissionsGrant`.

## Summary

- frame_document_observed: 15
- skipped_terms: 1
- sessions that exceeded the 50 MB asset budget: surf, skate (estimate; enforcement inactive for this run — cancellation not established)
- gameplay confirmed: none (No entry can appear here from this audit alone. Gameplay requires a human observer; user review remains pending.)

## Results

| id | classification | frame doc | DOM (elements/visible/canvas) | MB (est.) | sec/wasm/fail | own-file prompt | visual tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| halo | frame_document_observed | yes | 444 el / 107 vis / 1 canvas | 2.1 | 0 / 0 / 0 | yes | canvas_present_static |
| bo1 | frame_document_observed | yes | 82 el / 30 vis / 0 canvas | 0.5 | 0 / 0 / 0 | no | page_ui_observed |
| quake3 | frame_document_observed | yes | 286 el / 126 vis / 0 canvas | 9.8 | 1 / 0 / 0 | yes | page_ui_observed |
| surf | frame_document_observed | yes | 872 el / 183 vis / 1 canvas | 52.3 | 0 / 0 / 0 | no | canvas_present_and_changing |
| quake | frame_document_observed | yes | 139 el / 113 vis / 0 canvas | 0.1 | 1 / 0 / 0 | yes | page_ui_observed |
| quake2 | frame_document_observed | yes | 116 el / 93 vis / 0 canvas | 0.1 | 1 / 0 / 0 | yes | page_ui_observed |
| rtcw | frame_document_observed | yes | 137 el / 105 vis / 0 canvas | 12.1 | 1 / 0 / 0 | yes | page_ui_observed |
| urbanterror | frame_document_observed | yes | 136 el / 106 vis / 0 canvas | 8.8 | 1 / 0 / 0 | yes | page_ui_observed |
| webxash | frame_document_observed | yes | 63 el / 53 vis / 1 canvas | 0.1 | 0 / 0 / 0 | yes | canvas_present_static |
| halomobile | frame_document_observed | yes | 773 el / 199 vis / 2 canvas | 0.7 | 0 / 0 / 0 | yes | canvas_present_static |
| pes6 | frame_document_observed | yes | 404 el / 106 vis / 1 canvas | 20.1 | 0 / 0 / 3 | yes | canvas_present_static |
| skate | frame_document_observed | yes | 73 el / 21 vis / 1 canvas | 2244.9 | 0 / 0 / 7 | no | canvas_present_static |
| vicecity | frame_document_observed | yes | 190 el / 109 vis / 1 canvas | 16.1 | 0 / 9 / 2 | yes | canvas_present_static |
| simpsons | frame_document_observed | yes | 35 el / 7 vis / 1 canvas | 47.7 | 0 / 0 / 0 | no | canvas_present_static |
| diablo | frame_document_observed | yes | 93 el / 54 vis / 1 canvas | 0.3 | 0 / 0 / 0 | yes | canvas_present_static |
| wasmarcade | skipped_terms | no | — | — | 0 / 0 / 0 | no | — |

## Per-game evidence

### halo — Halo: Combat Evolved

- URL: https://mitchellhynes.com/halo/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (444 elements, 107 visible, 1 canvas)
- Frame destination: https://mitchellhynes.com/halo/halo.html
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 444 elements, 107 visible, 1 canvas (1280x720), 1 file input(s), WebAssembly present
- Visual tier: canvas_present_static — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: false
- Own-file prompt: detected (1 file input(s)) — catalogue flags ownFiles for this entry
- Notable behaviour: cross_origin_isolation_required ("Muted Focus game Game settings Made by Mitchell Hynes. Learn more Click the game or Focus …"); http_auth_or_limit_error ("Failed to load resource: the server responded with a status of 403 ()")
- Hosts contacted: 4 distinct
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 2.07 MB over 28 responses
- Screenshot: artifacts/iframe-audit/halo.png (git-ignored, not embedded)
- Timings: harness commit 23 ms, frame observed 238 ms, observation 10601 ms, total 12078 ms

### bo1 — Black Ops Zombies

- URL: https://vel.gg/bo1z
- Classification: frame_document_observed — document rendered inside the sandboxed frame (82 elements, 30 visible, 0 canvas)
- Frame destination: https://vel.gg/bo1z
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 82 elements, 30 visible, 0 canvas (none sized), 0 file input(s), WebAssembly present
- Visual tier: page_ui_observed — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: false
- Own-file prompt: not observed
- Notable behaviour: none matched
- Hosts contacted: 3 distinct
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 0.46 MB over 35 responses
- Screenshot: artifacts/iframe-audit/bo1.png (git-ignored, not embedded)
- Timings: harness commit 37 ms, frame observed 237 ms, observation 10660 ms, total 12218 ms

### quake3 — Quake III Arena

- URL: https://q3.pieter.com/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (286 elements, 126 visible, 0 canvas)
- Frame destination: https://q3.pieter.com/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 286 elements, 126 visible, 0 canvas (none sized), 0 file input(s), WebAssembly present
- Visual tier: page_ui_observed — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: true
- Own-file prompt: detected (/browse/i)
- Notable behaviour: cross_origin_focus_blocked ("Blocked autofocusing on a <input> element in a cross-origin subframe.")
- Hosts contacted: 5 distinct
- Console security matches: 1; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 9.82 MB over 5 responses
- Screenshot: artifacts/iframe-audit/quake3.png (git-ignored, not embedded)
- Timings: harness commit 33 ms, frame observed 237 ms, observation 10601 ms, total 12147 ms

### surf — CS Surf

- URL: https://surfd.net/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (872 elements, 183 visible, 1 canvas); session asset budget exceeded at 52 MB (estimate) — cancellation not established
- Frame destination: https://surfd.net/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 872 elements, 183 visible, 1 canvas (300x150), 0 file input(s), WebAssembly present
- Visual tier: canvas_present_and_changing — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: true, element delta 0, body text changed: false
- Own-file prompt: not observed
- Notable behaviour: account_or_signin_ui ("surfd. Surf the web. Play surf Records Settings Sign in Discord ↗ Practice facility Free t…")
- Hosts contacted: 2 distinct
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 52.28 MB (estimate) over 20 responses — exceeded the 50 MB budget; enforcement inactive, cancellation not established
- Screenshot: artifacts/iframe-audit/surf.png (git-ignored, not embedded)
- Timings: harness commit 21 ms, frame observed 228 ms, observation 1995 ms, total 5275 ms
- Limitations: asset budget exceeded: 52 MB (estimate) against the 50 MB budget; enforcement was inactive for this run so the page was not actually prevented from continuing — cancellation not established, and the observed document state is an early snapshot

### quake — Quake

- URL: https://q1.pieter.com/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (139 elements, 113 visible, 0 canvas)
- Frame destination: https://q1.pieter.com/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 139 elements, 113 visible, 0 canvas (none sized), 0 file input(s), WebAssembly present
- Visual tier: page_ui_observed — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta -1, body text changed: true
- Own-file prompt: detected (/browse/i)
- Notable behaviour: cross_origin_focus_blocked ("Blocked autofocusing on a <input> element in a cross-origin subframe.")
- Hosts contacted: 5 distinct
- Console security matches: 1; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 0.14 MB over 7 responses
- Screenshot: artifacts/iframe-audit/quake.png (git-ignored, not embedded)
- Timings: harness commit 23 ms, frame observed 224 ms, observation 10648 ms, total 12093 ms

### quake2 — Quake II

- URL: https://q2.pieter.com/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (116 elements, 93 visible, 0 canvas)
- Frame destination: https://q2.pieter.com/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 116 elements, 93 visible, 0 canvas (none sized), 0 file input(s), WebAssembly present
- Visual tier: page_ui_observed — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: true
- Own-file prompt: detected (/browse/i)
- Notable behaviour: cross_origin_focus_blocked ("Blocked autofocusing on a <input> element in a cross-origin subframe.")
- Hosts contacted: 5 distinct
- Console security matches: 1; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 0.06 MB over 7 responses
- Screenshot: artifacts/iframe-audit/quake2.png (git-ignored, not embedded)
- Timings: harness commit 33 ms, frame observed 233 ms, observation 10670 ms, total 12046 ms

### rtcw — Return to Castle Wolfenstein

- URL: https://rtcw.pieter.com/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (137 elements, 105 visible, 0 canvas)
- Frame destination: https://rtcw.pieter.com/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 137 elements, 105 visible, 0 canvas (none sized), 0 file input(s), WebAssembly present
- Visual tier: page_ui_observed — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: true
- Own-file prompt: detected (/browse/i)
- Notable behaviour: cross_origin_focus_blocked ("Blocked autofocusing on a <input> element in a cross-origin subframe.")
- Hosts contacted: 5 distinct
- Console security matches: 1; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 12.15 MB over 5 responses
- Screenshot: artifacts/iframe-audit/rtcw.png (git-ignored, not embedded)
- Timings: harness commit 32 ms, frame observed 243 ms, observation 10785 ms, total 12165 ms

### urbanterror — Urban Terror

- URL: https://ut.pieter.com/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (136 elements, 106 visible, 0 canvas)
- Frame destination: https://ut.pieter.com/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 136 elements, 106 visible, 0 canvas (none sized), 0 file input(s), WebAssembly present
- Visual tier: page_ui_observed — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 1, body text changed: true
- Own-file prompt: detected (/browse/i)
- Notable behaviour: cross_origin_focus_blocked ("Blocked autofocusing on a <input> element in a cross-origin subframe.")
- Hosts contacted: 5 distinct
- Console security matches: 1; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 8.79 MB over 8 responses
- Screenshot: artifacts/iframe-audit/urbanterror.png (git-ignored, not embedded)
- Timings: harness commit 23 ms, frame observed 227 ms, observation 10717 ms, total 12163 ms

### webxash — Half-Life / Counter-Strike 1.6

- URL: https://x8bitrain.github.io/webXash/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (63 elements, 53 visible, 1 canvas)
- Frame destination: https://x8bitrain.github.io/webXash/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 63 elements, 53 visible, 1 canvas (300x150), 1 file input(s), WebAssembly present
- Visual tier: canvas_present_static — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: false
- Own-file prompt: detected (1 file input(s)) — catalogue flags ownFiles for this entry
- Notable behaviour: none matched
- Hosts contacted: 2 distinct
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 0.06 MB over 4 responses
- Screenshot: artifacts/iframe-audit/webxash.png (git-ignored, not embedded)
- Timings: harness commit 35 ms, frame observed 235 ms, observation 10739 ms, total 12118 ms

### halomobile — Halo CE Mobile

- URL: https://hcemobile.com/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (773 elements, 199 visible, 2 canvas)
- Frame destination: https://hcemobile.com/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 773 elements, 199 visible, 2 canvas (300x150, 300x150), 3 file input(s), WebAssembly present
- Visual tier: canvas_present_static — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: false
- Own-file prompt: detected (/browse/i) — catalogue flags ownFiles for this entry
- Notable behaviour: app_install_prompt ("ESPAÑOL COMBAT EVOLVED · ON YOUR PHONE HALO CE MOBILE Install the app to play full screen,…")
- Hosts contacted: 3 distinct
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 0.71 MB over 29 responses
- Screenshot: artifacts/iframe-audit/halomobile.png (git-ignored, not embedded)
- Timings: harness commit 34 ms, frame observed 246 ms, observation 10647 ms, total 12274 ms

### pes6 — PES 6

- URL: https://pes6.optijuegos.net/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (404 elements, 106 visible, 1 canvas)
- Frame destination: https://pes6.optijuegos.net/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 404 elements, 106 visible, 1 canvas (480x272), 3 file input(s), WebAssembly present
- Visual tier: canvas_present_static — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: false
- Own-file prompt: detected (3 file input(s))
- Notable behaviour: none matched
- Hosts contacted: 11 distinct, ad-like: pagead2.googlesyndication.com, googleads.g.doubleclick.net
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 3
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 20.14 MB over 17 responses
- Screenshot: artifacts/iframe-audit/pes6.png (git-ignored, not embedded)
- Timings: harness commit 37 ms, frame observed 237 ms, observation 10714 ms, total 12137 ms

### skate — Skate 3 — Fan Game

- URL: https://skate.aaddpp.lol/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (73 elements, 21 visible, 1 canvas); session asset budget exceeded at 2245 MB (estimate) — cancellation not established
- Frame destination: https://skate.aaddpp.lol/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 73 elements, 21 visible, 1 canvas (300x150), 0 file input(s), WebAssembly present
- Visual tier: canvas_present_static — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: false
- Own-file prompt: not observed — catalogue flags ownFiles for this entry
- Notable behaviour: none matched
- Hosts contacted: 4 distinct
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 7
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 2244.89 MB (estimate) over 28 responses — exceeded the 50 MB budget; enforcement inactive, cancellation not established
- Screenshot: artifacts/iframe-audit/skate.png (git-ignored, not embedded)
- Timings: harness commit 22 ms, frame observed 222 ms, observation 2623 ms, total 4046 ms
- Limitations: asset budget exceeded: 2245 MB (estimate) against the 50 MB budget; enforcement was inactive for this run so the page was not actually prevented from continuing — cancellation not established, and the observed document state is an early snapshot

### vicecity — GTA: Vice City

- URL: https://joncodeofficial.github.io/gta-vice-city-wasm/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (190 elements, 109 visible, 1 canvas)
- Frame destination: https://joncodeofficial.github.io/gta-vice-city-wasm/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 190 elements, 109 visible, 1 canvas (300x150), 3 file input(s), WebAssembly present
- Visual tier: canvas_present_static — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: false
- Own-file prompt: detected (/browse/i, /\.tar\.gz/i) — catalogue flags ownFiles for this entry
- Notable behaviour: none matched
- Hosts contacted: 2 distinct
- Console security matches: 0; WebAssembly/worker/network matches: 9; failed requests: 2
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 16.07 MB over 20 responses
- Screenshot: artifacts/iframe-audit/vicecity.png (git-ignored, not embedded)
- Timings: harness commit 23 ms, frame observed 226 ms, observation 10696 ms, total 12104 ms

### simpsons — The Simpsons: Hit & Run

- URL: https://shar-wasm.cjoseph.workers.dev/?skipmovie
- Classification: frame_document_observed — document rendered inside the sandboxed frame (35 elements, 7 visible, 1 canvas)
- Frame destination: https://shar-wasm.cjoseph.workers.dev/?skipmovie
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 35 elements, 7 visible, 1 canvas (300x150), 0 file input(s), WebAssembly present
- Visual tier: canvas_present_static — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: false
- Own-file prompt: not observed
- Notable behaviour: none matched
- Hosts contacted: 2 distinct
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 47.71 MB over 92 responses
- Screenshot: artifacts/iframe-audit/simpsons.png (git-ignored, not embedded)
- Timings: harness commit 23 ms, frame observed 236 ms, observation 10751 ms, total 12042 ms

### diablo — Diablo

- URL: https://johnimril.github.io/diablo_web/
- Classification: frame_document_observed — document rendered inside the sandboxed frame (93 elements, 54 visible, 1 canvas)
- Frame destination: https://johnimril.github.io/diablo_web/
- Document HTTP status observed in frame: 200; preflight: status 200, no X-Frame-Options
- DOM sample: 93 elements, 54 visible, 1 canvas (640x480), 1 file input(s), WebAssembly present
- Visual tier: canvas_present_static — Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.
- Runtime activity over ~1.2s: canvas sizes changed: false, element delta 0, body text changed: false
- Own-file prompt: detected (/browse/i, /\.mpq\b/i) — catalogue flags ownFiles for this entry
- Notable behaviour: none matched
- Hosts contacted: 2 distinct
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: 0.25 MB over 4 responses
- Screenshot: artifacts/iframe-audit/diablo.png (git-ignored, not embedded)
- Timings: harness commit 20 ms, frame observed 229 ms, observation 10799 ms, total 12341 ms

### wasmarcade — WASM Arcade

- URL: https://wasmarcade.com/pc-games
- Classification: skipped_terms — Publisher terms explicitly prohibit embedding their pages; no frame navigation attempted. Recorded from the pinned player configuration, not re-tested.
- Frame destination: (no frame document observed)
- Document HTTP status observed in frame: not observed; preflight: not run
- DOM sample: not reachable
- Visual tier: unknown — 
- Runtime activity over ~1.2s: not sampled
- Own-file prompt: not observed
- Notable behaviour: none matched
- Hosts contacted: not tracked
- Console security matches: 0; WebAssembly/worker/network matches: 0; failed requests: 0
- Popups blocked: 0; downloads blocked: 0; top-navigation attempts: 0; clicks performed: 0
- Asset bytes observed: —
- Screenshot: not captured (git-ignored, not embedded)
- Timings: harness commit — ms, frame observed — ms, observation — ms, total — ms
