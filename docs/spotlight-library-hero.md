# Spotlight library hero — quality-curated pool, shuffle, five previews, per-game media

Branch `feat/spotlight-library`, worktree `.worktrees/hero-refresh`. Files owned by this
revision: `dist/app.js` and this document. `dist/spotlight.mjs`, `dist/spotlight.css`,
`spotlight-media.json` (artwork worker), `games.json`, `index.html`, `style.css`, the player,
tests, Git, Sites and Trello are out of scope.

## What changed

### 1. Hero rotates only the accepted, quality-curated pool (spotlight page only)

`spotlight-media.json` (artwork worker output) is the source of truth for which featured games
carry authentic, high-quality local artwork. `dist/app.js` now narrows the hero to that map
*before* the shuffle:

- `curatedHeroPool(featured)` keeps a featured game only when `mediaEntryFor(id)` returns a plain
  object whose `src` passes `isLocalArtPath` (a nonempty string under local `assets/`, no `://`,
  no `..`, no backslashes).
- If the curated set holds **at least `HERO_MIN_CURATED = 6`** games, the hero uses exactly that
  set. With the map as shipped that is **8 accepted games** — `halo`, `quake3`, `surf`, `diablo`,
  `dos-doom-dec-1993`, `dos-fallout`, `dos-theme-hospital`, `bo1` — comfortably enough for the five
  previews and for the previous-opener guard.
- If the map is **absent, malformed (non-object / array / number / string root), or supplies fewer
  than six** valid featured entries, the hero **falls back to the full catalogue featured list**
  (all 11) rather than run a thin rotation. The fallback returns the catalogue's own array.
- Games the artwork worker pulls for bad/mismatched art (e.g. The Need for Speed 1995) simply leave
  the hero. They stay in the catalogue: **no catalogue listing is touched** — this only narrows
  which featured games the hero rotates. All 54 games remain listed.

### 2. Homepage untouched (deterministic, all featured)

`buildHero()` still branches on the `page-spotlight` class. The homepage branch is unchanged:
`hero.slides = games.filter(spotlight || featured)` — deterministic catalogue order, all 11
featured/spotlight games, no filtering, no shuffle, no `data-hero-game` stamp.

### 3. Shuffle + previous-opener guard (mechanics unchanged, now over the curated pool)

`shuffleSlides(pool)` runs Fisher–Yates over a `slice()` copy, so the shared catalogue array is
never reordered, then compares the opener with `sessionStorage['gameflex:spotlight-opening']` and,
on a collision, swaps the first slide with a random later one before writing the new opener id
back. This still holds for the 8-game curated pool: every refresh opens on a different game and no
refresh repeats the previous opener. Blocked `sessionStorage` is swallowed and the shuffle still
runs.

### 4. QA hook: `data-hero-game` (spotlight only)

`paintHero()` — inside its existing `if (spotlightPage)` branch — stamps
`#hero-image[data-hero-game="<id>"]` with the live game's id on every paint, so QA can read the game
the spotlight is actually showing alongside `#spotlight-name`. The homepage never enters this
branch, so its DOM is unchanged.

### 5. Per-game media (unchanged from the prior revision)

Each curated slide is shallow-cloned, so `clone.heroArt = media.src` / `clone.heroPosition =
media.position` never reach the shared `games` entry. `paintHero()` applies the crop only on the
spotlight page. Untrusted-map handling is unchanged: a non-object root, missing entry or malformed
field falls back field-by-field instead of throwing, and `heroArtOf` accepts only strings so a bad
field can never reach `art.replace` and blank the hero. `dist/spotlight.mjs`'s `THUMB_COUNT = 5`
previews are built with `Math.min(THUMB_COUNT, total)`, so 8 slides still render five. No changes to
the hero's game description, requirements, or player gating.

## Verification (independently executed here)

- `node --check dist/app.js` — pass. `npm run check` — pass: **54 games** catalogue validated (IDs,
  HTTPS URLs, requirements, audit evidence, artwork files), i.e. listings untouched.
- Bounded harness (the real source of `isLocalArtPath`, `isMediaEntry`, `mediaEntryFor`,
  `curatedHeroPool`, `shuffleSlides` lifted out of `dist/app.js` and run against the live
  `dist/spotlight-media.json` + `dist/games.json`), **19/19 assertions pass**:
  - live map (8 keys) → curated pool of exactly those 8 accepted ids, all a subset of the 11
    featured games;
  - dropping one accepted key shrinks the pool by one and removes that game;
  - five accepted keys, and each of `null` / `undefined` / `[]` / `42` / `'nope'` as the map → fall
    back to the full featured list (returns the list itself);
  - a remote, `../`-traversal or non-string `src` marks that entry invalid and drops the game from
    the pool;
  - 300 simulated refreshes over the curated pool: same set, fresh array, source pool
    byte-identical, **0** repeats of the previous opener, all 8 games seen as opener.

## Honest limits / handoff

- Not run in a real browser here: the live fetch of `spotlight-media.json`, rendered geometry (five
  thumbs, mobile fit, hero-copy overlap) and the `data-hero-game` attribute in the live DOM still
  need the primary agent's browser QA. `data-hero-game` is exercised only by inspection of the
  source path, not by a DOM run.
- The curated pool is derived at load. QA should read the accepted pool from the map
  (`Object.keys(spotlight-media.json)` ∩ featured ids with a valid local `src`) and cross-check it
  against `#hero-image[data-hero-game]` / `#spotlight-name`.
- `scripts/hero-comparison-qa.mjs` still asserts the spotlight hero opens on a fixed `SLIDES[0]`;
  the shuffle plus the curated filter invalidate that assumption. That script is out of this
  worker's scope and needs a follow-up (assert the opener is a member of the curated pool and
  differs from the prior refresh).
