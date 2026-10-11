# GameFlex V2 — private static preview

A side-by-side comparison build of the GameFlex library. It reuses the same catalogue
records as production V1 but adds collections, counted genre filters, keyboard search
and an in-site iframe player. It is a private preview, not a public release.

Everything here is plain HTML, CSS and JavaScript. There is no build step, no backend,
no sign-in, no telemetry and no app credentials. Favourites and recently opened game
IDs live in `localStorage` only.

## Run the static preview

The page fetches `catalogue.json` and `player-config.json`, so it needs to be served
over HTTP — opening `dist/index.html` from the file system will fail the fetches.

From this folder:

    cd dist
    python -m http.server 8791 --bind 127.0.0.1

Then open http://127.0.0.1:8791/ in a browser.

Any static server works (for example `npx serve dist`). Files are served from `dist/`,
which is also the directory referenced by `.openai/hosting.json`, so this README sits
outside the published root and is not shipped with the site.

## Files

    dist/index.html           page shell: header, search palette, detail dialog, player
    dist/app.js               all rendering, routing, storage and player logic (one script)
    dist/styles.css           brand styling — charcoal, warm white, electric lime
    dist/catalogue.json       54 game records copied verbatim from production V1
    dist/player-config.json   launch state: which record is iframe, unavailable, or unlisted
    dist/assets/              local artwork, fonts and their licence files
    dist/assets/brand/        hero artwork used by the home page

Source data the preview was built from (paths recorded in `catalogue.json` under
`preview.builtFrom`, relative to `dist/`):

    ../../../dist/games.json                 production V1 catalogue
    ../../../dist/player-config.json         production V1 player settings
    ../../../dist/spotlight-thumbnails.json  production V1 artwork map

Catalogue records are copied verbatim: no game was added, removed, reclassified or
rewritten for this preview. Artwork files are local copies inside this preview root,
mapped per game id.

## Launch state

Launch state is read at runtime from `player-config.json`. A game is playable here only
when its `games[]` entry is `"mode": "iframe"` and its catalogue record is not
`sandbox-pending`. Current counts:

    54  catalogue records
    15  playable in the in-site player (iframe mode)
    38  sandbox-pending (full record shown, no launch here)
    16  visible in the library (records without a sandbox-pending flag)

`wasmarcade` is listed `"mode": "unavailable"` because WASM Arcade's own terms prohibit
embedding their pages; the player shows the recorded reason instead of a frame.

## Privacy and production comparison

  - Favourites and recent IDs are stored in this browser's `localStorage` only. Nothing
    is uploaded, and no game progress, scores or completion state is recorded.
  - No accounts, no telemetry, no analytics, no cookies, no third-party scripts.
  - Production V1 lives at https://gameflex.avirayex.chatgpt.site/ . V2 keeps the same
    catalogue data and adds collections, counted filters, a keyboard search palette and
    the in-site player. The V1 links in the preview bar and footer exist only so the two
    builds can be compared side by side; they are not game launch paths.

## Player behaviour and launch policy

Games open in a sandboxed `<iframe>` inside the page:

    sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"

There is no external-new-tab launch path and no new-tab fallback. The player bar shows
where a game's page lives as plain text (its hostname), not as a link. Closing the
player, or a frame that never reports a load, shows an in-page notice — never a route
off this site.

If a frame stays blank, that is a limitation of the destination, not a change in policy:
many hosts refuse framing, need a user gesture, or take longer than the load window to
start. This preview does not attempt to work around that with an external link.

## Honest verification limitation

A frame firing its `load` event confirms only that the **host page** opened inside the
sandbox. It is **not** evidence that the game itself runs, is playable, or is compatible
with any given browser. Confirmed here:

  - every local asset reference resolves and the preview serves over HTTP (index, app,
    styles, catalogue, player-config and artwork all return 200; catalogue parses as 54
    records);
  - the page no longer throws the earlier `querySelector` startup error;
  - there is no external-new-tab launch path in the code.

**Not** verified here: that any iframe game actually plays, that a destination permits
framing beyond a missing `X-Frame-Options`/CSP header, or that gameplay is reachable on
every runtime. HTTP 200 and a `load` event prove neither gameplay nor permission. Do not
read a successful frame load as a compatibility or hosting claim.

## Scope

This preview modifies only its own `dist/` files and this README. It does not change
production V1, catalogue data, status or evidence, `player-config.json`, Git state, Sites
setup or any test suite.
