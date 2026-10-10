# Spotlight library shelves

Scope: `dist/spotlight-discovery.mjs`, `dist/spotlight-discovery.css` (plus this note). Only
`spotlight.html` loads the module and the stylesheet; `index.html`, `app.js`, `player.mjs`,
`style.css`, the catalogue and the player markup are unchanged. The module keeps the init
signature app.js already uses — `initSpotlightDiscovery({ games, mode, isFavourite, syncHearts })`
— and returns `{ render(args), close() }`.

## Shelves, in render order

1. `data-sd-shelf="recent"` — **Continue playing**, subtitle “Reopen your recent launches.” Up to
   20 remembered launches, newest first, deduplicated. Not rendered at all for a fresh visitor.
2. `data-sd-shelf="top"` — **Top games**, subtitle “Ten editorial picks.” Exactly ten unique games,
   each with a large outlined 1..10 rank beside the artwork that tucks 6px behind the card's left
   edge. Ranking is editorial and genre-spanning: the explicit preferred order `halo`, `bo1`,
   `quake3`, `diablo`, `webxash`, `vicecity`, `skate`, `simpsons`, `pes6`, `quake` is taken first,
   but only for games the player can actually launch here (`mode(id).mode === 'iframe'`). Any
   preferred pick that is absent from the catalogue or no longer launchable is skipped, and the
   launchable-first, then whole-catalogue fill tops the row back up to ten unique games. At this
   revision all ten preferred ids are launchable, so the row is exactly that order and spans
   shooters, zombies/action, adventure and sport.
3. `data-sd-shelf="curated"` — short genre/intent rows, at most 8 games each (unchanged cap), with
   the original heading markup: title, zero-padded item count (`<small>08</small>`) and a short
   subtitle. All 54 catalogue IDs sit in these rows independently of the Top and recent shelves,
   so a duplicate in Top or recent never removes a game from the curated plan.
4. Filtered, search and favourites keep the single responsive `.sd-grid`.

### Curated subtitles

Every curated subtitle names the shelf's contents and nothing more. None claims a game is
verified, tested, working or compatible, and none is drawn from the player's configured mode.

| Shelf id | Title | Subtitle |
| --- | --- | --- |
| `ready-shooters` | Start here | Shooters to start with. |
| `ready-more` | Change the pace | Zombies, sport and a few surprises. |
| `shooter-legends` | Shooter legends | Doom, Duke and the classics. |
| `empires` | Build an empire | Plan, build and conquer. |
| `think` | Think it through | Puzzles, tactics and board games. |
| `platformers` | Jump and run | Timed jumps. Secret routes. |
| `adventures` | Stories and adventures | Explore worlds and follow the story. |
| `cities` | Build a city | Build it. Keep it running. |
| `fight-race` | Fight and race | Fast laps and close fights. |
| `more-N` | More classics | More picks from the collection. |

The previous `ready-shooters` subtitle (“Verified in-site launches you can try right now.”) is
gone: an `iframe` mode in `player-config.json` proves a launch is configured, not that gameplay
works, so the shelf no longer implies verification. The standing rule is unchanged — availability
comes from `mode(id).mode === 'iframe'` and nothing here claims compatibility or saved progress.

## Cards

Landscape artwork with the game name inside the thumbnail on the bottom gradient, clamped to two
lines at 14px and never smaller. The name box is an absolutely positioned overlay — `left/right
10px`, `bottom 8px`, `padding 0`, `max-height 2.68em` (exactly two 1.34 line boxes) — and the
bottom gradient lives on `.sd-art::after` alone, so no padding is subtracted from the text: the
full 2.68em holds text. This replaces the earlier `padding: 22px 10px 8px` box, where the top and
bottom padding consumed almost the whole 2.68em and names rendered as one clipped line on desktop.
No title, meta, tag chip or heart control sits under a card. The pending/unavailable chip is a
separate overlay in the artwork's top-left corner, above the name and behind it in paint order, so
neither obscures the other. Every card is a `button.sd-art` with the existing `data-sd-open` /
`data-play` / `data-favourite` / `data-details` handlers. A ranked card's accessible name carries
its place in the row — `Rank 3, show details for Quake III Arena, Arena shooter` — so the numeral
is never a purely visual cue; unranked cards keep the plain `Show details for …` label.

The Top games rank is a grid column beside the artwork (`align-items: end`), tucked behind the
card's left edge by a fixed `6px` rather than an em fraction of a clamp-sized numeral, and painted
at `z-index: 0` under the artwork. The name sits 10px inside that edge at `z-index: 2`, so the
rank can never reach it at any viewport width. The numeral is the site's own body font
(`Space, Arial, sans-serif`, the same stack as `--font`) at `font-weight: 900` — not the pixel
GAMEFLEX logo — sized `clamp(50px, 5.6vw, 88px)` on desktop (80.6px at 1440px) and
`clamp(36px, 9vw, 50px)` at ≤720px, with the original hollow treatment retained: transparent fill,
`2.4px` lime `-webkit-text-stroke`, brightening on hover/focus. Only the family, weight and size
changed here; the two-column ranked card layout is the one already shipped.

Desktop ≥1200px shows seven whole cards per row; 6 / 5 / 4 / 3 / 2 as the viewport narrows. Each
width subtracts one extra pixel from the track maths so sub-pixel rounding cannot create a 1px
scroller. Scrollbars stay hidden; rows of eight keep their last card one arrow step away.

The hover panel (fixed on `<body>`) keeps its hover/keyboard/touch behaviour and Escape handling.
Its primary action on a playable game reads exactly **Play Now**; a game that cannot launch here
still offers **View status** and opens the same blocked player state.

## Local launch history

Storage key `gameflex:recent` (this module's own key; `gameflex:favourites` is untouched).

A launch is recorded only when all of these hold:

- `#player-stage` actually contains `iframe.player-frame` — the player only creates it after the
  visitor presses Start on a configured in-site game;
- the current `#play/<id>` hash names a game that exists in the catalogue and whose player mode is
  `iframe`.

Opening the ready player, blocked or pending entries, unknown or malformed IDs, and ordinary
browsing are never recorded. Creating the frame is an honest record of an attempted launch — it is
not evidence of gameplay, compatibility, or restored progress. Nothing here claims a percentage,
and no save state is promised across origins.

Malformed JSON, non-string entries, duplicate IDs, IDs missing from the catalogue and unavailable
storage all degrade to “no shelf” rather than an error; a storage write failure still keeps the
shelf for the current visit.

When a launch has changed the list, the shelves repaint themselves from the last `render()` args
after the player closes: the module watches the `player-open` class on `<html>`, replaces
`#shelves` only, and notifies `resize` so app.js refreshes its own arrow states.

Focus restoration is row-aware. The card's parent row id (`#row-…`) is captured with the game id
before the swap, and focus returns to that game's card **inside that row** first; a whole-page
match is only the fallback for a row that no longer holds the game. Without this, a launched game
now also appears in the freshly prepended **Continue playing** row, and a plain document-order
query would have dropped focus onto that duplicate instead of the original shelf. Each row's
`scrollLeft` is captured before the swap and re-applied afterwards, so no row jumps back to its
start. The `focus()` call is wrapped in the module's `suppressFocus` flag because the `focusin`
handler opens the detail panel: restoring focus without it would pop the panel open under the
pointer. The player element, its frame and the page scroll position are untouched.

## Verification

- `node --check dist/spotlight-discovery.mjs` passes.
- A Node harness against the real module and `games.json` / `player-config.json` checks shelf
  order, ten unique ranked IDs 1..10 in the exact editorial `TOP_ORDER`, the genre spread, the
  editorial subtitle, 54-ID curated coverage, the ≤8 cap, heading counts and subtitles, the
  in-artwork name overlay, chip ordering, the results grid, the `render`/`close` API, recent
  ordering and dedup, and malformed-storage degradation. All pass.
- Browser checks below were run here against the local preview (`http://127.0.0.1:4176`, serving
  this worktree) in Chrome through the bundled Playwright at `node_modules/playwright`. The
  worktree has no downloaded Playwright browsers, so these used `channel: 'chrome'` (system
  Chrome), not the bundled Chromium build.
  - Name box, four viewports (1440×900, 1024×800, 720×900, 390×780): computed style is
    `padding: 0`, `font-size: 14px`, `max-height: 37.52px`, `-webkit-line-clamp: 2` at every width,
    and no `.sd-name` renders text below its own box. 63 of 64 titles fit fully inside two lines at
    1440. One 30-character title (“Half-Life / Counter-Strike 1.6”) needs three lines and is the
    one ellipsised by the two-line clamp; at 1024 four long titles clamp the same way. That is the
    specified cap, not a clipped single line.
  - Overlap probes at all four viewports: 0 intersections between `.sd-rank` and `.sd-name`, and 0
    between `.sd-badge` and `.sd-name`.
  - Rank/aspect probe at 1440×900 and 390×780 (fresh run for this revision): the top row renders
    ten cards with ranks `1`…`10`, computed rank style is `font-family: Space, Arial, sans-serif`,
    `font-weight: 900`, `80.64px` at 1440 and `36px` at 390, with `color: rgba(0,0,0,0)` plus a
    `2.4px` lime `-webkit-text-stroke` (hollow). 0 `.sd-rank`/`.sd-name` intersections at both
    widths, and the two-digit `10` stays inside its card (82.7px box in a 173.1px card at 1440).
    Ranked buttons read back as `Rank 1, show details for Halo: Combat Evolved, Sci-fi shooter`
    … `Rank 10, show details for Quake, Arena shooter`. Screenshots written to the runner's temp
    dir (`sd-desktop-1440.png`, `sd-mobile-390.png`).
  - Known, unpolished: the rank column is `auto`-sized, so the two-digit `10` card's artwork is
    narrower at 1440 (~96px vs ~130–146px for `1`…`9`) than its neighbours. The numeral and its
    outline stay inside the card and the name (`Quake`) still fits its two lines unclipped, so this
    is left as the shipped two-column layout rather than re-sized here.
  - Subtitles read back from the live DOM match the table above exactly.
  - Repaint, real flow in one run: click a card in `Start here` → `Play Now` → `Start game`
    (frame present in `#player-stage`) → close the player. Result: `gameflex:recent` = `["halo"]`,
    a new **Continue playing** row holding `halo`, focus on the `halo` card in `row-ready-shooters`
    (not the newer duplicate — `halo` was present in three rows), no detail panel open, and every
    row's `scrollLeft` identical before and after (`row-top-games` 191 → 191).
- `npm run check` passes (`node --check dist/app.js`, `node --check dist/player.mjs`,
  `node scripts/check-catalog.mjs`: 54 games).
- `npm run test:discovery` — `scripts/spotlight-discovery-qa.mjs`, which another worker updated in
  the same worktree from the old contract (no text in the artwork, ≤8 cards per shelf, Top games
  uncounted) to the new one (ten ranked Top games, 54 unique curated ids, names inside the
  artwork) — passes all 9 checks against the running preview: browse markup and counts, seven
  whole cards per row at 1440px, hover panel and pointer-crossing, keyboard focus/Escape/outside
  click, favourites persistence, grid views, touch behaviour, reduced motion, and no new tab,
  window, iframe or external request while browsing.
- Not verified here: the same repaint path under a hydration/`pushState` history entry (the run
  used the ready player's own Escape), pointer-driven (non-keyboard) hover restoration, and any
  real gameplay inside the frame — the run only proves a frame was created.
