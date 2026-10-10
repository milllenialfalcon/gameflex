# Hermes Gameflex worker

Configured 2026-10-10:

- Profile: gameflex (isolated from other project profiles).
- Provider: opencode-go, endpoint https://opencode.ai/zen/go/v1.
- Model: deepseek-v4.1-flash (listed by `opencode models opencode-go`).
- Workspace/project: Gameflex, D:\AI\Gameflex.
- Tool scope: terminal,file. Copied MCP configuration cleared for this dedicated worker profile.
- Existing OpenCode Go credential configured in the profile's external `.env`; never copied into the repo.
- Routing header configured for the worker; Hermes also supports native OpenCode session affinity.

Completed delegated work: follow-up verification of 25 game destinations; wrote `docs/link-audit.json` and `docs/link-audit.md`. Result: 16 include, 9 exclude. Main agent reviewed prerequisites and used audit inclusion to generate the catalogue.

The initial worker attempt was stopped after setup problems; the reconfigured invocation completed successfully with the requested provider/model. No substitution was made.

## Discovery worker

Profile `gameflexresearch` is a separate Hermes worker using OpenCode Go / `deepseek-v4.1-flash`. Its named Gameflex project's primary directory is also `D:\AI\Gameflex`. It installs Agent Reach outside the repository, researches public game sources and writes findings to `research/discoveries.json` plus installation/research receipts. See `research/worker-brief.md` and `research/README.md`.

The main agent imports findings into the review database. Discovery never supplies assistant or user verification. Both reviews start pending. Only explicit human confirmation may set user verification. No worker may add research entries directly to the live catalogue.
