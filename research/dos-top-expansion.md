# dos.zone top-games expansion — candidate shortlist (research only)

Worker: gameflexresearch (Hermes). Scope: `research/dos-top-expansion.json` and this file only.
Branch/worktree: `D:\AI\Gameflex\.worktrees\hero-refresh`. Date: 2026-10-10.

Status: **pending assistant verification, then pending explicit user verification.** Nothing here is
approved, published, or added to `dist/games.json`. No existing review decision was read as approval
and none was changed. No git commit, no Sites publication, no Trello update.

## Source and method

- Source list: `https://dos.zone/top-games/` — public fetch, HTTP 200, 1,666,503 bytes of HTML.
  1,169 distinct game links were extracted from that page; the shortlist is drawn only from it.
- Per-candidate evidence: public HTTPS fetch with `curl` (no credentials, no account, no login) of
  `https://dos.zone/<slug>/`, saving the status line, the response headers and the raw HTML.
  Status, `Content-Security-Policy`, `X-Frame-Options`, `Content-Type` and `Content-Length` were read
  from those saved headers; title, description, genre chips, art URL and the `.jsdos` bundle URL were
  read from the saved HTML.
- Each `.jsdos` bundle URL was additionally probed with `HEAD` (HTTP 200). Headers only — the bundle
  was not downloaded and not executed, so this says the file is served, not that the game runs.
- AgentReach **is** installed for this worker — isolated venv at `C:\Users\avizo\.agent-reach-venv`
  (`research/agent-reach-install.md` records the install). This dos.zone run did **not** invoke it:
  every page fetch, header capture and bundle probe used `curl` directly, so the evidence below comes
  from the plain public-fetch path only. AgentReach must not be described as absent on this host, and
  no AgentReach output was used as evidence in this batch.

## What "verified" means here, and what does not

Evidence captured: page reachability (HTTP 200), the host's own launch markup, the exact js-dos
bundle URL, genre chips, art URL, and the frame-control headers.

Not captured, and therefore not claimed:

- **No emulator session was started and no gameplay was observed.** HTTP 200 plus launch markup only
  proves the host serves a js-dos launch page. It does not prove the game boots, plays, saves, or
  performs acceptably. Nothing here is a playability claim.
- No controls, keyboard mapping, save persistence, load time, or emulator performance was tested.
- Multiplayer is recorded as `null` on every record: dos.zone carries a site-wide "Multiplayer hub"
  link on all pages, which says nothing about a specific title. No title was exercised online.
- `year` is filled only where the host page states a year in its own description. Where the host page
  is silent the field is `null` with a `yearNote`; the release year was **not** filled in from memory
  or guessed.
- Rights/distribution status of these commercial titles on a third-party emulation host was not
  established. Several records carry that as an explicit review issue.

## Framing constraint (important for the in-site player)

All 18 pages answered with the same header set:

```
Content-Security-Policy: frame-ancestors https://dos.zone https://cdn.dos.zone
    http://br.cdn.dos.zone https://sec.dos.zone https://test.js-dos.com
    https://discord.com https://*.discord.com
```

- **No `X-Frame-Options` header is sent** on any of the 18 pages (0 of 18 in the saved headers).
- The effective frame control is the CSP `frame-ancestors` list, and it names only dos.zone and its
  own CDN/helper origins plus Discord. Gameflex is not in that list.
- Consequence: framing `https://dos.zone/<game>/` from the Gameflex player origin is refused by the
  host today. "No X-Frame-Options" must not be read as permission to frame, and it must not be read as
  a hosting, streaming or monetisation permission either. An in-page js-dos embed with our own
  licensed bundle, or an agreed arrangement with the host, would be a separate decision for the
  primary agent — it is not implied by this research.

## Exclusions applied

Excluded from the dos.zone top-games list:

- Mods / total conversions: Heroes III "Horn of the Abyss", "Heroes III .5: In the Wake of the Gods",
  Duke Nukem 3D expansions ("Duke it out in D.C.", "Penthouse Paradise", "Caribbean"), Chex Quest,
  Wolfendoom, Carmageddon: Splat Pack, Spear of Destiny, Red Alert: Counterstrike, Final DOOM,
  GTA: London 1969 and the two "reGTA" GTA entries (5th-of-list duplicates of GTA I/II/III).
- Forks / source ports / reimplementations: "Open Transport Tycoon Deluxe", "Dune II (Open Dune)",
  "Hexen II (FTEQW)", and the plain **Grand Theft Auto (1997)** and **Grand Theft Auto 2** pages —
  these two render with the `reGTA` runtime and contain **no js-dos bundle** in their markup
  (`Install` prompt absent, no `.jsdos` reference), so they fail the bundle requirement.
- Bundles / compilations / demo builds: "Heroes of Might and Magic III: Complete Edition",
  "Heroes Chronicles", "Heroes III DEMO", "Microsoft Best Of Entertainment Pack", "DOS bundle"
  listings, "Need For Speed: Special Edition".
- Editions we cannot pin down: "Carmageddon 3Dfx", "Grand Theft Auto (3Dfx)", "GTA London 1969
  (3Dfx)", "Turok (3Dfx)", "Direct3D 5/7/8 test" entries, "Tomb Raider 3dfx" build, QBasic 4.5,
  "Unreal Tournament 99" and "Microsoft 3D Pinball: Space Cadet" — the last two were fetched and
  checked: both returned HTTP 200 but **no js-dos bundle in the markup**, so they were dropped.
- Already in the published catalogue in this worktree (37 entries, `dist/games.json`), therefore out
  of scope: DOOM, DOOM II, Wolfenstein 3D, Duke Nukem 3D, Prince of Persia, Civilization, Warcraft:
  Orcs & Humans, Settlers II, Sim City, Lemmings, Jazz Jackrabbit, Commander Keen 4, Descent,
  Fallout, Heroes of Might and Magic II, Worms (1995), The Need for Speed, Mortal Kombat, Street
  Fighter II, Dune II, Theme Hospital, Quake, Quake II, Quake III, Half-Life/CS 1.6, Diablo, plus the
  non-DOS entries (Halo, Black Ops Zombies, CS Surf, Return to Castle Wolfenstein, Urban Terror,
  Halo CE Mobile, PES 6, Skate 3 fan game, GTA: Vice City, Simpsons Hit & Run, WASM Arcade).
- Already present in `research/candidates.json` and left untouched: X-COM: UFO Defense, Stunts,
  Wacky Wheels, Prince of Persia (1990), Civilization, Lemmings, Jazz Jackrabbit, Commander Keen 4,
  Settlers II, Descent, Fallout, Warcraft, DOOM I/II, Wolfenstein 3D, Duke Nukem 3D, Master of Magic
  peers, and the non-DOS web-game candidates. The shortlist below deliberately contains titles that
  appear in neither `dist/games.json` nor `candidates.json`.

## Shortlist: 18 candidates (all HTTP 200, all with a js-dos bundle)

| # | id | title | play URL | category | year | js-dos bundle | art |
|---|----|-------|----------|----------|------|---------------|-----|
| 1 | dos-warcraft-ii | WarCraft II: Tides of Darkness | https://dos.zone/warcraft-ii-tides-of-darkness/ | Strategy | not stated on page | //cdn.dos.zone/custom/dos/war2.jsdos | https://dos.zone/images/containers/assets/backgrounds/warcraft2_bg.jpg/612aad8d8fcd3ae169f3681bf2874fa1.webp |
| 2 | dos-age-of-empires | Age of Empires | https://dos.zone/age-of-empires-1997/ | Strategy | not stated on page | //cdn.dos.zone/custom/dos/aoe-nic.jsdos | https://dos.zone/images/containers/assets/backgrounds/xyczbg.aoe.jpg/aa847e07b4663f9744c6a3f00be11458.webp |
| 3 | dos-master-of-orion-ii | Master of Orion II: Battle at Antares | https://dos.zone/master-of-orion-ii-battle-at-antares-1996/ | Strategy | not stated on page | //br.cdn.dos.zone/published/br.qrvkmj.MOO2fullcd.jsdos | https://dos.zone/images/containers/assets/backgrounds/qrvkmj.78_49d24ed9c4656.jpg/4846b2aaa1d2b65cdad913fdebc04661.webp |
| 4 | dos-command-and-conquer | Command & Conquer | https://dos.zone/command-conquer-sep-26-1995/ | Strategy | not stated on page | //cdn.dos.zone/custom/dos/cc_gdi_novid.jsdos | https://dos.zone/images/http/original/2X/a/ae3116154ac2b9725465dc1fe59fa39507886432.png/7bf1bed5bf22f0a6ecc8c7fb43d74591.webp |
| 5 | dos-sim-city-2000 | Sim City 2000 | https://dos.zone/sim-city-2000-1993/ | Simulation | 2000 (host description) | //cdn.dos.zone/original/2X/b/b1ed3b93829bdff0c9062c5642767825dd52baf1.jsdos | https://dos.zone/images/http/original/2X/4/41f12cbd023b7732e669b6ade8e811bb5e7c28b1.jpeg/fd95b58bdd71ef68018754e1fa47703f.webp |
| 6 | dos-dungeon-keeper | Dungeon Keeper | https://dos.zone/dungeon-keeper/ | Strategy | not stated on page | //br.cdn.dos.zone/published/br.zxxqxh.dungeon-keeper-hranitel-podzemelya_1.jsdos | https://dos.zone/images/containers/assets/backgrounds/zxxqxh.%D0%A1%D0%BA%D1%80%D0%B8%D0%BD%D1%88%D0%BE%D1%82%2015-03-2025%20163731.jpg/78647edbde10fe877870c599607cddaf.webp |
| 7 | dos-battle-chess | Battle Chess | https://dos.zone/battle-chess-jan-1989/ | Strategy (board, chess) | not stated on page | //cdn.dos.zone/custom/dos/battle-chess.jsdos | https://dos.zone/images/http/original/2X/9/9f4bbdb9bc6117e40d34bdeaf63ffed699ba08fd.gif/f5a2ec96ee7ce0864b8240fb9d8d38a3.webp |
| 8 | dos-prince-of-persia-2 | Prince of Persia 2: The Shadow & The Flame | https://dos.zone/prince-of-persia-2-the-shadow-the-flame-1993/ | Platformer | not stated on page | //cdn.dos.zone/original/2X/9/9ce632235395211854a728cf49372bc12b66f628.jsdos | https://dos.zone/images/http/original/2X/4/438e81dcc2c9daa4f6e1707e72b91bd814fb2c72.png/089e1f3261a8867e0f8d7c247f0d70ac.webp |
| 9 | dos-rayman | Rayman | https://dos.zone/rayman/ | Platformer | 1995 (host description) | //br.cdn.dos.zone/published/br.fqmpti.Rayman.jsdos | https://dos.zone/images/containers/assets/backgrounds/fqmpti.rayman_04.gif/837015277fe2e32b0fd1117671c947b7.webp |
| 10 | dos-tomb-raider | Tomb Raider | https://dos.zone/tomb-raider/ | Action-adventure | 1996 (host description) | //br.cdn.dos.zone/published/br.lhazhk.TombRaider.jsdos | https://dos.zone/images/containers/assets/backgrounds/lhazhk.8_12f0b6d8a9.png/d44c441b8ff939af74625c8375f4c8c1.webp |
| 11 | dos-the-lost-vikings | The Lost Vikings | https://dos.zone/the-lost-vikings-1993/ | Puzzle (platformer) | not stated on page | //cdn.dos.zone/original/2X/1/1b063b2520052ebb504184667ac95e72423331de.jsdos | https://dos.zone/images/http/original/2X/e/edb2606fad8a53c7e26d6affa25db7fe282329cd.png/7d46ffb9461fc6433f96594de2aeb4fa.webp |
| 12 | dos-resident-evil | Resident Evil | https://dos.zone/resident-evil/ | Survival horror | 1997 (host description) | //br.cdn.dos.zone/published/br.njvdnz.RE1upd.jsdos | https://dos.zone/images/containers/assets/backgrounds/njvdnz.1590418316113745245.jpg/30cbcbf882e2c9fa9e0d727146e8a9a1.webp |
| 13 | dos-blood | BLOOD | https://dos.zone/blood-may-31-1997/ | Shooter | not stated on page | //cdn.dos.zone/custom/dos/blood-lowres.jsdos | https://dos.zone/images/containers/assets/backgrounds/blood.jpeg/223cce2f5e24f4c0fd647ccd6f400008.webp |
| 14 | dos-dark-forces | Star Wars: Dark Forces | https://dos.zone/dark-forces/ | Shooter | 1995 (host description) | //br.cdn.dos.zone/published/br.otzrkb.DARKFORC.jsdos | https://dos.zone/images/containers/assets/backgrounds/otzrkb.5nfrjuvomksn8oiobomx8g.jpeg/2c304b7d2e0e51fc397859c6bebb65a1.webp |
| 15 | dos-heretic | Heretic: Shadow of the Serpent Riders | https://dos.zone/heretic-1994/ | Shooter | not stated on page | //br.cdn.dos.zone/published/br.sychaq.HereticUPD.jsdos | https://dos.zone/images/containers/assets/backgrounds/sychaq.62506260.jpg/4f33fa5e7c7d201c4d6da6393dfb114f.webp |
| 16 | dos-road-rash | Road Rash | https://dos.zone/road-rash/ | Racing | 1996 (host description) | //br.cdn.dos.zone/published/br.sdylsu.RoadRash.jsdos | https://dos.zone/images/containers/assets/backgrounds/sdylsu.34f4a1b2ddcae82b52960b2b28745936.webp/5c6328c71e673aaf8c62393f6ab4fe54.webp |
| 17 | dos-secret-of-monkey-island | The Secret of Monkey Island | https://dos.zone/the-secret-of-monkey-island/ | Adventure | not stated on page | //cdn.dos.zone/custom/dos/monkey-island-1.jsdos | https://dos.zone/images/http/custom/screenshots/monkey-island-1.jpeg/c52792d0a366041ba93364b4f634d305.webp |
| 18 | dos-beneath-a-steel-sky | Beneath a Steel Sky | https://dos.zone/beneath-a-steel-sky-1994/ | Adventure | not stated on page | //cdn.dos.zone/original/2X/9/9392bef006fcb485bd851fe3859bbeec659bbcf0.jsdos | https://dos.zone/images/http/original/2X/1/17a6a4cefe9263feb3c0049c98f4ae45082a9933.png/60313c7fa88f998977e0852a5f661711.webp |

Bundle URLs are recorded exactly as they appear in the page markup (protocol-relative `//`). The JSON
record for each entry carries the full header evidence, host genre chips, description, launch-markup
note, and per-title issues. The BLOOD record id is `dos-blood`; the host page title is `BLOOD`
(1997, Monolith).

Host genre chips worth noting: Sim City 2000 and Tomb Raider carry series links
(`/genre/sim-city-2000-1993/`, `/genre/tomb-raider/`) instead of genre labels, so the `category` field
there is our classification, not the host's. Age of Empires and Resident Evil are filed by the host
under "Windows 95 / Games for Windows" rather than MS-DOS, as is Road Rash; those builds are Windows-era
binaries emulated under js-dos and their provenance should be reviewed before publication.

## Database integration (2026-10-10, this worktree)

17 of the 18 records were imported into the canonical research database with
`node scripts/research-db.mjs import <payload>`; the payload was built from `research/dos-top-expansion.json`.
Result: `{"added":17,"alreadyQueued":0,"alreadyLive":0}` — database now 67 candidates, 0 cleared by both
reviewers. Every new record is `assistantReview: pending` + `userReview: pending` with an empty
`reviewEvents` list, and all 50 pre-existing records (including their review decisions) are unchanged.

- **`dos-command-and-conquer` was excluded** from the integration and from artwork staging: its bundle
  (`cc_gdi_novid.jsdos`) is an incomplete, GDI-only, video-stripped build. It stays in the shortlist
  above as a research record only.
- Artwork was downloaded and byte-validated in the same run — receipt `research/dos-expansion-artwork.json`,
  assets `dist/assets/refresh-candidate-<id>.webp`. These are **staging assets for a possible future,
  separately approved listing set, not active games**; nothing was added to `dist/games.json`.
- Bundle **version/edition is unknown for all 17** records: the `.jsdos` file was `HEAD`-probed only and
  never downloaded or executed. BLOOD is the recorded `blood-lowres` build, which stays a caveat, not a
  confirmed resolution.
- The `.jsdos` bundle URL is not a field in the candidate schema, so it lives in
  `research/dos-top-expansion.json` and in the artwork receipt, keyed by candidate id.

## Verification limits (please read before approving)

1. Every entry is **unplayed**. Only the launch page and its bundle reference were captured.
2. `year` is `null` for 12 of 18 because the host page does not state one. Those years need a separate
   source during review; they were not filled from memory.
3. Edition/bundle contents are unconfirmed beyond what the host slug and page copy imply: Age of
   Empires (`aoe-nic`), Command & Conquer (`cc_gdi_novid` — GDI build, no FMV), BLOOD (`lowres`),
   Dungeon Keeper (transliterated Russian bundle name), Monkey Island (EGA/VGA/talkie unclear),
   Heretic (full three-episode retail build).
4. Rights status on a third-party emulation host is unresolved for every commercial title.
5. The CSP finding above is the reason these pages cannot be framed by Gameflex as-is.
6. Art URLs are the hosts' `og:image` assets; licence to reuse them in the Gameflex catalogue was not
   established — treat as placeholders pending review.

## Next steps (not performed here)

1. Assistant verification pass over `research/dos-top-expansion.json`.
2. Explicit user verification for the subset worth publishing.
3. Primary agent decides the launch mechanism, given the frame-ancestors constraint, before any entry
   moves into `dist/games.json`. Git commits, Sites publication and Trello updates remain with the
   primary agent.
