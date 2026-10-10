# Candidate database

This is the discovery and review queue, separate from the 16 live catalogue entries. It does not publish games.

- `discoveries.json`: research worker's new findings, supporting links, requirements and uncertainties.
- `candidates.json`: canonical version-controlled review database. Separate `assistantReview` and `userReview`, with a timestamped decision history.
- `gameflex-candidates.sqlite`: actual SQLite database, regenerated locally from the JSON. Ignored by Git to keep review history readable.
- `candidates.csv`: spreadsheet-friendly view.
- `review-queue.md`: readable game links, sources and questions for our joint review.

## Research and review

```powershell
node scripts/research-db.mjs import research/discoveries.json
node scripts/research-db.mjs list
node scripts/research-db.mjs ready
```

New discoveries always start with both reviews pending. Reimports preserve existing decisions and do not overwrite approved entries. Titles already present in the live catalogue are excluded from import. Candidates with uncertain prerequisites remain clearly labelled.

Assistant verification should inspect the real play page, try launching where feasible, check required files/accounts/payments, controls, device support, and record any limits. Research alone does not count as completed gameplay verification.

When we have evidence, a decision can be recorded explicitly:

```powershell
node scripts/research-db.mjs review GAME-ID assistant verified 'Observed browser launch; requirements checked' 'https://actual-play-page.example'
```

**User verification may only be recorded after the human user explicitly confirms that candidate.** Never infer it from a tool result, worker report, old approval, or silence. Use the confirmation as the review evidence:

```powershell
node scripts/research-db.mjs review GAME-ID user verified 'User tested and approved this candidate' 'Explicit user confirmation in this chat, YYYY-MM-DD'
```

Use `rejected` or `pending` to decline or reopen a decision, with notes and evidence. The SQLite `ready_for_catalogue` view includes only candidates with *both* statuses verified. Publication remains a separate, deliberate source change; this script never writes `dist/` or updates Sites.

## Worker

```powershell
$gameflexResearchPrompt = Get-Content -Raw research/worker-brief.md
hermes -p gameflexresearch --in D:\AI\Gameflex --provider opencode-go -m deepseek-v4.1-flash -t terminal,file -z $gameflexResearchPrompt
```

Agent Reach is installed outside the repository. See `agent-reach-install.md` for the actual installation and channel results. A new worker can repeat bounded discovery batches; no unattended schedule or automatic publication is configured.
