# Spotlight home QA

QA for the unified Spotlight home: `dist/index.html` and `dist/spotlight.html` are now the same
Spotlight UI (byte-identical copies, same `<html class="page-spotlight">`, same document title
`GameFlex - The Browser is your Console.`). The old copy-led homepage hero is gone, so the former
homepage-baseline assertions were removed. Three Playwright suites cover the change and were run
against the final source (Edge `channel: msedge`, bundled Playwright, private `dist/` server).

## Executed results

- `npm run test:hero` (`scripts/hero-comparison-qa.mjs`) — 22 checks PASS.
  - Both pages render the same Spotlight UI and share the new document title; the old `#hero-heading`
    baseline hero is gone from the homepage.
  - Header, left to right: search → favourites (heart + `#favourite-count`) → account → burger. The
    burger is a PLACEHOLDER popover with no page links. Discover is the one active nav-link; its
    underline rests at 24px, flush right, inside the button, and grows to the full label width over a
    measured ~500ms transition (was ~220ms).
  - Both pages rotate the same 9 slides: 8 quality-curated hero games + 1 brand promo, shuffled per
    load, promo last. The up-next strip shows five real-game thumbnails and skips the promo; the promo
    CTA scrolls the collection with no player, no `#play/` link and no popup, and its copy rotates.
  - Autoplay: measured 6980ms first beat, 7006ms after a pointer Next, 6998ms after a pointer
    preview pick, 6938ms after an explicit Play. Keyboard focus pauses; an explicit Play overrides
    that pause; reduced motion, an offscreen hero, a hidden tab, an open player and a manual pause
    all stand the beat down; hover never pauses. No focus movement, no announcement.
  - Hero heights equal on both pages (820px); composition holds at 1440px and 1920px, and a 390px
    viewport has no overflow with the same header order.
- `npm run test:discovery` (`scripts/spotlight-discovery-qa.mjs`) — 11 checks PASS.
  - Ordinary shelf cards paint NO caption; their accessible label carries the game name and their
    artwork is the `spotlight-thumbnails.json` image where the map supplies a local `assets/` path.
    Only the direct-launch Continue playing cards keep a name line; the Continue playing rail stays.
  - The stroke-only glyph (16px desktop, 12px mobile) sits LEFT of the heading text in the page gutter, vertically centred
    across the h3 + subtitle block; the title (`.sd-title-text`) is left-aligned with the first card
    and the subtitle with the title. 13 glyphs shuffle per load and stay stable across a re-render.
  - Top games unchanged: ten portrait 2:3 covers with decoded posters, a large lime-outlined,
    glowing rank numeral bottom-aligned to each poster and layered behind it.
  - Panel, favourites, search/filter/favourites grids, touch and reduced motion all hold.
- `npm run test:library` (`scripts/spotlight-library-qa.mjs`) — 9 checks PASS.
  - The demo shelf is five direct `#play/<id>` anchors with no badge, no persisted history and a
    labelled sample rail. Opening the ready player records nothing; the player's own Start records
    the id and repaints the shelf; repeat launches dedupe newest-first; malformed stored ids degrade
    quietly; no fabricated progress percentage anywhere.

## Test 390px mobile

Both suites exercise a `390×844` viewport: the header keeps the search → favourites → account →
burger order, the hero stacks legibly with no horizontal overflow, the touch panel stays inside the
viewport and only its explicit action launches the player.

## Fixture isolation and limits

- Every non-loopback request is answered by a local deterministic fixture and both suites assert no
  external host was contacted while browsing; the library suite only reaches a game host through the
  stubbed `iframe.player-frame`. No real gameplay, compatibility or hosting permission is claimed or
  verified — the checks prove the interface, routing and sandbox flags only.
- The reduced-motion and hidden-tab pauses are exercised by dispatching events directly, not by a
  real tab switch; reduced motion is a real context with `reducedMotion: 'reduce'`.

## Unresolved failures

None. All 42 checks across the three suites passed against the final source. No checks were weakened
to reach that result; the assertions were rewritten to the approved changed behaviour (unified pages,
header order, pointer/Play autoplay rules, 500ms underline, glyph-outside-heading, first-card
alignment, captionless ordinary cards with labelled thumbnail artwork, unchanged Top/Continue rows).
