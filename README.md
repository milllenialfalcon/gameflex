# gameflex

A private, curated browser-game directory with 37 listings. Charcoal, electric lime, a capital-case pixel GAMEFLEX wordmark, and artwork-led shelves. Search, genre filters, local favourites and an 11-slide manual spotlight carousel. Shelf buttons and Left/Right keyboard controls advance one game at a time.

This catalogue branch stays separate from the active player feature. The 21 DOS Zone additions are labelled sandbox pending and open internal details only, because the host blocks Gameflex framing. The original 16 destinations retain their existing behaviour until the separate player implementation is integrated. No new DOS outbound-play fallback is introduced.

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
- `scripts/browser-qa.mjs`: search, filters, favourites persistence, dialogs, external links, keyboard shortcuts, and mobile overflow checks. External navigation is intercepted in QA; this tests the directory, not third-party games.

Favourites use `localStorage` under `gameflex:favourites`. No analytics, cookies, server database, or sign-in. Storage failures gracefully fall back to the current visit. “Own files” means original data is required for some or all of the game (Diablo and WebXash include demo options).

## Version control and hosting

- GitHub: https://github.com/milllenialfalcon/gameflex
- Trello: https://trello.com/b/1kXnmQJJ/gameflex (Build workspace)
- Sites: identity in `.openai/hosting.json`, static directory `dist/`. Preserve owner-private access.
- Use feature branches and meaningful commits. The Sites workflow pushes the exact reviewed Git commit to its source repository, packages `dist/`, and privately deploys the saved version. GitHub `origin` remains separate and unchanged.

## Hermes worker

Profile `gameflex` uses provider `opencode-go`, model `deepseek-v4.1-flash`, and a named Hermes project whose primary directory is `D:\AI\Gameflex`.

```powershell
hermes -p gameflex --in D:\AI\Gameflex --provider opencode-go -m deepseek-v4.1-flash -t terminal,file -z 'Your bounded task here. Read AGENTS.md first.'
```

The profile stores its provider credential outside the repository. Do not commit credentials or change another profile for Gameflex work. `AGENTS.md` constrains workers to assigned files; the main agent owns Git, Trello and publication.

## Artwork

Publisher artwork comes from Steam's public store CDN; destination artwork comes from the linked ports' public preview assets. These are contextual catalogue illustrations, not screenshots certifying the browser port's fidelity. See `docs/artwork.json`. Game names and artwork remain owned by their respective rights holders. Silkscreen and Space Grotesk are self-hosted; their OFL licence files are in `dist/assets/`.

DOS Zone artwork receipts: `docs/dos-zone-artwork.json`. Missing-cover receipts: `docs/catalogue-artwork.json`, `docs/additional-artwork.json`, `docs/pes6-artwork.json`. All 37 entries have local artwork. Original-title cover illustrations identify the fan ports; they do not claim to show those builds in action.

Additional checks: `npm run test:catalogue-gate` and `npm run test:catalogue`. Set `GAMEFLEX_PREVIEW` to the active local URL and `PORT` to choose an isolated preview port.

## Discovery queue

The separate Hermes `gameflexresearch` profile installs Agent Reach and researches new candidates. It uses the same project folder and OpenCode Go / DeepSeek V4.1 Flash model. Discoveries remain outside the deployed `dist/` directory.

See `research/README.md`, `research/review-queue.md` and `research/candidates.csv`. The canonical JSON is tracked in Git; `node scripts/research-db.mjs build` regenerates the local SQLite database. Both assistant verification and explicit human verification are required before an entry becomes eligible for a separate catalogue change. No automatic publication or recurring research schedule is configured.
