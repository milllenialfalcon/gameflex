# Third-party notices — dist/emulator

Gameflex redistributes the unmodified npm registry tarballs listed below. Nothing in
`ejs/4.2.3/` has been edited, rebuilt or minified by us, and no EmulatorJS file is loaded
from the EmulatorJS CDN at runtime. Versions, tarball URLs and integrity hashes are pinned
in `emulator/emulatorjs-lock.json`; `scripts/fetch-emulatorjs.mjs` verifies every tarball
with sha512 before extracting it and aborts on any mismatch.

## EmulatorJS runtime

- Package: `@emulatorjs/emulatorjs` 4.2.3
- Licence: GNU General Public License version 3 (GPL-3.0), full text in
  `ejs/4.2.3/LICENSE`
- Source tarball: https://registry.npmjs.org/@emulatorjs/emulatorjs/-/emulatorjs-4.2.3.tgz
- Upstream project and corresponding source: https://github.com/EmulatorJS/EmulatorJS
  (tag matching the released version; `data/` is the same tree this directory vendors)
- Homepage: https://emulatorjs.org

EmulatorJS is a browser frontend for RetroArch. The emulator cores below are separate
programs, downloaded from their own packages and decompressed by the runtime in the
visitor's browser.

## Cores

Only the non-threaded, non-legacy WASM build of each core is vendored, as
`ejs/4.2.3/cores/<core>-wasm.data`. Each `.data` file is a 7z archive containing that
core's compiled JavaScript, WebAssembly module and its own `license.txt`.

| Core | Package 4.2.3 | Systems | Licence | Commercial use | Licence text |
|---|---|---|---|---|---|
| fceumm | `@emulatorjs/core-fceumm` | NES | GNU GPL v2.0 | permitted by the licence | `licenses/fceumm-Copying` |
| gambatte | `@emulatorjs/core-gambatte` | GB, GBC | GNU GPL v2.0 | permitted by the licence | `licenses/gambatte-COPYING` |
| mgba | `@emulatorjs/core-mgba` | GBA | Mozilla Public License 2.0 | permitted by the licence | `licenses/mgba-LICENSE` |
| genesis_plus_gx | `@emulatorjs/core-genesis_plus_gx` | Mega Drive, Master System, Game Gear | Genesis Plus GX licence (BSD-style, **non-commercial**) | **no** | `licenses/genesis_plus_gx-LICENSE.txt` |
| snes9x | `@emulatorjs/core-snes9x` | SNES | Snes9x licence (**non-commercial**) | **no** | `licenses/snes9x-LICENSE` |
| picodrive | `@emulatorjs/core-picodrive` | 32X, Mega Drive, Sega CD | PicoDrive licence (BSD-style, **non-commercial**) | **no** | `licenses/picodrive-COPYING` |
| pcsx_rearmed | `@emulatorjs/core-pcsx_rearmed` | PlayStation | GNU GPL v2.0 | permitted by the licence | `licenses/pcsx_rearmed-COPYING` |
| mupen64plus_next | `@emulatorjs/core-mupen64plus_next` | Nintendo 64 | GNU GPL v2.0 | permitted by the licence | `licenses/mupen64plus_next-LICENSE` |
| desmume2015 | `@emulatorjs/core-desmume2015` | Nintendo DS | GNU GPL v2.0 | permitted by the licence | `licenses/desmume2015-COPYING` |
| mednafen_pce | `@emulatorjs/core-mednafen_pce` | PC Engine / TurboGrafx-16 | GNU GPL v2.0 | permitted by the licence | `licenses/mednafen_pce-COPYING` |
| stella2014 | `@emulatorjs/core-stella2014` | Atari 2600 | GNU GPL v2.0 | permitted by the licence | `licenses/stella2014-license.txt` |
| prosystem | `@emulatorjs/core-prosystem` | Atari 7800 | GNU GPL v2.0 | permitted by the licence | `licenses/prosystem-License.txt` |
| fbneo | `@emulatorjs/core-fbneo` | Arcade | FB Neo licence (**non-commercial**, share-alike) | **no** | `licenses/fbneo-license.txt` |

Upstream core sources, as recorded by each package's `repository` field:

- fceumm: https://github.com/EmulatorJS/libretro-fceumm
- gambatte: https://github.com/EmulatorJS/gambatte-libretro
- mgba: https://github.com/EmulatorJS/mgba
- genesis_plus_gx: https://github.com/EmulatorJS/Genesis-Plus-GX
- snes9x: https://github.com/EmulatorJS/snes9x
- picodrive: https://github.com/EmulatorJS/picodrive
- pcsx_rearmed: https://github.com/EmulatorJS/pcsx_rearmed
- mupen64plus_next: https://github.com/EmulatorJS/mupen64plus-libretro-nx
- desmume2015: https://github.com/EmulatorJS/desmume2015
- mednafen_pce: https://github.com/EmulatorJS/beetle-pce-libretro
- stella2014: https://github.com/EmulatorJS/stella2014-libretro
- prosystem: https://github.com/EmulatorJS/prosystem-libretro
- fbneo: https://github.com/EmulatorJS/FBNeo

### Non-commercial cores

**`genesis_plus_gx`, `snes9x`, `picodrive` and `fbneo` must not be used commercially.** Their
licences say so in their own words:

- Snes9x: "Permission to use, copy, modify and/or distribute Snes9x in both binary and
  source form, for non-commercial purposes, is hereby granted without fee... Snes9x is
  freeware for PERSONAL USE only. Commercial users should seek permission of the
  copyright holders first."
- Genesis Plus GX: "Redistributions may not be sold, nor may they be used in a commercial
  product or activity."
- PicoDrive: "Redistributions may not be sold, nor may they be used in a commercial
  product or activity."
- FB Neo: "You may not sell, lease, rent or otherwise seek to gain monetary profit from
  FB Neo."

Between them those four cover Mega Drive, Master System, Game Gear, 32X, SNES and Arcade,
which is four of the six published emulator listings. Before gameflex carries any
advertising, paid tier or other monetisation, they need a licensing review or a replacement.
This is recorded next to the plan's ad/monetisation rule. It is a factual licence note, not
legal advice.

### Core reports

`ejs/4.2.3/cores/reports/<core>.json` is each core's own build report, taken from the same
tarball. The runtime fetches it and uses its `buildStart` as the key for its IndexedDB core
cache. Without the file it logs `Could not fetch core report JSON! Core caching will be
disabled!` and downloads the whole core on every boot.

## How the licence texts were obtained

The npm core tarballs do not contain a licence text file: their `package.json` `license`
field names a file (`Copying`, `COPYING`, `LICENSE`, `LICENSE.txt`) that is not published to
npm. `scripts/fetch-emulatorjs.mjs` therefore downloads each core's licence text from that
core's own upstream repository, checks it against a sha256 pinned in
`emulator/emulatorjs-lock.json`, and writes it to `dist/emulator/licenses/`. A mismatch
aborts the run and asks for a review rather than silently shipping changed terms. These
thirteen URLs are used at vendor time only; no request goes to them at runtime.

## ROMs

`dist/emulator/roms/` holds the six ROMs listed here. Each is homebrew, open source or a
test suite whose own licence allows redistribution, and each was approved by the site owner.
Every ROM's SHA-256 is recorded in `dist/player-config.json` and checked by
`scripts/check-catalog.mjs` and again by the player before it hands the bytes to the
emulator.

| ROM | System | Author | Licence |
|---|---|---|---|
| Super Tilt Bro. | NES | Sylvain Gadrat (sgadrat) | WTFPL |
| Tobu Tobu Girl | Game Boy | Simon Larsen / Tangram Games | MIT (code) + CC BY 4.0 (art, text, music) |
| µCity | Game Boy Color | Antonio Niño Díaz (AntonioND) | GPL-3.0-or-later |
| BlindJump | Game Boy Advance | Evan Bowman | MIT |
| ZeroSouls | Mega Drive | CartridgeStack | GPL-3.0 |
| 240p Test Suite (SNES) | SNES | Artemio Urbina | GPL-2.0-or-later |

Attribution for Tobu Tobu Girl's art, text and music (CC BY 4.0) is visible in the listing's
own "before you jump in" text, as are the source repository and version for each
GPL-licensed build. No commercial ROM is hosted; the policy and its evidence are in
`docs/emulator.md` and `research/emulator-roms.json`.
