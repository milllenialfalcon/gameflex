# DOS Zone catalogue expansion (17 listings)

`scripts/add-dos-expansion.mjs` adds the 17 approved DOS Zone expansion listings to the
catalogue as disabled `sandbox-pending` entries. It consumes `research/dos-top-expansion.json`
and the staged artwork receipts in `research/dos-expansion-artwork.json`, and writes only
`dist/games.json`, `docs/link-audit.json` and `docs/dos-zone-catalogue-approval.json`.

## What was added

17 records: WarCraft II, Age of Empires, Master of Orion II, Sim City 2000, Prince of Persia 2,
Tomb Raider, Resident Evil, Dungeon Keeper, The Secret of Monkey Island, Beneath a Steel Sky,
BLOOD, Heretic, Road Rash, Star Wars: Dark Forces, Battle Chess, Rayman and The Lost Vikings.

`dos-command-and-conquer` is excluded: the staged bundle is an incomplete GDI, video-stripped
build, so it is not a complete original release. The other research-only candidates remain in
`research/` and are not published.

Each entry carries `provider: "dos-zone"`, `availability: "sandbox-pending"`,
`verificationLevel: "launch-page"`, `ownFiles: false`, `checkedAt: "2026-10-10"` and
`featured: false`. Requirements state plainly that the game is not playable in Gameflex yet and
that controls, saves and the hosted edition are unverified.

## Approval ledger

`docs/dos-zone-catalogue-approval.json` retains the existing 21 entries and appends the 17 new
id/url records (38 total). A separate `approvalEvents` array records the exact human answer
"Add disabled listings" with scope `catalogue-listing-only` and the exact 17 id/url list.

This approval covers disabled catalogue listings only. It is not a playable review and not a
user gameplay verification, and it does not change any existing research review decision.
Publishing a playable release still requires separate assistant and explicit user verification.

## Verification limits (honest)

- No gameplay was observed. The host pages expose js-dos launch markup and a bundle URL; the
  emulator was never booted, so controls, saves, edition and performance are unverified.
- The host sends CSP `frame-ancestors` limited to dos.zone and its own CDN, so Gameflex is not
  a permitted framing origin. Audit entries record `framing: "blocked"`. HTTP 200 alone does
  not prove gameplay.
- Artwork is the host page's own og:image/background, staged byte-validated at 1200x630. It is
  staged as `dist/assets/refresh-candidate-<id>.webp`; licence to reuse it is not established
  by the download.
- New listings have no outbound play link and no external-new-tab fallback. The player checks
  `availability` before its config, so listing approval cannot enable gameplay.

## Counts

- `dist/games.json`: 54 games (was 37; +17).
- `docs/link-audit.json`: 63 entries (+17, `include: true`).
- Approval ledger: 38 entries (retained 21, added 17), 1 approval event.
- Featured hero slides: unchanged at 11.
- No Git commit, deploy or Trello update was performed.
