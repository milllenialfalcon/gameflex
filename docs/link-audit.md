# Gameflex link audit — 2026-10-10

Source: `artifacts/raw-link-probes.json` (25 entries) and `artifacts/probes/*.html`.
Method: probe artifacts + follow-up HTTP checks run on 2026-10-10 (`curl`), plus inspection of the
launcher scripts in `artifacts/launchers/`.

**Evidence limit, stated plainly:** everything below is *launch-page* verification — an HTTP
response, a client bundle, or a documented start flow. No game was actually loaded or played during
this audit. Nothing here asserts completed gameplay.

Result: 16 include, 9 exclude.

## Included (16)

| # | Title | URL | Status |
|---|-------|-----|--------|
| 0 | Call of Duty: Black Ops — Zombies (BO1 web port) | https://vel.gg/bo1z | 200 |
| 6 | skate. 3 — Fan Game | https://skate.aaddpp.lol | 200 |
| 8 | Surfd — Classic surf | https://surfd.net | 200 |
| 9 | Halo: Combat Evolved (mitchellhynes web build) | https://mitchellhynes.com/halo | 200 |
| 10 | HCEMobile — Halo: Combat Evolved Mobile | https://hcemobile.com | 200 |
| 11 | PES 6 Web Online Port | https://pes6.optijuegos.net | 200 |
| 13 | GTA: Vice City — WASM Port | https://joncodeofficial.github.io/gta-vice-city-wasm/ | 200 |
| 14 | The Simpsons: Hit & Run - WASM | https://shar-wasm.cjoseph.workers.dev/?skipmovie | 200 |
| 15 | QuakeWorld (q1.pieter.com) | https://q1.pieter.com | 200 |
| 16 | Quake II (q2.pieter.com) | https://q2.pieter.com | 200 |
| 17 | Quake III Arena (q3.pieter.com) | https://q3.pieter.com | 200 |
| 18 | Return to Castle Wolfenstein (rtcw.pieter.com) | https://rtcw.pieter.com | 200 |
| 19 | Urban Terror (ut.pieter.com) | https://ut.pieter.com | 200 |
| 21 | WebXash (x8bitrain) | https://x8bitrain.github.io/webXash/ | 200 |
| 22 | Diablo Web | https://johnimril.github.io/diablo_web/ | 200 |
| 24 | WASM Arcade — PC games collection | https://wasmarcade.com/Fan → /pc-games | 200 |

### Notes on specific entries

**0 — BO1 (vel.gg/bo1z).** `landing.js` was fetched (200, 10,818 bytes) and is a real launcher: it
builds a map list (kino, five, riese, nacht, verruckt, shinonuma, ascension, cotd, shangrila, moon),
fetches the picked map page, sets `html[data-map]`, then imports `play.js` to start the download and
intro. Per-map pages are live too — `https://vel.gg/bo1z/kino` is 200 with
`<html data-map="zombie_theater">` and title "Kino der Toten". Prerequisite: desktop WASM/WebGL browser
plus a large per-map asset pack on first play.

**9 — Halo redirect.** The probe only ever saw the trampoline ("Opening Halo…"). Follow-up: `/halo`
returns 302 → `/halo/` (S3/CloudFront), which is a noindex page whose only action is meta-refresh plus
`window.location.replace("halo.html")`. The resolved target `https://mitchellhynes.com/halo/halo.html`
is 200 and is the real app: title "Halo: Combat Evolved", coi-serviceworker.js, a Turnstile site key, a
signaling worker for online play, and a "Choose your Halo XISO" upload flow. Redirect verified over HTTP,
not by rendering. Prerequisite: the user's own XISO.

**12 — GTA5 archive (t.co/8r990RLwpe).** Excluded. The 2026-10-05 Wayback capture is HTTP 200 but it is
only the replay shell stuck at "Starting... 0%". A CDX query for `playgta5.com` shows the 2026 captures
hold launcher/client JS (`game.js`, `io_worker.js`, `wgpu_worker.js`, `loader.js`) and title art — no
captured game payload (`.wasm`/`.data`/`.bin`/`.pak`). Status 200 alone is insufficient, and runtime
cannot be established.

**19 — ut.pieter.com.** Title corrected: this is **Urban Terror** by FrozenSand, not Unreal Tournament.
The site describes ioUrbanTerror compiled to WebAssembly and links urbanterror.info for the original.
The string "Unreal Tournament" appears nowhere on the page.

**20 — Half-Life (pixelsuft.github.io/hl/).** Excluded. The landing page is 200 (`Xash3D FWGS Emscripten
port`, memory-size setting, Start → `xash.html#<mem>`) and `xash.html`/`xash.js` are 200, but the port's
own `mods.js` lists its game-data archives (halva_en.zip 214 MB, opposing_force_en.zip 221 MB,
halva_rus.zip 304 MB, opposing_force_rus.zip 224 MB) and `https://pixelsuft.github.io/hl/halva_en.zip`
returns **404**, as do `xash.wasm`, `xash.data`, `valve/pak0.pak` and `index.js`. A visitor cannot reach
gameplay, so this is recorded as unverified/broken rather than published.

**21 — WebXash.** The bundle mounts `/rodir/` and `valve/`, keeps saves in IndexedDB (`xash-saves`), and
lazily imports `assets/xash-webrtc-BImYut0F.js` (200) for netplay. Half-Life game data is expected for
gameplay; the data-loading flow was not exercised.

**22 — Diablo Web.** The page itself documents the split: a free shareware demo needs nothing, while the
full game needs the user's own `DIABDAT.MPQ`.

**24 — WASM Arcade.** `/Fan` redirects to `/pc-games`, a 200 collection index listing GTA: Vice City
(reVC), GTA III (re3), The Simpsons: Hit & Run and Minecraft 1.8.8. Recorded as a collection page; the
individual embeds were not separately exercised.

## Excluded (9)

| # | URL | Status | Reason |
|---|-----|--------|--------|
| 1 | https://moon-zombies.pages.dev | 530 | Cloudflare 1016 origin DNS error |
| 2 | https://kino-der-toten.pages.dev | 530 | Cloudflare 1016 origin DNS error |
| 3 | https://cheese-cube.pages.dev | no response | DNS NXDOMAIN (could not resolve host) |
| 4 | https://vibeslops.luckeysystems.com | no response | DNS NXDOMAIN (could not resolve host) |
| 5 | https://ovz-game-production.up.railway.app | 429 | Rate limited — body "rate limited", no app HTML |
| 7 | https://global-terror.net | 200 | Shopify storefront/ARG terminal; no playable build in the served document |
| 12 | https://t.co/8r990RLwpe (archived playgta5.com) | 200 | Replay shell at "Starting... 0%"; no game payload archived — runtime not established |
| 20 | https://pixelsuft.github.io/hl/ | 200 | Launch page live but its game-data zips 404 — gameplay unreachable |
| 23 | https://webwars.link | no response | TLS/SNI certificate mismatch (SEC_E_WRONG_PRINCIPAL), HTTP 000 |

## Prerequisites summary (for copy on the catalogue)

- Bring your own game data: #9 Halo (own XISO), #10 HCEMobile (own Xbox disc image, ~1.8 GB maps),
  #13 Vice City (own `game.tar.gz`), #6 skate. 3 (own converted Skate 3 data), #21 WebXash (Half-Life data).
- Large first load, otherwise nothing to install: #0 BO1 (per-map pack), #18 RTCW (~380 MB, cached),
  #19 Urban Terror (data cached after first load).
- Play immediately, no download: #8 Surfd, #11 PES 6, #15/#16/#17 QuakeWorld/Quake II/Quake III,
  #22 Diablo (free shareware demo), #14 Simpsons: Hit & Run, #24 WASM Arcade.
- Multiplayer-only: #15, #16, #17, #18, #19.

## Verification limits

- Launch-page/HTTP verification only; no title was played, and no screenshot or interactive session was
  captured.
- The Halo JS redirect was followed at the HTTP level; the client-side `location.replace` was not rendered.
- JS-only launchers (#0, #6, #13, #14, #18–#22) were checked via their served HTML, their launcher bundles
  and, where needed, direct fetches of the assets those bundles request. Anything behind a click, a file
  import or a paid/data prerequisite remains unexercised.
- "Include" means *publishable as a verified destination for a link-out*, not "confirmed completable".
