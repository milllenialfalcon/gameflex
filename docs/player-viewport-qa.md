# Compact player review — 2026-10-12

Based on published source c1dc7f5; isolated branch fix/player-viewport. Hermes gameflex / opencode-go / deepseek-v4.1-flash implemented the assigned player files from D:\AI\Gameflex. The primary agent reviewed and corrected responsive sizing, focus handling, tests and an initial about:blank load race. Catalogue data and approval decisions are unchanged.

## Result

The player owns the viewport. Its iframe fills the remaining space with no outer player scroll, margins or always-visible metadata panel. Notes opens as a separate scrolling overlay, starts closed and closes on Escape before the player. Focus returns to its trigger; the game view is inert while Notes is open. Desktop toolbar: 61px. Portrait phones: 107px over two rows. Landscape 844x390: 55px over one row. Touch controls retain at least 44px targets. Requirements remain available before starting via Notes and the existing catalogue details.

At 1366x768, game stage height increased from approximately 508px on the previous live wrapper to 707px. At 390x844 it is 737px; at 844x390 it is 335px; at 320x568 it is 461px.

## Validation

- npm run check: syntax and all 54 catalogue records pass.
- scripts/player-viewport-qa.mjs: 10 check groups pass in Edge at five viewports, including resize, Notes scroll/focus, fullscreen entry/exit, retry/blocked states and no popups or console errors.
- scripts/browser-qa.mjs: 24 groups pass, including history, restart, sandbox attributes, favourites, mobile, hostile hashes and the disabled remote prototype against a local mock.
- npm run test:library: 9 checks pass.
- npm run test:discovery: 11 checks pass.
- Screenshots reviewed for desktop, portrait phone and Notes in landscape.

These suites intercept game-host requests with deterministic fixtures. They prove the player layout and behaviour, not real gameplay, game audio, saves or cross-origin compatibility. Third-party landing pages can still scroll inside the iframe. Shared-memory failures remain unresolved; see player-isolation-audit.md for reviewed live probes and next steps. Remote streaming remains disabled; no external-tab fallback exists.
