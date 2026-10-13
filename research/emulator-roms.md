# Emulator ROM candidates (task H2)

Research only. Nothing here is approved: `assistantVerification` and `userVerification` are
`pending` for every record. No ROM has been copied to `dist/`. Every entry below requires
(a) assistant licence verification and (b) explicit user approval before publication.

Scope: freely redistributable ROMs for the phase-1 systems (NES, GB/GBC, GBA, Mega
Drive/Genesis, SNES). A ROM was only accepted if its author publishes an explicit licence or
redistribution statement **and** an author-published binary exists. Downloadable, itch.io
listing or archive presence were never treated as permission, and no commercial, leaked,
prototype-of-commercial or "abandonware" title was considered.

Downloads live in the git-ignored `artifacts/roms/<system>/`. Sizes and SHA-256 in the table
were recomputed from the files on disk; they match `research/emulator-roms.json`.

## Candidates

| # | id | System | Title | Author | Licence | File | Bytes | SHA-256 (first 16) |
|---|---|---|---|---|---|---|---|---|
| 1 | nova-the-squirrel | nes | Nova the Squirrel | NovaSquirrel | GPL-3.0-or-later (code) + CC-BY-NC-SA-4.0 (assets) | artifacts/roms/nes/nova.nes | 262160 | e4780e90b9d15874 |
| 2 | super-tilt-bro | nes | Super Tilt Bro. | Sylvain Gadrat (sgadrat) | WTFPL | artifacts/roms/nes/super-tilt-bro.nes | 524304 | 847155bb712e474f |
| 3 | 240p-test-suite-nes-240pee | nes | 240p Test Suite NES (240pee) v0.23 | Damian Yerrick (pinobatch) / Artemio Urbina | GPL-2.0-or-later | artifacts/roms/nes/240pee.nes | 65552 | 04f01d7372f66ea2 |
| 4 | 144p-test-suite-gb | gb | 144p Test Suite v0.23 | Damian Yerrick (pinobatch) / Artemio Urbina | GPL-2.0-or-later | artifacts/roms/gb/gb240p.gb | 32768 | 733eb6e7ec071975 |
| 5 | tobu-tobu-girl | gb | Tobu Tobu Girl | Simon Larsen / Tangram Games | MIT (code) + CC-BY-4.0 (assets) | artifacts/roms/gb/tobu-tobu-girl.gb | 262144 | 5d3871cae77db228 |
| 6 | libbet-and-the-magic-floor | gb | Libbet and the Magic Floor | Damian Yerrick (pinobatch) | Zlib | artifacts/roms/gb/libbet.gb | 32768 | 3607412031c8287c |
| 7 | ucity | gbc | µCity v1.3 | Antonio Niño Díaz (AntonioND) | GPL-3.0-or-later | artifacts/roms/gbc/ucity.gbc | 131072 | 9422ee2ca7b7ea1d |
| 8 | tobu-tobu-girl-deluxe | gbc | Tobu Tobu Girl Deluxe | Simon Larsen / Tangram Games | MIT (code) + CC-BY-4.0 (assets) | artifacts/roms/gbc/tobu-tobu-girl-deluxe.gb | 262144 | 0a0e8018dbbc8d7f |
| 9 | 160p-test-suite-gba | gba | 160p Test Suite (multiboot) v0.23 | Damian Yerrick (pinobatch) / Artemio Urbina | GPL-2.0-or-later | artifacts/roms/gba/240pee_mb.gba | 61104 | 47844f7140738a06 |
| 10 | tigermoth | gba | Tigermoth (GBA Jam 2021) | Marq Watkin (pmprog) | MIT | artifacts/roms/gba/tigermoth.gba | 250560 | 0c4f898315b91475 |
| 11 | blind-jump | gba | BlindJump | Evan Bowman | MIT | artifacts/roms/gba/blindjump.gba | 16565008 | 597d11e93567f14f |
| 12 | 240p-test-suite-megadrive | segaMD | 240p Test Suite MD v1.32 | Artemio Urbina | GPL-2.0-or-later | artifacts/roms/segaMD/240psuite-1.32.bin | 262144 | fe448a879eda25da |
| 13 | zerosouls | segaMD | ZeroSouls | CartridgeStack | GPL-3.0 | artifacts/roms/segaMD/zerosouls.bin | 524288 | 127fa9c093093101 |
| 14 | 240p-test-suite-snes | snes | 240p Test Suite SNES v1.10 | Artemio Urbina | GPL-2.0-or-later | artifacts/roms/snes/240psuite.sfc | 786432 | 8c3f6028bb1246d2 |
| 15 | snes-cputest-basic | snes | SNES 65C816 CPU test (basic) v1.4 | gilyon | MIT | artifacts/roms/snes/snes-cputest-basic.sfc | 262144 | d479bde706b9e16d |

Counts: nes 3, gb 3, gbc 2, gba 3, segaMD 2, snes 2 (15 total). Every system has at least 2.

### Sources used

- Repo/release assets: `pinobatch/240p-test-mini` v0.23 (NES, GB, GBA test ROMs),
  `pinobatch/libbet` v0.08, `NovaSquirrel/NovaTheSquirrel` v1.0.6a,
  `evanbowman/blind-jump-portable` 2021.11.20.0, `gilyon/snes-tests` v1.4,
  `CartridgeStack/ZeroSouls` (`out/zerosouls.bin`), Codeberg `SkyLyrac/ucity` v1.3.
- Author-published itch.io pages (no repo binaries exist for these):
  `artemiourbina.itch.io/240p-test-suite` (Mega Drive + SNES), `sgadrat.itch.io/super-tilt-bro`,
  `tangramgames.itch.io/tobutobugirl`, `tangramgames.itch.io/tobu-tobu-girl-deluxe`,
  `pmprog.itch.io/tigermoth`. itch.io serves files from short-lived signed URLs, so the stable
  link recorded in `downloadUrl` is the author's project page; the exact upload name used is
  noted per record.
- Zips were only used as containers: only the ROM was kept, nothing else.

### Caveats worth reading before approval

- **nova-the-squirrel** — mixed licence. Code is GPL-3.0-or-later, but the assets are
  CC-BY-NC-SA-4.0 ("the game may not be sold without permission with these intact"). Redistribution
  is permitted; commercial use is not. Keep it only while Gameflex is non-commercial, or get the
  author's permission.
- **tobu-tobu-girl / tobu-tobu-girl-deluxe** — MIT code plus CC-BY-4.0 assets, so attribution is
  required for the art, text and music (not just the code).
- **super-tilt-bro** — iNES2 mapper 2 submapper 1 (UNROM-512). Confirm the vendored NES core
  supports that mapper before publication; a wrong mapper shows as a black screen, not an error.
- **ucity** — CGB-only (flag 0xC0). Must be launched as Game Boy Color, not DMG.
- **blind-jump** — 16.5 MB, the largest file of the set; check first-load time in the browser.
- **zerosouls** — no release, no itch page: the ROM is the repository's committed build output, so
  it is only reproducible at a commit, not against a version tag. Its header name field reads
  "SAMPLE PROGRAM".
- **240p test ROMs** — deterministic test suites, not games. Screen content is static patterns and
  pass/fail reports; good for the "boots and renders" QA check, weak as a listing for players.
- **snes** — the weakest system: both accepted ROMs are test suites. No SNES homebrew *game* with
  an explicit redistribution licence **and** a published binary was found inside the timebox
  (see rejections).
- **Cores, not ROMs** — plan item 10: `snes9x` and `genesis_plus_gx` carry non-commercial terms.
  That affects the MD and SNES candidates' cores, independent of the ROM licences recorded here.

## Rejected / not included

Policy rejections (no licence, or licence does not meet the bar):

| Candidate | System | Reason |
|---|---|---|
| Apotris | gba | No licence. Repo README states the source is no longer hosted there and no licence is published. |
| Celeste Classic GBA (JeffRuLz) | gba | No licence file or statement in the repo. |
| Goodboy Advance (exelotl) | gba | No licence. |
| GBADoom (doomhack) | gba | No licence detected in the repo, and it needs a commercial/shareware DOOM WAD to run. |
| Petris (bbbbbr) | gbc | CC-BY-NC-SA-4.0: redistribution only for non-commercial use. Licence meets redistribution but not the clean set asked for. |
| Tuff.gb (BonsaiDen) | gb | No licence published. |
| Infinity (gb-archive/infinity-gbc) | gbc | Cancelled commercial game released later with source — excluded as a prototype of a commercial title. |
| pokered-gbc (dannye) | gbc | Rebuild of a commercial game's disassembly — derivative of a commercial ROM. |
| Project MD (sikthehedgehog) | segaMD | No licence. |
| Mega Grappler X (sikthehedgehog/meka) | segaMD | No licence. |
| Penguin-World (alicesim1) | segaMD | Releases publish `.bin` ROMs but the project carries no licence. |
| Tetris MD (NeroJin) | segaMD | No licence. |
| div-columns (MikeDX) | — | MIT, but it is a DIV Games Studio `.PRG` project, not a Mega Drive ROM. |
| PeterLemon/SNES test ROMs | snes | No licence published. |

Licence fine, no author-published binary found (so no file to hash and record):

| Candidate | System | Licence | Reason |
|---|---|---|---|
| Alex vs Bus: The Race (M374LX/alexvsbus-md) | segaMD | GPL-3.0-or-later + CC-BY-SA-4.0 | No release; ROM must be built with `vasm` from source. |
| skarab/megadrive-game | segaMD | MIT | No release; Visual Studio + SGDK build only. |
| Venture Below (nlovdahl) | snes | GPL-3.0-or-later | No release; `cc65` build only. |
| Super Road Blaster (snesdev0815) | snes | MIT | No prebuilt ROM; build needs WLA DX + Python 2.7, and the game additionally needs MSU-1 data/audio taken from the commercial iPhone release. |
| 2048-gb (Sanqui) | gb | Zlib | No Github release and no author download page located in the timebox. Revisit if a binary is found. |

Rejected for asset provenance (licence on paper, but not clean):

| Candidate | System | Reason |
|---|---|---|
| Super Penalty Kick (malayli/snes-super-penalty) | snes | MIT code, but the game reuses Konami ISS Deluxe artwork and SFX — derivative of a commercial game's assets. |

No explicit licence found on the author's own page (games explored because they are SNES homebrew
with published ROMs, but the pages state no licence):

| Candidate | System | Reason |
|---|---|---|
| Blokit (crispulent-crisps) | snes | Free download page; no licence or redistribution statement. |
| Borderline (lockeddoorpuzzle) | snes | Built with PVSnesLib; no licence stated on the page. |
| SNES Christmas Game (amueller) | snes | Free ROM; no licence stated. |
| Lizard (rainwarrior) | nes | Commercial product (itch purchase, cartridges) — excluded by the no-commercial rule. |

Out of scope by project rule, not researched as candidates: 240p Test Suite builds for Neo Geo,
Saturn, Dreamcast, Wii, GameCube, N64, PC Engine, X68000 (systems outside phase 1), and anything
requiring a BIOS or a commercial ROM.

## Licence uncertainties to resolve in assistant verification

1. **Compiled binary vs source licence.** All MIT/zlib/GPL entries above license the *code*.
   Redistribution of the author's compiled ROM is normal practice for these projects (each ROM was
   published by the author themselves on GitHub releases or their own itch.io page), but the
   records cite the source licence text, not a per-ROM binary licence.
2. **Multi-licence titles.** `nova-the-squirrel`, `tobu-tobu-girl`, `tobu-tobu-girl-deluxe` split
   code and assets across two licences; CC-BY-4.0 needs attribution, CC-BY-NC-SA-4.0 forbids
   commercial use.
3. **GPL version ambiguity.** `240p-test-mini`, `240pTestSuite` and `ucity` state "version 2 or
   later"/"GPLv3+"; recorded as `-or-later`. `zerosouls` ships plain GPL-3.0 text (no "or later").
4. **Zlib for libbet** requires keeping the notice and not misrepresenting origin — a NOTICE entry
   in `dist/emulator/NOTICE.md` should carry the copyright line.
5. **Test-suite authoring chain.** The 240p Test Suite ports are derived from Artemio Urbina's
   suite with Damian Yerrick's changes; both are credited, and the NES version has an extra
   copyright line (Damian Yerrick, 2015) in the upstream README.
