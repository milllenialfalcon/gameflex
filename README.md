# gameflex

A private, curated browser-game directory. Charcoal, electric lime, a capital-case pixel GAMEFLEX wordmark, and artwork-led shelves. Search the collection, filter by genre, save favourites locally, and launch games inside the Gameflex player. Shelf buttons and Left/Right keyboard controls advance one game at a time.

The catalogue has 54 listings and an 11-slide spotlight carousel. All 38 DOS Zone entries remain sandbox pending: they open an internal explanation, never a playable session or an external fallback. The original 16 entries retain their individual player decisions. The menu beside search links the original homepage and `spotlight.html`, a separate hero comparison with quiet progress controls and seven-second autoplay. The account button is a placeholder.

## Run

Requires Node.js 22.13+ (Node.js 24 recommended for the local SQLite research tools).

```sh
npm run dev
```

Open http://127.0.0.1:4173. The site is buildless; `dist/` is the complete deployable site.

```sh
npm run check
npm install
npm run test:browser
```

Browser QA uses an installed Microsoft Edge browser. Change the Playwright launch channel if needed. `GAMEFLEX_PLAYWRIGHT` can point to an existing Playwright module entry when running in an environment with bundled dependencies.

## Catalogue and evidence

- `docs/link-audit.json` and `.md`: audit of the 25 supplied destinations, checked 2026-10-10. Sixteen included, nine excluded. Launch interfaces and asset paths inspected; no full gameplay certification.
- `scripts/create-catalog.mjs`: original catalogue generator. For this batch use `scripts/add-dos-catalogue.mjs` to add/update the selected DOS records without replacing the original entries or their artwork.
- `scripts/check-catalog.mjs`: IDs, HTTPS destinations, metadata, artwork and audit coverage. Exact user-approved disabled DOS listings may enter the catalogue; enabling new games still requires both verification records. See `docs/dos-catalogue-integration.md`.
- `scripts/probe-links.mjs` and `inspect-launchers.mjs`: HTTP evidence helpers. Their output stays in ignored `artifacts/`; exclude any downloaded HTML that exposes visitor metadata from Git history.
- `scripts/browser-qa.mjs`: catalogue regression plus internal routing, sandbox restrictions, player lifecycle, keyboard access and mobile layout. Game destinations are replaced by deterministic fixtures; this proves the player interface, not third-party gameplay.
- `docs/player-ui.md`: player implementation and runtime limits. `docs/iframe-audit.json` and `.md`: actual bounded iframe observations; these do not approve gameplay or change research decisions.

Favourites use `localStorage` under `gameflex:favourites`. No analytics, cookies, server database, or sign-in. Storage failures gracefully fall back to the current visit. “Own files” means original data is required for some or all of the game (Diablo and WebXash include demo options).

## Version control and hosting

- GitHub: https://github.com/milllenialfalcon/gameflex
- Trello: https://trello.com/b/1kXnmQJJ/gameflex (Build workspace)
- Sites: identity in `.openai/hosting.json`, static directory `dist/`. Preserve owner-private access.
- Use feature branches and meaningful commits. The Sites workflow pushes the exact reviewed Git commit to its source repository, packages `dist/`, and privately deploys the saved version. GitHub `origin` remains separate and unchanged.

## Hermes worker

Profiles `gameflex`, `gameflexresearch` and `gameflexqa` use provider `opencode-go`, model `deepseek-v4.1-flash`, and the Gameflex project folder `D:\AI\Gameflex`. Implementation, research/backend and QA workers receive non-overlapping file assignments. Hermes implements the assigned work and performs the routine QA; the primary agent plans and scopes the work, reviews the results, and owns Git, Trello and publication. Do not substitute a ChatGPT/other-model worker for a requested Hermes worker.

```powershell
hermes -p gameflex --in D:\AI\Gameflex --provider opencode-go -m deepseek-v4.1-flash -t terminal,file -z 'Your bounded task here. Read AGENTS.md first.'
```

The profile stores its provider credential outside the repository. Do not commit credentials or change another profile for Gameflex work. `AGENTS.md` constrains workers to assigned files; the main agent owns Git, Trello and publication.

## Artwork

Publisher artwork comes from Steam's public store CDN; destination artwork comes from the linked ports' public preview assets. These are contextual catalogue illustrations, not screenshots certifying the browser port's fidelity. See `docs/artwork.json`. Game names and artwork remain owned by their respective rights holders. Silkscreen and Space Grotesk are self-hosted; their OFL licence files are in `dist/assets/`.

DOS Zone artwork receipts: `docs/dos-zone-artwork.json` and `research/dos-expansion-artwork.json`. Refreshed hero and landscape-cover receipts: `docs/hero-artwork-refresh.json` and `docs/hero-artwork-integration.json`. All 54 entries have local artwork. Illustrations identify titles; they do not certify the browser builds. Three proposed hero replacements were rejected; their existing media remains. Lemmings uses a native-resolution classic screenshot, not HD artwork.

Additional checks: `npm run test:catalogue-gate` and `npm run test:catalogue`. Set `GAMEFLEX_PREVIEW` to the active local URL and `PORT` to choose an isolated preview port.

## Discovery queue

The separate Hermes `gameflexresearch` profile installs Agent Reach and researches new candidates. It uses the same project folder and OpenCode Go / DeepSeek V4.1 Flash model. Discoveries remain outside the deployed `dist/` directory.

See `research/README.md`, `research/review-queue.md` and `research/candidates.csv`. The canonical JSON is tracked in Git; `node scripts/research-db.mjs build` regenerates the local SQLite database. Both assistant verification and explicit human verification are required before an entry becomes eligible for a separate catalogue change. No automatic publication or recurring research schedule is configured.

Spotlight discovery: five upcoming previews over eight quality-curated shuffled hero games; seven desktop cards; title overlays inside the artwork; headings with subtitles and counts; an editorial Top 10; local recent launches first; Play Now; filter and search grids remain. See docs/spotlight-discovery.md. Run npm run test:discovery, npm run test:hero and npm run test:library for the Spotlight checks.
