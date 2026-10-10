# Spotlight up-next thumbnails

The spotlight hero (`dist/spotlight.html`) no longer shows the unnumbered progress pills.
In their place `dist/spotlight.mjs` renders three small cover thumbnails for the games that
follow the current slide, plus a thin standalone progress bar for the current slide.

## What renders

- `#hero-dots` is emptied once at init and repopulated with exactly three
  `<button class="hero-thumb" type="button">` nodes. The nodes are stable for the page's
  lifetime: on every hero change only their `data-hero-index`, artwork, `aria-label` and
  `title` are rewritten, so the focused element and its animation state are never discarded.
- Each thumb shows `heroArt` when the catalogue provides it, otherwise `art` — the same
  precedence `app.js` uses for the hero background. Images are `object-fit: cover` in a
  104×58 box (≈16:9) with a 9px radius, hairline border and a lime border on hover/focus.
  Below 720px they flex to one third of the strip (`aspect-ratio: 104/58`, `min-height: 44px`)
  so all three fit a 360px viewport without scrolling.
- Labels: the button carries `aria-label="Show <title>"` and `title="<title>"`; a small
  `UP NEXT` caption sits next to the progress bar and the group is relabelled
  `Up next in the spotlight`. Thumbnails carry no numeric captions.
- The progress bar is a 332px (100% on mobile) 2px track whose lime fill animates for
  `--spot-autoplay` (7s) and restarts on every slide change. It pauses with the same states
  the timer does and shows full width under reduced motion.

## Indexing

The three indexes are `current + 1 … current + 3` modulo the slide count, wrapping once and
never repeating, so they are always the *next* three games and never the current one.

## No changes to app.js

`app.js` is untouched. Its click delegate already resolves `[data-hero-index]` to
`goHero(Number(...))`, and its `ArrowLeft/ArrowRight/Home/End` handler moves `hero.index`
across all 11 slides regardless of which node has focus — both keep working because the
module keeps `data-hero-index` pointing at real catalogue indexes.

Two consequences worth stating plainly:

- `app.js`'s `paintHero` walks `[data-hero-index]` **positionally** and stamps
  `active` / `aria-current` / `tabIndex`. Because the strip holds upcoming games, not the
  current one, that stamping is wrong for this layout. The module's `hero.onChange` listener
  runs after `paintHero` (same tick) and undoes it: no `active`, no `aria-current`, and
  `tabIndex = 0` on all three so the strip stays tab-reachable.
- The arrow-key handler focuses `[data-hero-index="<new index>"]` after moving. That index is
  the new *current* slide, which the strip does not contain, so the lookup finds nothing and
  focus simply stays on the button the visitor was using. Focus is never lost and autoplay
  never moves focus (`hero.next({ announce: false })`).

## Dependency and fallback

The strip needs the game list. It reads the `heroApi.slides` getter (exposed in `app.js`);
until that getter exists, `hero.slides` is undefined and `buildThumbs()` bails out, leaving
the pills `app.js` built in place. The pill rules stay in `spotlight.css` as that fallback.

## Verification

`node --check dist/spotlight.mjs` and `npm run check` pass. The thumbnail layer was also
driven against a stub DOM with an 11-slide hero and a simulated `paintHero` positional stamp:
three stable nodes, correct upcoming indexes (including the 9→10,0,1 wrap), positional stamps
undone, all thumbs tabbable, artwork/labels/tooltips following the slide, progress restarting
on change, no focus movement, and graceful degradation to pills without `hero.slides`.

Not verified in this worktree: real browser rendering, hover/focus visuals and the responsive
breakpoints. No live browser run was performed here — that needs the primary agent's browser QA.
