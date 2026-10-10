# Gameflex discovery report — Agent Reach batch 1

Date: 2026-10-10 (UTC). Worker: `gameflexresearch` (opencode-go / deepseek-v4.1-flash), root
D:\AI\Gameflex. Scope: install Agent Reach from the Panniantong GitHub repo and run a first
substantive discovery batch. Full install record: `research/agent-reach-install.md`. Raw evidence:
`artifacts/research/` (git-ignored).

## Headline numbers

- 50 unique candidates in `research/discoveries.json`, all HTTPS, none duplicating the 16 live
  destinations or each other (checked by URL and by game variant).
- Import dry-run against the project's own importer:
  `GAMEFLEX_RESEARCH_DIR=artifacts/research/import-test node scripts/research-db.mjs import ...`
  → `{"added":50,"alreadyQueued":0,"alreadyLive":0}`, `0 ready for catalogue`. Every record enters
  with both reviews pending; nothing was published or approved.

Genre spread (50): Shooter 10, Strategy 8, Puzzle 8, RPG 7, Racing 5, Platformer 3, Incremental 3,
Multiplayer (sport/party/arcade) 3, Action RPG 1, Simulation 1, Sandbox 1.
20 records are marked multiplayer from page claims (unverified); 5 are flagged mobile-capable; none are marked `ownFiles: true`
(no candidate in this batch needs user-supplied game files).

## Agent Reach channels that actually worked

- **Jina Reader** (Agent Reach's `web` channel, `https://r.jina.ai/<url>`) — the load-bearing tool
  for this batch: every candidate was rendered and its on-page launch/game UI text captured in
  `artifacts/research/jina/<slug>.md`. Working.
- **Direct HTTPS probe** (`curl -sS -L`) as a supplement for status codes and redirects.
- **GitHub CLI** — authenticated (`gh api user` → `milllenialfalcon`), but `gh search repos`
  returned no usable rows for the queries tried, so no candidate comes from a GitHub search result.
- **dos.zone public `sitemap.xml`** — a plain `curl` of the emulator site's sitemap gave exact,
  canonical game URLs (2,530 entries). Much more reliable than guessing slugs; it is how the
  17 DOS entries were pinned down.

Channels that did **not** work, and are not claimed:

- **Exa semantic search** — `doctor` reports `exa_search: off`. A temporary `npx -y mcporter`
  (v0.14.2, no global install) reached `https://mcp.exa.ai/mcp` but the service replied
  *"You've hit Exa's free MCP rate limit"*. No API key was bought, so **no Exa search was used**.
- Social/login channels (Twitter, Reddit, Facebook, Instagram, XiaoHongShu, LinkedIn, Boss, Xueqiu)
  — deliberately not installed (cookies/browser sessions out of scope).
- YouTube/yt-dlp — present in the venv, irrelevant to this batch.
- X (Twitter) / Reddit / V2EX-style routes — not needed and not used.

## What "browserEvidence" means here (and what it does not)

Every record says exactly which observation supports it, and distinguishes rendered UI from project
claims. Three evidence grades appear in this batch:

1. **Rendered in-game state** — strongest available without a real play session. Examples:
   RPG MO's world HUD with live chat timestamps (`Dorpat (14, 14) World 1 ... Health 10/10`),
   ev.io's `Building map... Connecting ... Drought Brazil Deathmatch 8 players`, A Dark Room's
   `saved. A Dark Room light fire wood 5 the fire is dead.`, Shell Shockers' loading-tip UI with an
   anonymous Firebase session, Melvor Idle's PlayFab client boot,
   the dos.zone pages' js-dos `Install` prompt plus `Multiplayer Play Online` link.
2. **Rendered launch UI / site copy** — page rendered, but a landing or help view: HaxBall's
   `Play now!` link, OpenDominion's `Play Now` plus a live round-ranking table, Hordes.io's WebGL2
   help page, Micropolis's "This is Micropolis in WebAssembly!" statement (a project claim).
3. **Unresolved** — two records carry explicit issues rather than evidence: `moomoo-io` (Cloudflare
   403 on the rendered fetch; play URL unconfirmed) and `minecraft-classic` (Jina returned an empty
   cached snapshot for the canvas app).

**This is not gameplay verification.** No candidate was played, no match joined, no account created.
Nothing here justifies an `assistantReview: verified` or any `userReview` value — both stay pending
until a separate check and the user's own confirmation.

## Verification limits to keep in mind

- Jina renders the page after load, so on-page strings prove a launch/game UI rendered — they do not
  prove the game starts, loads assets reliably or runs at a playable frame rate.
- Canvas/WebGL games often render almost no DOM text: PokéRogue, Minecraft Classic, Micropolis,
  Krunker (extension-warning overlay instead of a lobby) and Portal: The Flash Version's play.html
  all fall short of a clean confirmation.
- Jina's free tier rate-limited part of the batch (`429` on several fetches, `422` on two). Those
  URLs were re-probed or dropped; a few survivors still carry a "not confirmed" issue.
- Some hosts block automation: HaxBall, NationStates and neal.fun pages returned `403` to plain
  `curl` while rendering fine through Jina; Cloudflare blocked MooMoo.io entirely.
- No interactive browser automation was used by the research worker; it relied on Jina and HTTP probes. The primary agent separately used browser automation for Gameflex UI testing.
- No audio/video/persistence/control-scheme checks were done; `requirements` fields are the best
  reading of page copy, not of a tested run.

## Failed routes and traps found (valuable for later batches)

- `freecivweb.org` — the well-known Freeciv browser URL is now a **gambling/spam domain**
  ("INDOSLOT303"); `play.freeciv.org` does not resolve. Do not publish either.
- `drifthunters.io` — a parked/SEO page ("Toby - Verify Your Connection"), not the racing game.
- `nethack.xd.cm` — HTTP 410 (gone). Angband Live and DCSS webtiles are the working roguelike
  browser routes instead.
- Not browser-playable (desktop downloads only), so excluded after checking: OpenTTD, OpenRCT2,
  OpenRA, CnCNet, Warzone 2100, Luanti, Mindustry (site), Shattered Pixel Dungeon, Spelunky Classic,
  Teeworlds, Soldat, AssaultCube, Sauerbraten, Cataclysm DDA's `/play/` (404).
- Wrong-slug guesses 404'd (fixed via the dos.zone sitemap): wolfenstein-3d, duke-nukem-3d,
  prince-of-persia, commander-keen-4, heretic, wacky-wheels, doom-2, settlers, micro-machines-2.
  Correct DOS Zone slugs are now recorded in `discoveries.json`.
- 1v1.lol, the `maddythorson.itch.io/celesteclassic` slug and `pixel`-style Lexaloffle
  tid guesses either failed TLS/fetch or 404'd; not included.
- dos.zone's `/en/search/?q=` returns 404 for the URL form tried — use the sitemap instead.

## Provenance notes worth carrying into review

- 17 candidates are third-party DOS emulation pages on **dos.zone** (js-dos). They are individual
  game pages, not a link farm, and the pages advertise free ad-light play, but they host commercial
  1990s titles without visible licence statements. Flag licensing/provenance for the user.
- Fan projects using others' IP: PokéRogue (Nintendo), Portal: The Flash Version (Valve).
- Commercial portal hosting: PolyTrack is on Poki (ad-supported) ; other hosted builds were not established in this research.
- Right-sized-for-a-shelf caveat: OpenDominion, NationStates and A Dark Room are long-form or
  asynchronous; DCSS/Angband are keyboard-heavy ASCII roguelikes.

## Next useful research queries / routes

1. **Per-genre Jina sweeps on known-good hosts** — `site:github.io` + WASM ports (e.g.
   "quake wasm browser", "openttd wasm play"), and the io-game directories that render real launch
   UI. Use the dos.zone sitemap again (`grep` for `warcraft|settlers|transport|theme-hospital|
   rollercoaster|simcity|wing-commander|sensible|championship`) to widen strategy/sports/racing.
2. **Native browser shooters and racing** — deadshot.io, kirka.io, moomoo.io-style peers, plus
   madalingames/drifthunters official hosts; verify with Jina and treat Cloudflare blocks as
   "manual check" rather than failures.
3. **Platformer gap** — the weakest category (3 records, all DOS). Candidates worth probing:
   Lexaloffle BBS carts (PICO-8 web player), Nitrome's HTML5 catalogue, Newgrounds/Borne Games
   HTML5 builds, "SuperTux"/"Mari0"-style open-source ports if a WASM build exists.
4. **WebAssembly source ports** — Tomb Raider's OpenLara (fetch threw a WebGL TypeError in the
   headless renderer, so re-check manually), Unvanquished's `/play/` route (404 today), Warzone
   2100, OpenTTD-style community web builds; query GitHub for "wasm" + game names, then test URLs.
5. **Exa** — only if the user supplies an Exa API key; otherwise stay on Jina + sitemaps, which
   proved sufficient and free.

## Files written by this worker

- `research/discoveries.json` — 50 candidate records (schema unchanged; both reviews pending).
- `research/agent-reach-install.md` — install/commit/commands/channel/blocker record.
- `research/discovery-report.md` — this report.
- `artifacts/research/**` — raw evidence (Jina renders, HTTP statuses, probe scripts, candidate
  lists, import dry-run DB). Git-ignored.

No frontend, script, database, doc, Git or Trello file was touched; the live catalogue and both
review decisions are untouched, and the grounds for that are the importer dry-run plus `git status`.

## Primary-agent intake corrections

Before import, unsupported edition, multiplayer, pricing and session-state assertions were softened or removed. Doom’s served edition is unconfirmed. Generic DOS Zone netplay links are not game-specific multiplayer evidence. RPG MO HUD text may be cached or demo content. All 50 candidates remain pending for both reviewers; research is not gameplay verification.
