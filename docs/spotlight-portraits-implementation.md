# Spotlight portraits — implementation notes

Scope: Spotlight only. The homepage and its hero are untouched.

- Nav is a compact 75px bar (~20% shorter than the homepage's 94px); hero titles sit below it.
- Six whole cards fit a desktop row.
- Top games use portrait 2:3 covers with a tall lime rank numeral overlapping the poster.
- The floating detail panel is ~300px wide on desktop.
- A fresh browser gets a demo Continue playing shelf flagged Preview; nothing is persisted to
  `gameflex:recent` until the player's own Start runs, and real history then overrides the shelf.
- The brand promo is the last hero slide and rotates headlines, including the "new tab" line.
- The five up-next previews are real game thumbnails: the strip skips the brand slide.
- Hover no longer pauses the hero; focus, hidden tab, manual pause and reduced motion still do.
