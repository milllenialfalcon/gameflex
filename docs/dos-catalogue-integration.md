# DOS Zone catalogue batch

This branch is separate from the active `feat/in-site-player` implementation. It adds original-title DOS Zone listings, artwork and a manual hero carousel. It does not implement remote streaming or change the other chat's player files.

DOS Zone sends a CSP `frame-ancestors` allowlist which excludes Gameflex. Every new DOS listing therefore has `availability: "sandbox-pending"`. Its card opens internal details and has no external play link or iframe fallback. The UI must keep that restriction when the player branch integrates this data.

The user's 2026-10-10 instruction explicitly approves adding this selected mainstream batch to the catalogue. `dos-zone-catalogue-approval.json` records that instruction and exact ID/URL scope. This is listing approval, not a claimed user playtest. Existing candidate review decisions are unchanged. The release check allows this exact disabled batch; making a new game playable still requires the separate assistant and user verification records.

Original-title selection excludes named mods, forks, fan remakes and compilation/expansion bundles. It also excludes the incomplete GDI-only Command & Conquer build and RollerCoaster Tycoon Deluxe. Hosted editions may still differ; no page markup can certify a complete unmodified retail distribution.

Before enabling these games in the player, verify a permitted remote-browser route, session isolation, input, fullscreen, audio, loading and persistence. Do not remove the pending status just because the host returns HTTP 200.

`scripts/add-dos-catalogue.mjs` regenerates the curated records and listing approval from the selection and artwork receipts. Image sources are recorded in `docs/dos-zone-artwork.json` and `docs/catalogue-artwork.json`. Existing artwork credits stay in `docs/artwork.json`.
