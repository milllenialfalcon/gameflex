# Spotlight portraits & hero-refresh QA — final

All source and assets are final. Every gate below was executed against the final implementation and
reported successful. Hermes implemented the artwork and test updates and ran the suites; the primary
scoped, reviewed and releases. No additional tools, tests or research are pending.

## Executed results

- `npm run check` — clean, 54 valid.
- `test:hero` — 17 checks PASS. First advance 7022 ms, hover advance 6958 ms. Homepage 11 slides,
  Spotlight 9 slides.
- `test:discovery` — 9 PASS: all 10 portraits decoded, 6 desktop cards per row, names below the
  artwork, compact panel, filters/favourites/touch/focus.
- `test:library` — 8 PASS: demo preview writes no storage, Start records history and replaces the
  demo shelf.
- `test:browser` — 24 PASS: sandbox routing gates, local deterministic fixtures.

## Visual verification (primary)

- All 10 original covers inspected.
- 1440px desktop: Top 1–6, Top 5–10, promo, final rank layout.
- 390px mobile: final rank layout.

## Confirmed values

- Spotlight title exactly `GameFlex - The Browser is your Console.`
- Compact header 75px; homepage header 94px (homepage otherwise unchanged).

## Provenance

- Source receipt: `docs/spotlight-portraits-artwork.json`
- Implementation source: `docs/spotlight-portraits-implementation.md`

## Limits

- `test:browser` answers external game hosts with deterministic fixtures; real gameplay is not
  tested, and no claim of 100% game compatibility is made.
- Reports under `artifacts/qa/` are ignored and not committed.
