# EmulatorJS in gameflex — vendored runtime, host page, CSP

H1 of `docs/emulatorjs-plan.md` (vendor tree, `dist/emulator/play.html`, CSP), extended by H3
(player mode, hosted listings, test shelf, QA). Branch `feat/emulatorjs`. This document covers the
vendored EmulatorJS tree, the cores that are in it and why, `dist/emulator/play.html`, its CSP, how
to refresh the vendor tree, and what has and has not been verified.

The player-side work (`mode: 'emulator'` in `dist/player.mjs`, `dist/player-config.json`,
`scripts/check-catalog.mjs`, `scripts/emulator-qa.mjs`) is described here too, because the two halves
are one feature.

## What is here

```
scripts/fetch-emulatorjs.mjs        vendor script: fetch, verify, extract, check
scripts/emulator-qa.mjs             QA: boots every listing in Chrome, Edge and Firefox, plus
                                    simulated-gamepad scenarios on the hosted NES/SNES/GBA titles
scripts/serve.mjs                   dev server; --test-roms adds the local test shelf
emulator/emulatorjs-lock.json       pinned versions, tarball URLs, integrity, licence hashes
dist/emulator/play.html             EmulatorJS host page (CSP in a meta tag)
dist/emulator/play.mjs              config lookup, hash check, boot, postMessage, error panel
dist/emulator/NOTICE.md             GPL-3.0 notice, per-core licence names, non-commercial flags
dist/emulator/ejs/4.2.3/            vendored EmulatorJS 4.2.3 runtime (unmodified npm tarball)
dist/emulator/ejs/4.2.3/cores/      13 × <core>-wasm.data
dist/emulator/ejs/4.2.3/cores/reports/  13 × <core>.json (each core's own build report)
dist/emulator/licenses/             13 core licence texts, pinned by sha256
dist/emulator/roms/                 6 approved ROMs, one folder per system
docs/emulator-test-checklist.md     manual checklist for the owner
docs/emulator-verification.md/.json per-ROM per-browser QA results
```

Vendored size: 21.68 MB in 57 files — runtime 1.32 MB, cores 20.1 MB, licence texts 0.25 MB.
`dist/emulator/` in total, including the pages and the 19 MB of ROMs, is about 42 MB.
`fbneo` (7.9 MB) is the largest core and `blind-jump` (16.5 MB) the largest ROM.

## Running the fetch script

```
node scripts/fetch-emulatorjs.mjs            # fetch, verify, extract, report
node scripts/fetch-emulatorjs.mjs --check    # verify the vendored tree, write nothing
```

- Node 22+ (checked at start-up). No dependencies: `fetch`, `node:zlib` and a small tar
  reader inside the script. `npm install` is not needed.
- Every tarball is checked against the `dist.integrity` (sha512) pinned in
  `emulator/emulatorjs-lock.json` **before** anything is extracted. A mismatch prints
  expected/received and exits 1 without writing a single file.
- Each core's licence text is checked against a pinned sha256 the same way. The npm core
  tarballs do not ship a licence file, so the text comes from the core's own upstream
  repository; a mismatch exits 1 and asks for a review rather than shipping changed terms.
- Extraction is idempotent: files are compared by sha256 and only rewritten when they
  differ, and every write is a temp file plus a rename.
- Each core's `reports/<core>.json` is vendored alongside its `.data`, to
  `cores/reports/<core>.json`. The runtime fetches that path and uses its `buildStart` as the
  IndexedDB cache key, so without it every boot re-downloads the core. The script fails if a
  report is missing, names a different core, or has no `buildStart`.
- Tarballs are cached in the OS temp dir (`gameflex-emulatorjs-cache/`), keyed by the
  expected integrity, so repeat runs do not re-download ~50 MB. The lock file is always the
  source of truth.
- After extraction the script checks that the 7z signature (`37 7A BC AF 27 1C`) is present
  in each vendored `<core>-wasm.data`, that every file named in the vendored `loader.js`
  script list exists, and that `emulator.css`, `version.json`,
  `compression/extract7z.js` and `localization/en-US.json` are present.

Verified behaviour of the script itself:

| Check | Result |
|---|---|
| First H1 run | 28 files, 6.56 MB extracted from the registry |
| Second run | `28 files, 6.56 MB total — already current` (no writes) |
| `--check` on the extracted tree | exits 0, reports `already current` |
| Corrupted tarball `dist.integrity` in a copy of the lock | exits 1, `integrity mismatch, aborting before extraction`, no files written |
| Corrupted licence sha256 | exits 1, `LICENSE.txt text does not match the pinned sha256` |
| H3 run with 13 cores + reports | 57 files, 21.68 MB; `--check` afterwards reports `already current` |

## How `play.html` boots the emulator

`play.html?id=<catalogue-id>` reads only `id` from the URL, then:

1. `fetch('../player-config.json')` (same origin, `cache: 'no-store'`) and looks up
   `games[id]`. Missing entry, `entry.mode !== 'emulator'`, or a missing `core`/`rom`/`sha256`
   renders the panel and posts an error.
2. `rom` is resolved against the site root, the way the plan's config schema records it
   (`"rom": "emulator/roms/example.nes"`). Scheme-relative or absolute URLs are refused.
3. A `HEAD` request confirms the core is vendored.
4. WebGL2 is checked before anything else is downloaded.
5. The ROM is fetched and checked with `crypto.subtle.digest('SHA-256')`. The emulator is
   never handed bytes that failed the check. SHA-256 needs a secure context: over plain
   HTTP on a non-loopback origin the page says so instead of booting unverified.
6. The verified bytes become a blob URL and the runtime starts.

Configuration set on `window` (all before `loader.js` is appended; each one is measured, not
decorative):

| Global | Value | Why |
|---|---|---|
| `EJS_player` | `'#game'` | runtime mount point |
| `EJS_core` | config `core` | phase-1 core |
| `EJS_gameUrl` | blob URL of the verified bytes | the ROM never leaves the document |
| `EJS_pathtodata` | `'./ejs/4.2.3/'` | all runtime files are local; no CDN |
| `EJS_startOnLoaded` | `true` | boot without a second click |
| `EJS_gameName` | `gameflex-<id>.<rom extension>` | **required**: with a blob game URL the runtime names the file it mounts from the game name, and the core only recognises a supported extension |
| `EJS_gameID` | stable 31-bit hash of the id | per-game localStorage settings key (plan decision 8) |
| `EJS_defaultOptions` | `{ webgl2Enabled: 'enabled' }` | **required** to select the vendored `<core>-wasm.data`; see below |
| `EJS_backgroundColor` | `'#101210'` | brand-consistent canvas surround |
| `EJS_disableAutoLang` | `false` | no localization request; the runtime's built-in English strings are the keys it looks up |

Left unset on purpose: `EJS_netplayServer` (and `EJS_EXPERIMENTAL_NETPLAY`, which the runtime
also requires before netplay is enabled) and every `EJS_Ad*` value. With
`connect-src 'self' blob: data:` the netplay socket and any ad URL would be blocked anyway.

### Why `webgl2Enabled` is set

The loader picks the core file like this (`data/src/emulator.js`, `downloadGameCore`):

```js
let legacy = (this.supportsWebgl2 && this.webgl2Enabled ? "" : "-legacy");
let filename = this.getCore() + (threads ? "-thread" : "") + legacy + "-wasm.data";
```

`webgl2Enabled` comes from the visitor's stored settings, then `EJS_defaultOptions`, then the
core report's `options.defaultWebGL2`. The 4.2.3 core reports ship `"options": {}`, so
without a default the runtime asks for `-legacy-wasm.data`, which phase 1 does not vendor.
Measured with `artifacts/h1-smoke/legacy-probe.mjs` (scratch, not committed), which swallows
the global: the runtime requested `fceumm-legacy-wasm.data`, could not fetch it, tried
`https://cdn.emulatorjs.org/4.2.3/data/cores/fceumm-legacy-wasm.data`, had that blocked by
CSP, and reported `Error downloading core (fceumm-legacy-wasm.data)`. With the default set,
the same boot requests `cores/fceumm-wasm.data` and starts.

Consequence: **WebGL2 is required.** The webgl2 builds are the ones phase 1 planned
(plan decision 2). A device without WebGL2 gets the in-frame panel ("no WebGL2 support")
instead of a half-broken boot. Vendoring the `-legacy` builds as well would add ~5 MB and
allow WebGL1 devices; that is a product decision, not a bug.

## Content Security Policy

```
default-src 'none';
script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:;
worker-src 'self' blob:;
connect-src 'self' blob: data:;
img-src 'self' blob: data:;
media-src 'self' blob:;
style-src 'self' 'unsafe-inline';
font-src 'self';
base-uri 'none';
form-action 'none'
```

The meta tag sits before any content it has to govern. Loosening relative to the plan's
starting policy, each measured against the vendored 4.2.3 build, nothing else loosened:

1. **`blob:` added to `script-src`.** The runtime decompresses each core and loads the core
   script from an object URL (`data/src/emulator.js`, `initGameCore`:
   `script.src = URL.createObjectURL(new Blob([js], { type: "application/javascript" }))`).
   Without it the core never loads. Measured: with `blob:` absent the boot stalls after the
   core is fetched.
2. **`'unsafe-eval'` added to `script-src`.** Every `<core>-wasm.data` is a 7z archive
   (signature `37 7A BC AF 27 1C`), which the runtime decompresses in a worker it builds from
   `compression/extract7z.js`. That file is an emscripten build that evaluates strings in
   `getCFunc`/`cwrap`. Measured: without `'unsafe-eval'` the page reports
   `Evaluating a string as JavaScript violates the following Content Security Policy
   directive ... 'unsafe-eval' is not an allowed source of script` and the boot never
   completes. `'wasm-unsafe-eval'` covers compilation of the core's WebAssembly; `'unsafe-eval'`
   is only about that decompression worker. `extractzip.js` also contains one `eval(`; no
   vendored runtime file needs anything else.

Nothing else had to be loosened. In particular no origin is allowed anywhere: the runtime's
upstream CDN core fallback (`https://cdn.emulatorjs.org/<version>/data/<core>`), its version
check (`https://cdn.emulatorjs.org/stable/data/version.json`), `socket.io` netplay
(`https://netplay.emulatorjs.org`) and ad slots are unreachable by construction. The
measured block of the core fallback in the probe above is the proof: the runtime asked for
the CDN and CSP refused it.

## Cores in this build

Thirteen cores, all from the pinned 4.2.3 tarballs, all the non-threaded non-legacy
`-wasm.data` build. The runtime's own filter comes first: `data/src/emulator.js`
`requiresThreads()` lists only `ppsspp` and `dosbox_pure`, so nothing here needs
`SharedArrayBuffer` or cross-origin isolation.

| System id | Core | Licence | Commercial use |
|---|---|---|---|
| `nes` | fceumm | GPL-2.0 | yes |
| `gb`, `gbc` | gambatte | GPL-2.0 | yes |
| `gba` | mgba | MPL-2.0 | yes |
| `segaMD`, `segaMS`, `segaGG` | genesis_plus_gx | Genesis Plus GX (BSD-style) | **no** |
| `snes` | snes9x | Snes9x | **no** |
| `sega32x` | picodrive | PicoDrive (BSD-style) | **no** |
| `psx` | pcsx_rearmed | GPL-2.0 | yes |
| `n64` | mupen64plus_next | GPL-2.0 | yes |
| `nds` | desmume2015 | GPL-2.0 | yes |
| `pce` | mednafen_pce | GPL-2.0 | yes |
| `atari2600` | stella2014 | GPL-2.0 | yes |
| `atari7800` | prosystem | GPL-2.0 | yes |
| `arcade` | fbneo | FB Neo (non-commercial, share-alike) | **no** |

Master System and Game Gear use the already-vendored `genesis_plus_gx`; `picodrive` also
covers Mega Drive and Sega CD, but only 32X is mapped to it here. Licence texts, upstream
repositories and the four non-commercial flags are in `dist/emulator/NOTICE.md`.

### BIOS and firmware

The host page never sets `EJS_biosUrl`, so `downloadBios()` in the runtime resolves nothing and
no BIOS file is ever requested or vendored. That is a property of the host page, not proof that
a given core runs its games without firmware, so each core was decompressed with the runtime's
own 7z worker and its strings read (the audit is in `docs/emulator-verification.json`
`coreAudit`, run by `scripts/emulator-qa.mjs`):

- **pcsx_rearmed** carries `No PlayStation BIOS file found - add for better compatibility`: it
  boots without one through HLE, at the cost of compatibility. That is the measured basis for
  shipping PS1 with no BIOS.
- **desmume2015** and **desmume** treat an external BIOS as an option
  (`desmume_use_external_bios`, `useExtBios`), not a requirement.
- **melonds** is the one DS core whose archive carries BIOS-file handling for its own firmware
  (`bios7.bin`, `bios9.bin`, `dsi_bios*`, `ARM9i BIOS not found`, `firmware.mch`).

### Cores considered and dropped

| Core | System | Why it is not in the build |
|---|---|---|
| melonds | nds | Its archive carries explicit BIOS/firmware loading paths, and it showed no measured advantage over the two DeSmuME cores. Dropped in favour of a core whose external-BIOS path is optional. |
| desmume | nds | Same lineage as desmume2015 and the same measured behaviour, but a larger archive (1,172,604 vs 1,043,573 bytes). Dropped to keep one DS core. |
| any `-thread-*` build | — | Threads need `SharedArrayBuffer`, which needs cross-origin isolation the site does not send (`docs/player-isolation-audit.md`). |
| any `-legacy` build | — | WebGL1-only. The player requires WebGL2 (`EJS_defaultOptions.webgl2Enabled`), so these are never requested. |

The DS decision was measured, not assumed: a 32 KB synthesised cartridge (an ARM9 program that
turns on the framebuffer and alternates two colours, plus an ARM7 that idles — built by
`artifacts/emulator-qa-probe/make-probes.mjs`) boots in **desmume2015, desmume and melonds with
no BIOS file present**, and none of the three logged a firmware error. The DS cores did not
reproduce the cartridge's own two-colour output, so that test establishes "a DS core accepts and
boots a homebrew ROM without a BIOS file", not "the cartridge's code produced visible output".
See the H3 note under Verification.

## Player mode, listings and the local test shelf

`dist/player.mjs` resolves a launch like this: catalogue entry first (`availability:
sandbox-pending` still wins), then `dist/player-config.json`. `entryFor()` returns
`{ mode: 'iframe' }`, `{ mode: 'emulator' }` or `{ mode: 'unavailable' }`; an unknown mode, a
missing entry and an unreadable config all fail closed to the blocked panel. The shipped config
is `version: 2`.

Starting an emulator listing creates one same-origin frame:

```html
<iframe sandbox="allow-scripts allow-same-origin allow-pointer-lock"
        allow="fullscreen; autoplay; gamepad" allowfullscreen referrerpolicy="no-referrer"
        src="emulator/play.html?id=<catalogue-id>">
```

No `allow-forms` (this frame is our own page and has no form), no popups, no top navigation. The
frame id comes from the catalogue id only, never from user input. Restart, exit and the existing
timeout all run through `teardownFrame()`, which removes the frame — that is what stops the audio
and releases the WebGL context. Fullscreen, favourites and the Notes overlay are unchanged.

The player accepts a message only when `event.source === frame.contentWindow`,
`event.origin === location.origin` and `data.type === 'gameflex-emulator'`, and only from the
generation of the frame it is currently showing. `started` sets the loaded state; `error` shows
the in-player "could not start" panel with the frame's own message. `started` is EmulatorJS's boot
event — it means the emulator booted the file, not that anyone played it.

The six hosted listings live in `dist/games.json` (`category: "retro"`) and
`dist/player-config.json`. Each config entry records `system`, `core`, `rom`, `sha256`, `licence`
and `title`; the player re-checks the SHA-256 before the emulator sees the bytes.
`scripts/check-catalog.mjs` verifies, for every emulator listing, that the ROM exists, its
SHA-256 matches, the core is vendored (including its report), a licence is recorded, the
`system`/`core` pair is one the lock file declares, and the file extension is one that core
accepts.

The local test shelf is a dev tool, never deployed:

    npm run dev:roms        # scripts/serve.mjs --test-roms, loopback only

It scans `D:\AI\Gameflex\test-roms\<system>\` (override with `GAMEFLEX_TEST_ROMS`) and this
checkout's `artifacts/roms/<system>/`, maps each folder to a system and core, hashes the file and
serves merged `/games.json` and `/player-config.json` plus ROM bytes from `/__test-roms/…`.
Entries are `test-<system>-<slug>` with `category: "test-roms"`, which the catalogue shows in a
"Test ROMs" row that only exists when such an entry is present. `npm run dev` and `dist/` contain
none of this — the merge happens in the server's responses, and `test-roms/` is in `.gitignore`.
A file extension the mapped core does not accept is skipped and named in the server banner.

## Gamepad support

Desktop Chrome, Edge and Firefox. A physical controller was originally not recognised in the
player; this is what was measured and what changed.

### Measured before the fix

`npm run test:emulator -- --pads-only` runs the simulated-pad scenarios: a standard-mapping pad is
injected into every document of the run (`navigator.getGamepads()` is overridden, button 9 = START
and button 15 = DPAD_RIGHT are pressed), and the run asserts that the press reaches the runtime's
own input call for the control its default pad map gives it (START → control 3, DPAD_RIGHT →
control 7). Two scenarios per ROM per browser:

- `load` — the pad is already visible to the frame's document when the runtime builds its gamepad
  handler.
- `late` — the frame's document sees no pad until the game has started; one is connected then, so
  the runtime meets a pad that arrives while it is listening.

Before any fix, all **18 of 18** runs failed (Chrome 154, Edge 155, Firefox 153 × NES
`super-tilt-bro`, SNES `240p-test-suite-snes`, GBA `blind-jump` × both scenarios):

| Measured | `load` (9 runs) | `late` (9 runs) |
|---|---|---|
| Runtime's pad list holds the pad | 9 of 9 | 9 of 9 |
| Player 1's `gamepadSelection[0]` is filled | 0 of 9 | 9 of 9 |
| START reaches the game as control 3 | 0 of 9 | 9 of 9 |
| D-pad Right reaches the game as control 7 | 0 of 9 | 9 of 9 |
| Focus was on the frame while the game was still booting | 0 of 9 | 1 of 9 |

The `load` failure is a defect in the vendored runtime, not in our page. `bindListeners()`
(`dist/emulator/ejs/4.2.3/src/emulator.js`) constructs `GamepadHandler`, whose constructor starts
its 10 ms poll immediately, and only then attaches the `connected` listener. A pad the document
can already see at that moment fires `connected` into nothing, is never written into
`gamepadSelection`, and `gamepadEvent()` then drops every press from it ("Gamepad not set
anywhere"). Nothing under `dist/emulator/ejs/` was touched to work around that.

The focus row is the other measured gap: focus sits on the player document (`body`) until
EmulatorJS focuses its own container, which it only does once the game has started. A pad press
during the boot therefore lands in the player document, and browsers expose a pad to a document
only after a press while that document has focus — so the frame's own poll can never see it.

### What changed

| Change | Where |
|---|---|
| Focus moves into the emulator frame as soon as its document exists, and is re-asserted when the game starts, so a pad press lands in the frame's document. A toolbar control the visitor just used, and the open Notes overlay, keep focus. | `dist/player.mjs:417` (`focusEmulatorFrame`), called at `:476` (frame load) and `:518` (game started) |
| Escape keeps working with focus inside the frame: keydown from a frame never reaches the parent, so the player listens on the frame's own document (same origin) and closes the Notes overlay or the player exactly as before — except while the emulator is in its own fullscreen, which Escape is left to leave. | `dist/player.mjs:432` (`watchFrameKeys`), attached from the frame's `load` handler |
| The host page adopts the pad for Player 1: it polls `navigator.getGamepads()` twice a second from before the runtime is loaded, gives the first pad that no player slot holds to Player 1 via `window.EJS_emulator.gamepadSelection[0]`, and refreshes the runtime's own dropdowns with `updateGamepadLabels()`. Every access is guarded, so a runtime change cannot crash the frame. Pads that arrive later are adopted the same way. | `dist/emulator/play.mjs:201-256`, started at `:299` |
| "Controller? Press any button." appears in the stage while the emulator has seen no controller, and is removed by the frame's own report — nothing else can know a pad exists. | `dist/player.mjs:397-409` (hint), `:486` (shown), `:523` (hidden on report), `dist/style.css:63` |
| The frame reports the pad to the player as `{type:'gameflex-emulator', state:'gamepad', message:<pad id>, assigned:<bool>}` over the existing origin, source and generation checks, and the player says so in its status line. | `dist/emulator/play.mjs:253`, `dist/player.mjs:523` |

After those changes the same 18 runs pass in all three browsers, and every run shows Player 1
holding the pad with `[[0,3,1],[0,7,1],[0,3,0],[0,7,0]]` (START down, D-pad Right down, then both
up) at the runtime's own input call.

### Not done: relaying input from the player

The optional step of having the player poll `getGamepads()` and forward pad state into the frame
was **not** implemented. It is only worth its second input path if measurement shows the frame
cannot see pads while the player can, and this machine has no physical controller: the simulated
pad is injected into every document, so it cannot tell the two apart. Every run also shows the
frame's own document seeing the pad, so nothing points at the frame's `navigator.getGamepads()`
being the problem. The remaining question is device exposure in a real browser, and only the
owner's manual pass can answer it — the Gamepad row in `docs/emulator-test-checklist.md`.

### What the QA still cannot say

The injected pad proves our wiring: focus, the host page and the runtime's Player 1 slot. It does
**not** prove that a real browser exposes a real controller to the frame, and it does not cover a
pad that reports its D-pad as a hat axis instead of buttons 12–15. Both need a physical device.

## Measured runtime behaviour

Boot trace from the smoke run (25 requests in total: the scratch host page, the page-origin
files below, and 4 `blob:` URLs for the core script, core wasm, ROM and 7z worker;
`<base>` = the page origin):

```
/emulator/play.html  /emulator/play.mjs  /player-config.json
/emulator/ejs/4.2.3/cores/fceumm-wasm.data      HEAD pre-check
/emulator/roms/h1-smoke.nes                     ROM, then SHA-256 checked
/emulator/ejs/4.2.3/loader.js
/emulator/ejs/4.2.3/emulator.min.js             404 -> fallback
/emulator/ejs/4.2.3/emulator.min.css            404 -> fallback
/emulator/ejs/4.2.3/src/{emulator,nipplejs,shaders,storage,gamepad,GameManager,socket.io.min,compression}.js
/emulator/ejs/4.2.3/emulator.css
/emulator/ejs/4.2.3/cores/reports/fceumm.json   404 -> core caching disabled
/emulator/ejs/4.2.3/cores/fceumm-wasm.data      200
/emulator/ejs/4.2.3/compression/extract7z.js    200 (7z worker source)
blob: × 4 (core js, core wasm, ROM, 7z worker)
```

Everything is same-origin. Known and expected noise, all recorded here so the H3 QA can
assert precisely:

- **`emulator.min.js` / `emulator.min.css` 404, then the unminified fallback.** The npm
  tarball ships `data/src/*.js` and `emulator.css`, not the minified bundle. `loader.js`
  probes the minified names, and on failure logs `Failed to load emulator.min.js` and loads
  the eight source scripts plus `emulator.css`. Those 404s and two console errors are the
  price of not shipping a bundle we did not build. The alternative,
  `window.EJS_DEBUG_XX = true`, skips them but also makes the runtime run its CDN version
  check on every production load (`this.debug || hostname is localhost`), which CSP blocks —
  a real CSP violation message per visit instead of two local 404s. So `EJS_DEBUG_XX` is
  deliberately not set.
- **`cores/reports/<core>.json` is vendored**, so 4.2.3 no longer logs
  `Could not fetch core report JSON!` and the runtime's IndexedDB core cache works: a second
  boot of the same core reads it from storage instead of re-downloading it. H1 vendored only the
  `.data` file, which is why its trace shows that 404; H3 added the reports.
- **`version.json` and `localization/en-US.json` are vendored but never requested.**
  `version.json` is not fetched by 4.2.3 at all (the version is hardcoded, and the update
  check points at the CDN), and the page pins no language, so no localization file is
  fetched. `en-US.json` is kept because the plan asked for it and because a future
  `EJS_language` change would need it. If the tree should be minimal, both can go.
- **On loopback hosts only**, the runtime's update check tries
  `https://cdn.emulatorjs.org/stable/data/version.json` because `location.hostname` is
  `127.0.0.1`/`localhost`. CSP blocks it, which produces two console messages and one
  `Failed to fetch` page error per load. On a real hostname the runtime skips the check
  entirely, so a deployed build has **zero** CSP violations. Measured both ways: loopback
  run → 2 CSP messages, 0 non-self requests; non-loopback run over TLS → 0 CSP messages,
  0 non-self requests.

## Known limits

- **WebGL2 is required** (see above).
- **Non-threaded cores only.** Threaded cores need `SharedArrayBuffer` and therefore
  cross-origin isolation, which the published site does not send (`docs/player-isolation-audit.md`).
  `-thread-*` variants are not vendored.
- **No netplay, no cloud saves, no ads.** Netplay needs `EJS_netplayServer` plus
  `EJS_EXPERIMENTAL_NETPLAY`; both are unset and the socket origin is blocked anyway.
- **English only.** The runtime's built-in strings are used; no other locale is vendored.
- **Saves are local.** EmulatorJS stores saves and save states in IndexedDB on the gameflex
  origin, keyed per game (`EJS_gameID` plus `EJS_gameName`). Nothing is uploaded. Restart and
  exit remove the frame, which is what stops the audio.
- **`snes9x` and `genesis_plus_gx` are non-commercial.** See `dist/emulator/NOTICE.md`.
  Before any monetisation those two need a licence review or a replacement.
- **The ROM's extension must be one the core accepts.** The page mounts the ROM under
  `gameflex-<id>.<extension>`; the extension comes from the config's `rom` path. A ROM with
  no extension, or one the core does not list, will boot into the emulator's own failure
  path. `check-catalog.mjs` (H3) is the right place to reject it up front.
- **A ROM whose licence does not allow redistribution must not be added**, and no ROM is
  bundled by H1. The plan's ROM policy applies: homebrew, open source or public domain only,
  user-approved, SHA-256 recorded in the config.
- **A controller is verified by automation with a simulated pad only.** The 18 gamepad runs prove
  the player's focus, the host page and the runtime's Player 1 slot; they cannot prove that a real
  browser exposes a real controller to the frame, and a pad that reports its D-pad as a hat axis
  (not buttons 12–15) is untested. See "Gamepad support" and the Gamepad row in
  `docs/emulator-test-checklist.md`.

## Verification

### What was executed

`dist/emulator/play.html` was loaded from a scratch copy of the tree
(`artifacts/h1-smoke/`, gitignored) in Edge (`playwright 1.62.1`, channel `msedge`) inside
the sandboxed same-origin frame the plan describes
(`sandbox="allow-scripts allow-same-origin allow-pointer-lock"`), on two origins:

- `http://127.0.0.1:4174` — loopback, so the runtime's own update check fires and is blocked.
- `https://gameflex.test:4175` — a non-loopback hostname mapped to the loopback interface,
  the deploy-like case.

Because no approved ROM exists yet, the run used a **self-made test cartridge**
(`artifacts/h1-smoke/make-rom.mjs`): a 24 KB iNES file with a hand-assembled 70-byte 6502
program that disables rendering and alternates palette `$3F00` between two colours. It is a
boot probe, not a game, not a curated ROM, and it is never committed. Nothing from it is in
`dist/`.

| Case | Result |
|---|---|
| `h1-smoke` (fceumm + probe cartridge) | `{type:'gameflex-emulator', state:'started', message:'fceumm booted gameflex-h1-smoke.nes'}`, canvas present, `EJS_emulator.fileName === 'gameflex-h1-smoke.nes'`, 5 distinct canvas frames across 12 samples 400 ms apart (the core is running and driving the PPU), 0 non-self requests, 0 CSP violations on the non-loopback origin |
| unknown id | panel "Nothing in this collection is called “h1-not-a-real-id”." + error message to parent |
| wrong mode (`mode: 'iframe'`) | panel "“h1-wrong-mode” is not an emulator game." (detail `mode: iframe`) |
| wrong SHA-256 | panel "The game file failed its integrity check, so it was not started." (detail: expected/received digest) |
| core not vendored (`nestopia`) | panel "The nestopia core is not in this build." (detail: path + HTTP 404) |
| ROM missing (404) | panel "The game file could not be loaded." (detail: URL + HTTP 404) |
| entry missing `core`/`rom`/`sha256` | panel "… is missing its core, rom or sha256 entry." |

Every case posted `{type:'gameflex-emulator', state, message}` to the parent with
`event.origin` equal to the page origin and `event.source === frame.contentWindow`, and every
case left the panel inside the frame with no new tab, no external link and no request to a
non-self origin.

The real `dist/` tree was also loaded through the repository's own dev server
(`npm run dev`, port 4173): `/emulator/play.html?id=does-not-exist`, `?id=halo` and
`?id=wasmarcade` each rendered the panel, loaded only `play.html`, `play.mjs` and
`player-config.json`, never touched `ejs/**`, and produced no CSP violation. (One browser
console 404 appeared in the first top-level load only; it did not reproduce as a network
response and is most likely Chromium's implicit `/favicon.ico`. It does not occur when the
page is inside the player frame, which is how it is used.)

The raw harness output for both origins is in the gitignored scratch directory:
`artifacts/h1-smoke/shots/http-report.json` and `…/https-report.json` (per-case requests,
console messages, CSP violations, postMessage payloads, panel text, canvas frame hashes),
with the harness in `artifacts/h1-smoke/smoke.mjs`. Those files are not committed.

## Verification (H3): the player, the listings and the QA matrix

`npm run test:emulator` (`scripts/emulator-qa.mjs`, Playwright 1.62.1) boots every listing through
the real player route and records what happened. Full results:
`docs/emulator-verification.md` and `docs/emulator-verification.json`; screenshots in
`artifacts/emulator-qa/screenshots/` (git-ignored).

The run serves the site over HTTPS on `https://gameflex.test:<port>`, mapped to loopback in each
browser (Chromium launch flag, Firefox `network.dns.localDomains`), with a self-signed certificate
generated into `artifacts/emulator-qa/`. The hostname matters: on a loopback hostname the vendored
runtime runs its own update check against the EmulatorJS CDN, which its CSP then blocks, and the
"no CSP violation" assertion would be measuring that quirk instead of the build.

| | |
|---|---|
| Runs | 63 (21 ROMs × Chrome 154, Edge 155, Firefox 153) |
| Passed | 63, 0 failed |
| ROMs | 6 hosted listings + 15 files from the local test shelf |
| Negative cases | 9 (bad SHA-256, core not vendored, unknown id × 3 browsers), all behaved as expected |
| Gamepad runs (H4) | 18 (hosted NES/SNES/GBA × 3 browsers × 2 simulated-pad scenarios), 18 passed — see "Gamepad support" |

Per run the harness asserts: the frame is present with `allow-scripts allow-same-origin
allow-pointer-lock` and its `src` names the catalogue id; a canvas exists; the canvas renders (a
sample has content, or frames differ) and is still changing; zero CSP violations were reported by
the emulator frame; every request stayed on the gameflex origin (`blob:`/`data:` excepted); and
exiting removed the frame and closed the player. Enter is injected and the frames before and after
are saved — recorded, never asserted. The gamepad runs assert one more thing each: that the frame
had focus while the game was booting, that the runtime's Player 1 slot holds the pad, and that a
pressed START and D-pad Right arrive at the runtime's own input call as controls 3 and 7.

Both sets of numbers above are the merged result of `scripts/emulator-qa.mjs`, run per browser and
per shelf with `--merge` so each pass fitted inside one foreground command; the report and the two
`docs/emulator-verification.*` files are written from that merged run.

Covered by the harness: the six hosted listings in all three browsers, and the 15 test-shelf ROMs
(NES, SNES, GB, GBC, GBA, Mega Drive) in all three browsers. **Not covered:** 32X, PS1, N64, NDS,
PC Engine, Atari 2600, Atari 7800 and Arcade have no test ROM on this machine, so their cores are
vendored but unexercised — drop a file into `test-roms/<system>/` and run
`npm run test:emulator -- --only <id>` to cover one. Sites packaging is still Codex's job.

### What is still not verified

- **Nobody has played these games.** `started` is EmulatorJS's boot event. The QA proves boot,
  render, change and teardown; it does not prove playability, and it never checks sound. The
  manual pass for that is `docs/emulator-test-checklist.md`.
- **Save states and SRAM were not exercised** by the automated run. They live in the browser's
  IndexedDB; the checklist covers them by hand.
- **The DS cartridge probe did not render.** All three DS cores booted the synthesised cartridge
  with no BIOS present, but none of them showed the cartridge's own two-colour output, so the DS
  choice is supported by "boots without a BIOS" plus the string evidence above, not by a visible
  DS game. No DS or PS1 game ROM was available to test.
- **Mobile, Safari, real hosting and a CDN** are untested. Desktop Chrome, Edge and Firefox are
  the targets.
- **Real network conditions are untested.** Cores are 0.8–7.9 MB and are cached in IndexedDB after
  the first boot on an origin; first-boot time on a slow connection is unmeasured.
- **A real controller on a real device is untested.** The gamepad runs use an injected pad, so
  device exposure (the browser only hands a pad to the focused document, after a button press) and
  non-standard pad mappings are the owner's manual pass. `docs/emulator-test-checklist.md`, Gamepad
  row.
