# Hero comparison: homepage baseline vs Spotlight preview

Two heroes ship side by side so the choice can be judged against the live homepage rather
than against a mockup.

- `dist/index.html` — the current homepage hero. Untouched. This is the comparison baseline.
- `dist/spotlight.html` — the new full-bleed, title-led hero, with the same catalogue and the
  same in-site player underneath.

Both pages are reachable from the header menu that sits immediately right of search. The
homepage keeps the hero it has today; the spotlight page is a preview route, not a
replacement.

## What the spotlight page does differently

| | Homepage (baseline) | Spotlight preview |
| --- | --- | --- |
| Hero band | 570px, static intro copy | `min(86vh, 820px)`, full-bleed |
| Headline | generic copy: "Old favourites. Right here." | the current game title, as the page `h1` |
| Backdrop | sharp wide `heroArt` with a left scrim | reviewed landscape artwork, graded under charcoal gradients |
| Game copy | small right-hand panel, right-aligned | left column: tag, meta, description, requirements — the description is 16–19px on a 56ch measure |
| Position markers | numbered selectors `01…11` plus a `01 / 11` index | unnumbered progress pills with a 7s lime fill, no numeric index |
| Controls | arrows and selectors inside the panel | arrows, pause and pills in the bottom-right corner |
| Autoplay | none | 7s fade, with pause on hover, focus, hidden tab, off-screen scroll, player/dialog open, manual pause and reduced motion |
| Player | unchanged | unchanged, shared with the homepage |

Everything else is shared: `dist/app.js` drives both pages, and the catalogue, filters,
favourites, details dialog, player markup and player logic are identical. The only
integration hook is the `page-spotlight` class on `<html>`: `app.js` reads it to decide
whether to load `dist/spotlight.mjs`, and the spotlight hero CSS lives in its own
`dist/spotlight.css`, loaded only by the preview page. Nothing in the homepage hero path
changes, and the homepage never loads the autoplay module.

## Autoplay policy

- One interval, 7 seconds, declared as `--spot-autoplay: 7s` in `dist/spotlight.css`.
  `dist/spotlight.mjs` reads that declaration, so the timer and the pill fill cannot drift apart.
- The advance fades the backdrop and swaps title, meta, description, requirements and the
  active pill together. It moves no focus and writes no live-region announcement: the
  `#hero-status` text stays on the last manual selection. Manual next/previous/pills/keyboard
  still announce politely.
- Autoplay stands down while the visitor hovers the hero, while focus is anywhere inside it,
  while the tab is hidden, while the hero is scrolled out of view, while the player or a
  dialog is open, while the pause button is pressed, and permanently under
  `prefers-reduced-motion: reduce`. It resumes on its own when the reason clears.
- The pause button satisfies the WCAG 2.2.2 pause requirement, and reduced motion never
  starts the slideshow at all.

## Requests

- The description is always readable: 16–19px on desktop, 16px on mobile, on a 56-character
  measure over a darkened gradient, not over raw artwork.
- Pills are unnumbered but keep an accessible name ("Show spotlight 3 of 11: Quake III
  Arena") and a hover/focus tooltip with the game title.
- Eight slides use refreshed high-resolution publisher/store artwork. Three retain existing media because proposed replacements failed edition or quality review. Backdrops retain detail without artificial blur.
- Sport filter: the `sports` category holds CS Surf, PES 6 and Skate 3, so the label is now
  "Sports" on both pages.
- The account icon is a placeholder only: it opens a "coming soon" popover. There is no
  sign-in, no credential field and no backend.

## Preview locally

    cd D:\AI\Gameflex\.worktrees\hero-refresh
    node scripts/serve.mjs

Then open `http://127.0.0.1:4173/index.html` and
`http://127.0.0.1:4173/spotlight.html`, and switch between them with the header menu.

## Checks

    cd D:\AI\Gameflex\.worktrees\hero-refresh
    node --check dist/app.js && node --check dist/spotlight.mjs
    node scripts/check-catalog.mjs
    node scripts/hero-comparison-qa.mjs

`scripts/hero-comparison-qa.mjs` drives the bundled Edge build through Playwright
(`channel: msedge`); it downloads no browser and installs nothing. If Playwright is not
resolvable from the working copy, point `GAMEFLEX_PLAYWRIGHT` at its `index.mjs`.

It asserts the homepage baseline (generic headline, numbered selectors, `01 / 11` index,
570px band, no pause control, no autoplay), the spotlight structure (one `h1` that is the
current game title, left-hand readable copy, unnumbered pills, controls bottom right), the
autoplay behaviour with real time windows (a measured ~7s advance, then no advance for a
full interval under hover, focus, hidden tab and manual pause, and no advance at all under
reduced motion), the header menu and account popover on both pages, the Sports rename, and
that every launch — hero or card, playable or sandbox-pending — still goes through the
existing sandbox player with no new tab and no external anchor.

Screenshots and `artifacts/qa/hero-comparison-report.json` land in the git-ignored
`artifacts/qa/` folder (`hero-home-desktop.png`, `hero-spotlight-desktop.png`,
`hero-spotlight-mobile.png`).

## Verification limits — read these before publishing

- Verified: the behaviours listed above, on the bundled Edge build, at 1440×1000, 1920×1080
  and 390×844, with real 7-second timing windows. Measured hero band heights: homepage 570px,
  spotlight 820px at 1440×1000.
- The hidden-tab pause is exercised by overriding `document.visibilityState` and dispatching
  `visibilitychange`. A real tab switch, window minimise and OS-level backgrounding were not
  performed.
- Reduced motion was exercised with Playwright's `reducedMotion: 'reduce'` emulation, not with
  a changed OS setting.
- Hover and focus pauses were exercised with a real pointer and real focus on the hero. Touch
  devices were not tested: a tap moves focus, which pauses, but that path is inferred.
- No gameplay was verified by this work. The QA never loads a game frame; the player was only
  opened far enough to confirm the correct game, the blocked state for sandbox-pending
  entries, and the absence of external fallbacks.
- Only geometry and typography were asserted programmatically. The screenshots in
  `artifacts/qa/` are the visual record; a human should look at them before the design is
  promoted to the homepage.
- The spotlight page is a preview route and is not linked from the published catalogue
  impression of the homepage beyond the header menu. It does not replace the homepage hero.

Primary review: removed backdrop blur, fixed mobile pill overflow, and preserved remaining autoplay time across pauses so progress and transitions stay aligned. Hermes UI work was stopped after its bounded implementation and QA; final integration and visual review were completed by the primary.
