# EmulatorJS integration plan

Planned 2026-10-12 by Claude (Opus 5.5). Branch `feat/emulatorjs`, cut from `fix/player-viewport` (PR #14, `959125d`). Retarget the PR when #14 merges.

Goal: a third player mode, `emulator`, that runs retro console games on the visitor's device inside the Gameflex player. It uses a self-hosted, pinned EmulatorJS. It is tested against legally redistributable ROMs and a bring-your-own-file option.

## Decisions

1. **Self-host, pinned.** EmulatorJS `4.2.3` (GPL-3.0) and its cores come from the npm registry tarballs (`@emulatorjs/emulatorjs`, `@emulatorjs/core-*`). Before extraction, check each tarball's `dist.integrity` against `emulator/emulatorjs-lock.json`. Files go under `dist/emulator/ejs/4.2.3/`. Do not use the EmulatorJS CDN at runtime.
2. **Phase-1 cores, non-threaded WASM only:** `fceumm` (NES), `gambatte` (GB/GBC), `mgba` (GBA), `genesis_plus_gx` (Mega Drive / Master System / Game Gear), `snes9x` (SNES). Ship only `*-wasm.data`; drop the `thread` and `legacy` variants. The site is not cross-origin isolated (`docs/player-isolation-audit.md`), so threaded cores would fail. That is about 5 MB of cores plus about 2 MB of runtime.
3. **The host page is our own page.** `dist/emulator/play.html?id=<catalogue-id>` runs EmulatorJS. The player loads it in a same-origin iframe with `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`. It does not get `allow-forms`, popups or top navigation, and the existing `fullscreen; autoplay; gamepad` permissions still apply. A same-origin frame with scripts plus same-origin is **not** a security boundary. The boundary is that every byte comes from our pinned files and the page has a strict CSP. Say this plainly in the docs.
4. **CSP on `play.html` (meta tag):** start from `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; base-uri 'none'; form-action 'none'`. Only loosen it to what EmulatorJS 4.2.3 is measured to need, and record each loosening with the reason. Never allow a non-self origin. Blocking other origins is how we turn off the CDN fallback, version checks, netplay (`socket.io`) and ad slots. Also leave `EJS_netplayServer` and `EJS_AdUrl` unset.
5. **The ROM is resolved from config, never from the URL.** `play.html` reads only `id` and fetches the same-origin `player-config.json` itself. It takes `rom`, `core` and `sha256` from there, checks the ROM with `crypto.subtle.digest('SHA-256')` before starting the emulator, and refuses to run on a mismatch. An unknown or invalid id shows an in-frame error panel. It never opens a new tab.
6. **Config schema** (`dist/player-config.json`):
   ```json
   "nes-example": { "mode": "emulator", "system": "nes", "core": "fceumm",
                    "rom": "emulator/roms/example.nes", "sha256": "<hex>", "licence": "<SPDX or short name>" }
   ```
   `player.mjs` `entryFor()` returns `{ mode: 'emulator' }`, and `sandbox-pending` still wins. Bump `version` to 2. Unknown modes stay unavailable.
7. **Bring your own cartridge (phase 1b, behind config flag `emulator.localFiles`).** Add one listing, "Your cartridge". Inside `play.html`, the visitor picks a system and a file. Only files on that system's extension allowlist are accepted, with a 64 MB cap. The file is read with `URL.createObjectURL`, never uploaded, and revoked on exit. It is not hashed against anything because it is the visitor's own file. Copy: "Your file stays on this device."
8. **Saves:** EmulatorJS uses IndexedDB, on the same origin, keyed per game id. Save states are local only, which matches the favourites policy. Restart and exit tear the frame down, so no audio keeps playing after exit.
9. **Player lifecycle:** reuse the generation/teardown pattern from `startFrame()`. `play.html` sends `{type:'gameflex-emulator', state:'started'|'error', message}` through `postMessage` to `parent` with an explicit target origin. The player accepts the message only from `event.source === frame.contentWindow` and the same origin. A `started` message comes from `EJS_onGameStart`. It means the emulator booted the ROM. It is not gameplay verification.
10. **Licences:** add `dist/emulator/NOTICE.md` with the EmulatorJS GPL-3.0 text and a source link for the exact version (we redistribute unmodified npm tarballs). Add each core's licence file. `snes9x` and `genesis_plus_gx` carry **non-commercial** terms. Before any monetisation, those cores need review or a replacement. Record this beside the ad/monetisation rule.

## ROM policy

The site is public (gameflex.lol). We bundle **only** ROMs whose licence explicitly permits redistribution: homebrew, open-source or public-domain titles and test suites. **No commercial ROMs, whether we own copies or not.** Commercial games are reachable only through bring-your-own-file. A ROM's licence is not inferred from its being downloadable.

Flow: Hermes `gameflexresearch` writes candidates to `research/emulator-roms.json` and `.md`, with source URL, author, licence text and URL, system and SHA-256. Downloads go only to the ignored `artifacts/roms/`. Claude does the assistant verification of licence evidence. **The user verifies explicitly** before any ROM is copied to `dist/emulator/roms/` or listed in `dist/games.json`. Target: 2 ROMs per phase-1 system. Where licensed, include one deterministic test ROM such as the 240p Test Suite, to give a stable boot check.

## Verification

`scripts/emulator-qa.mjs` (Playwright and Edge, following `browser-qa.mjs`) runs these checks for each configured ROM and for every candidate in `artifacts/roms/`:

- `play.html` loads with **zero** requests to non-self origins (assert from `page.on('request')`), and the console shows no CSP violation.
- The `started` message arrives within 30 s.
- The canvas is not blank, and frames change between two samples 2 s apart. Measure this with pixel variance, not file size.
- An input is injected through the configured keyboard map (Start/Enter), and a screenshot is captured before and after it. The change is recorded and is not asserted.
- Exit removes the frame, and no `AudioContext` survives.
- A bad SHA-256, an unknown id, a missing core or a ROM that is too large each produce the in-frame error panel and no frame leak.

Results go to `docs/emulator-verification.json` and `.md` with versions, browser and date. The automation proves "boots and renders". The user confirms playability by hand before publication. `check-catalog.mjs` gains checks for emulator entries: the ROM exists, the SHA-256 matches, the core is vendored, a licence is recorded and the system/core pair is valid.

## Work split

| Step | Owner | Files (exclusive) | Depends on |
|---|---|---|---|
| P0 Plan, branch, Trello card | Claude | `docs/emulatorjs-plan.md` | — |
| H1 Vendor and host page | Hermes `gameflex` | `scripts/fetch-emulatorjs.mjs`, `emulator/emulatorjs-lock.json`, `dist/emulator/**` (not `roms/`), `docs/emulator.md` | P0 |
| H2 ROM research | Hermes `gameflexresearch` | `research/emulator-roms.json`, `research/emulator-roms.md`, `artifacts/roms/` | P0 (parallel with H1) |
| H3 Player mode, QA and catalogue checks | Hermes `gameflex` | `dist/player.mjs`, `dist/player-config.json`, `scripts/emulator-qa.mjs`, `scripts/check-catalog.mjs`, `package.json` scripts, `docs/emulator-verification.*` | H1, H2 |
| Review | Claude | fixes as needed | H3 |
| ROM approval | User | — | Review |
| Listing UI, Sites integration and publish | Codex | listing/UI files, Sites config | User approval |

Codex's Sites job covers several checks. It must confirm that Sites packaging of `dist/` serves `.data`, `.wasm` and `.js` with usable MIME types and sizes, and does not mangle binary files. It must confirm the meta CSP survives packaging. It deploys the reviewed commit to the private review build first, runs `emulator-qa.mjs` against that URL, and promotes to gameflex.lol only after the user approves. Workers do not commit, push, publish or touch Trello.

## Out of scope for phase 1

Threaded cores and cross-origin isolation; PS1/N64/DS (BIOS or heavier cores); netplay; cloud saves; any commercial ROM hosting; ads.
