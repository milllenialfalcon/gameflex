# Spotlight thumbnail sources

Thumbnails are keyed by game id in `dist/spotlight-thumbnails.json` (54 entries,
matching the 54 games). Each entry maps `image` (what renders) to `source`
(where the artwork came from). Files live in `dist/assets/thumbnails/`.

Three shapes of entry exist:

- **Downloaded capsule.** 26 local raster files retain their provider source URL
  in the manifest (e.g. `bo1.jpg`, `dos-fallout.jpg`).
- **Direct original.** `image` points at the game's own catalogued artwork
  elsewhere in `dist/assets/` — the printed name is already part of the art
  (e.g. `dos-civilization.webp`, `dos-prince-of-persia-1990.webp`) — 8 entries.
- **Composed (self-contained SVG).** `image` is `assets/thumbnails/<id>.svg`
  built from an original local artwork file, with a vector title layered over it.
  The raster is embedded as a base64 data URI, so each SVG is standalone and
  needs no sibling asset at render time.

## Composition rules for composed SVGs

- Canvas 800x450, `viewBox="0 0 800 450"`, `preserveAspectRatio="xMidYMid slice"`.
- Left-to-right dark gradient scrim (`#0d0f0e`): opacity 0.85 at the left,
  0.45 at 55% width and 0.05 at the right, preserving visible game imagery.
- Title text: Arial bold, uppercase, white, 80px (Halo: 72px), left inset x=40,
  vertically centred, 96px leading, one or two lines taken verbatim from the
  approved wording array — no extra text is added.
- The full game title is retained in the SVG `<title>` element (accessible name).

## Composed title cards (20)

Rebuilt from raw source file bytes; every SVG embeds its own artwork as base64
so no external dependency remains. Wording is exactly the approved array.

- `halo` — `HALO / COMBAT EVOLVED` over `assets/spotlight-v2/halo.jpg`
- `halomobile` — `HALO CE / MOBILE` over `assets/spotlight-v2/halo.jpg`
- `urbanterror` — `URBAN / TERROR` over `assets/urbanterror-cover.jpg`
- `pes6` — `PES 6` over `assets/refresh-pes6-cover.jpg`
- `skate` — `SKATE 3 / FAN GAME` over `assets/refresh-skate-cover.jpg`
- `simpsons` — `THE SIMPSONS / HIT & RUN` over `assets/refresh-simpsons-cover.png`
- `dos-doom-dec-1993` — `DOOM` over `assets/dos-doom-dec-1993.webp`
- `dos-duke-nukem-3d-1996` — `DUKE / NUKEM 3D` over `assets/dos-duke-nukem-3d-1996.webp`
- `dos-lemmings-1991` — `LEMMINGS` over `assets/refresh-dos-lemmings-1991-cover.png`
- `dos-descent` — `DESCENT` over `assets/dos-descent.webp`
- `dos-worms-1995` — `WORMS` over `assets/dos-worms-1995.webp`
- `dos-dune-2-dos-1992` — `DUNE II` over `assets/dos-dune-2-dos-1992.webp`
- `dos-age-of-empires` — `AGE OF / EMPIRES` over `assets/refresh-candidate-dos-age-of-empires.webp`
- `dos-prince-of-persia-2` — `PRINCE OF / PERSIA 2` over `assets/refresh-candidate-dos-prince-of-persia-2.webp`
- `dos-tomb-raider` — `TOMB / RAIDER` over `assets/refresh-candidate-dos-tomb-raider.webp`
- `dos-resident-evil` — `RESIDENT / EVIL` over `assets/refresh-candidate-dos-resident-evil.webp`
- `dos-road-rash` — `ROAD / RASH` over `assets/refresh-candidate-dos-road-rash.webp`
- `dos-dark-forces` — `STAR WARS / DARK FORCES` over `assets/refresh-candidate-dos-dark-forces.webp`
- `dos-the-lost-vikings` — `THE LOST / VIKINGS` over `assets/refresh-candidate-dos-the-lost-vikings.webp`
- `dos-the-need-for-speed-sep-1995` — `NEED FOR / SPEED` over `assets/dos-the-need-for-speed-sep-1995.webp`

## Existing named images retained (34)

Authentic provider capsules and direct originals carrying a printed name,
left unchanged:

- `bo1` — `assets/thumbnails/bo1.jpg`
- `quake3` — `assets/thumbnails/quake3.jpg`
- `surf` — `assets/surf.png`
- `quake` — `assets/thumbnails/quake.jpg`
- `quake2` — `assets/thumbnails/quake2.jpg`
- `rtcw` — `assets/thumbnails/rtcw.jpg`
- `webxash` — `assets/thumbnails/webxash.jpg`
- `vicecity` — `assets/thumbnails/vicecity.jpg`
- `diablo` — `assets/thumbnails/diablo.png`
- `wasmarcade` — `assets/wasmarcade-cover.png`
- `dos-doom-ii-oct-10-1994` — `assets/thumbnails/dos-doom-ii-oct-10-1994.jpg`
- `dos-wolfenstein-3d-may-05-1992` — `assets/thumbnails/dos-wolfenstein-3d-may-05-1992.jpg`
- `dos-prince-of-persia-1990` — `assets/dos-prince-of-persia-1990.webp`
- `dos-civilization` — `assets/dos-civilization.webp`
- `dos-warcraft-orcs-humans` — `assets/dos-warcraft-orcs-humans.webp`
- `dos-settlers2` — `assets/thumbnails/dos-settlers2.png`
- `dos-sim-city-1989` — `assets/dos-sim-city-1989.webp`
- `dos-jazz-jackrabbit` — `assets/thumbnails/dos-jazz-jackrabbit.png`
- `dos-commander-keen4` — `assets/thumbnails/dos-commander-keen4.png`
- `dos-fallout` — `assets/thumbnails/dos-fallout.jpg`
- `dos-heroes-of-might-and-magic-ii` — `assets/thumbnails/dos-heroes-of-might-and-magic-ii.png`
- `dos-mortal-kombat-1993` — `assets/thumbnails/dos-mortal-kombat-1993.png`
- `dos-street-fighter-2` — `assets/dos-street-fighter-2.webp`
- `dos-theme-hospital` — `assets/thumbnails/dos-theme-hospital.png`
- `dos-warcraft-ii` — `assets/refresh-candidate-dos-warcraft-ii.webp`
- `dos-master-of-orion-ii` — `assets/thumbnails/dos-master-of-orion-ii.jpg`
- `dos-sim-city-2000` — `assets/thumbnails/dos-sim-city-2000.png`
- `dos-dungeon-keeper` — `assets/thumbnails/dos-dungeon-keeper.png`
- `dos-secret-of-monkey-island` — `assets/thumbnails/dos-secret-of-monkey-island.jpg`
- `dos-beneath-a-steel-sky` — `assets/thumbnails/dos-beneath-a-steel-sky.jpg`
- `dos-blood` — `assets/thumbnails/dos-blood.jpg`
- `dos-heretic` — `assets/thumbnails/dos-heretic.jpg`
- `dos-battle-chess` — `assets/thumbnails/dos-battle-chess.jpg`
- `dos-rayman` — `assets/thumbnails/dos-rayman.png`

## Verification

Composed SVGs are asserted self-contained (base64 data URI only, base64 payload
> 100 chars, no `__EMBEDDED__` placeholder, no external `href`), the manifest
holds 54 keys, every `image` exists on disk, each composed SVG `<title>` equals
the catalogue title, and no file under `dist/assets/thumbnails/` is left
unreferenced.

Primary review: all 54 images decoded in Edge and were inspected together at card size.
Long subtitles are shortened only in the artwork; accessible card labels retain catalogue names.
The final Halo title uses 72px to stay inside the composition. The SVG canvas is 800x450;
embedded raster detail remains limited by each original source, including native DOS screenshots.
These are sourced images and vector compositions, not newly generated game illustrations.
