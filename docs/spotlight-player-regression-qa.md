# Spotlight player regression QA

The combined catalogue + in-site player suite (`scripts/browser-qa.mjs`, `npm run test:browser`)
was written against the retired homepage inline-card markup (`.game-card` captions,
`#row-shooters`, `[data-favourite="<id>"]` hearts on the card face). The approved default is now
the Spotlight page (`index.html` carries `page-spotlight`; its browse layer is
`spotlight-discovery.mjs`), so those selectors no longer exist and the suite failed. It was
adapted to the Spotlight DOM; the player, iframe, deep-link, teardown, popup and relay-fixture
coverage is unchanged.

## What changed

- Catalogue cards are now `.sd-card[data-game]`; reachability is asserted over the rendered
  `[data-game]` set (all 54 ids), and every card's accessible `.sd-art` label must name its game
  (ordinary Spotlight cards carry no visible caption — the artwork is the card).
- Favourites are exercised through the floating `.sd-panel`'s shared `[data-favourite]` control
  (the panel also drives the details dialog via `[data-details]`), replacing the removed card-face
  hearts. Panel and player share the one `gameflex:favourites` store, which is still asserted both
  ways.
- The shelf step test uses a real curated row (`[data-sd-shelf="curated"] .sd-row`, `#row-<id>`)
  and its `[data-scroll="<id>"]` arrows instead of `#row-shooters`. Both arrows step exactly one
  card width; ArrowLeft/ArrowRight still move focus one card.
- The retired port 4173 fallback is gone. The suite reads `GAMEFLEX_QA_URL` first, then
  `http://127.0.0.1:4176`, then starts its own private `dist/` server. It does not use
  `GAMEFLEX_PREVIEW`.
- `dist/spotlight-discovery.mjs` was added to the no-`window.open` / no-`target=_blank` source
  check.

Backend/player coverage was preserved, not weakened: sandbox flags
(`allow-scripts allow-same-origin allow-forms allow-pointer-lock`, no popup/top-navigation/…),
frame `allow`/`allowfullscreen`/`src`, restart generation, load timeout + in-site retry/back,
exit teardown (frame gone, hash cleared, lock released, scroll restored), browser back/forward,
deep link + deep reload, invalid/hostile/malformed hashes, blocked pending entries, Fullscreen
cleanup, the single-toggle favourite, and the full loopback mock relay (owner-key header
loopback-only, clamped frames, forwarded input, session delete, late-create cleanup, create
timeout, non-loopback broker never carrying the key) all still run.

## Result

Run: `GAMEFLEX_QA_URL=http://127.0.0.1:4176 GAMEFLEX_PLAYWRIGHT=file:///D:/AI/Gameflex/node_modules/playwright/index.mjs npm run test:browser`
(Playwright 1.62.1, bundled, `channel: msedge`, headless).

- `passed: true`, exit 0. `npm run check` also passes (54 games verified).
- 24 checks passed, 0 console/page errors, 0 popups, 0 dialogs.
- Catalogue: 54 listings (16 reviewed + 38 DOS, all 38 still `sandbox-pending`); 69 cards
  rendered; all 54 ids reachable; no external anchors or `target` attributes in the catalogue.
- Sandbox on the created frame: `allow-scripts allow-same-origin allow-forms allow-pointer-lock`.
- `fullscreenExercised: true`.
- The initial run exposed missing scroll listeners after an artwork repaint. A separate runtime
  fix delegates row scroll events through a passive document capture listener. The final test
  clicks right and left normally, without a resize notification or other synthetic repair.

## Limits

- Artwork, fonts and every game host are replaced by deterministic local fixtures, so this proves
  routing, sandboxing, status wording and cleanup — **not** that any game plays or is hosted for
  embedding. No real backend is contacted; the relay is a local mock.
- Only `scripts/browser-qa.mjs` and this document were changed. No runtime, `games.json`, other
  tests, Git or publish actions were touched, per the assigned scope.
