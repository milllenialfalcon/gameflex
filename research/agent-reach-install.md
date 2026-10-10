# Agent Reach install record (gameflexresearch worker)

Date: 2026-10-10 (UTC). Worker: Hermes profile `gameflexresearch`, provider opencode-go /
model deepseek-v4.1-flash. Project root: D:\AI\Gameflex.

## Source: GitHub repo, not PyPI

Installed from the GitHub repository `https://github.com/Panniantong/agent-reach`, **not** the
unrelated `agent-reach` PyPI package (the project README states the PyPI package of that name is a
different project). The documented pip route is
`pip install https://github.com/Panniantong/agent-reach/archive/main.zip`.

- Upstream commit at install time: `94f06c1969dfc1834001269d79d3ad0972d9dee6`
  (`refs/heads/main`, 2026-10-08, "Merge pull request #787 from
  Panniantong/chore/step0-hotfixes"). Verified with `git ls-remote` against the live repo.
- Installed package version reported by `agent-reach --version`: **Agent Reach v1.5.0**
  (`pyproject.toml` version 1.5.0).

## Layout (kept outside the project workspace)

| Purpose | Location |
|---|---|
| Isolated virtualenv | `C:\Users\avizo\.agent-reach-venv` |
| Python used | `C:\Users\avizo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe` (Python 3.12.14) |
| Read-only upstream clone used to read `docs/install.md` | `C:\Users\avizo\.agent-reach-src` (git clone --depth 1) |
| Downloaded research evidence/logs | `D:\AI\Gameflex\artifacts\research\` (git-ignored via `artifacts/`) |

No project files were used for install; no global OS packages were installed; no PATH changes were
made permanent (the venv `Scripts` directory was only prepended to `PATH` inside the research
shell). No browser-cookie extraction, no social/login channels, no paid services.

## Commands run

```bash
"$PYEXE" -m venv C:/Users/avizo/.agent-reach-venv
"C:/Users/avizo/.agent-reach-venv/Scripts/python.exe" -m pip install \
  "https://github.com/Panniantong/agent-reach/archive/main.zip"
C:/Users/avizo/.agent-reach-venv/Scripts/agent-reach.exe install --env=auto   # read-only check
export PATH="/c/Users/avizo/.agent-reach-venv/Scripts:$PATH"
agent-reach doctor
agent-reach doctor --json
```

`install --env=auto` was run **without** `--system`, so it only checked the machine (no system
changes), exactly as documented in `docs/install.md` ("Safe by default").

## Installer check output (abridged, `install --env=auto`)

- GitHub CLI: already installed ✅
- Node.js: already installed ✅
- mcporter: not installed (Exa route closed unless enabled — see below)
- yt-dlp: reported missing by the installer because the venv `Scripts` dir was not on `PATH` during
  that run; after prepending the venv to `PATH`, `yt-dlp` resolves (installed as a dependency of
  agent-reach: `yt-dlp[default]`).
- Safe-mode channel tally at check time: `4/16` active.

## `agent-reach doctor` results (after venv on PATH)

Working channels (✅ `status: ok` in `doctor --json`):

- `web` — **Jina Reader** (`active_backend: Jina Reader`): any public page can be fetched and
  rendered via `curl -s "https://r.jina.ai/<URL>"`. This was the primary research channel.
- `rss` — `feedparser` (`active_backend: feedparser`).
- `v2ex` — public V2EX API.
- `bilibili` — public search API (search only).

Present but explicitly *not* live-verified by doctor:

- `github` — `gh` CLI present and an explicit auth config was detected; doctor deliberately does
  **not** run `gh auth status` (it writes a device id), so it reports `[!]` rather than ✅. An
  independent `gh api user --jq .login` from this session returned `milllenialfalcon`, i.e. the
  GitHub CLI **is** authenticated and usable for repo/search reads.

Not available / blocked:

- `exa_search` — `status: off`, needs `mcporter` + the Exa MCP. A temporary, non-global
  `npx -y mcporter` (v0.14.2) invocation against `https://mcp.exa.ai/mcp` worked at the transport
  level but the service answered:
  *"You've hit Exa's free MCP rate limit. To continue using without limits, create your own Exa API
  key."* No Exa API key was created (new paid/registered service out of scope), so **Exa search was
  not used** for this batch. mcporter itself was never installed globally.
- `youtube` — `yt-dlp` is installed in the venv but reports as missing unless the venv is on `PATH`;
  not needed for this research.
- `xiaoyuzhou`, `xueqiu`, `twitter`, `reddit`, `facebook`, `instagram`, `xiaohongshu`, `linkedin`,
  `boss` — unconfigured; out of scope (social/login/cookie channels explicitly excluded by the
  task).

## Channels actually used for this research batch

1. **Jina Reader** (`https://r.jina.ai/<url>`, Agent Reach's `web` channel) — headless-rendered
   page text for every candidate: launch/play UI strings, control hints, requirement text. Raw
   captures in `artifacts/research/jina/<slug>.md`.
2. **Direct HTTPS probe** (`curl -sS -L`, follow redirects) as a supplement — final status codes in
   `artifacts/research/jina/meta/<slug>.status`.
3. **GitHub CLI** (`gh api user`, `gh search`) — available and authenticated, but `gh search repos`
   returned no usable rows for the queries tried, so no candidate in this batch is sourced from a
   GitHub search result.

Honest limits of that tooling:

- Jina Reader renders the page after load, so capturing on-page strings such as *"Play now!"*,
  *"WASD to move"*, *"Click to play"* is evidence that the page rendered a launch/game UI — it is
  **not** a playthrough, and it does not prove the game starts, loads assets or is playable.
- Jina's free tier rate-limited a subset of fetches (`429`) and returned `422` for one URL; those
  candidates were re-checked or excluded, and every affected record says so in `issues`.
- Direct `curl` cannot detect a client-side "game failed to start"; several pages return HTTP 200
  yet their Jina body is nearly empty because the game is a canvas/WebGL app with no text.
- No headless browser automation (Playwright) was used: the gameflex project has no `node_modules`
  and no Playwright browser binaries on this host, and installing them exceeded the ~10-minute
  install+first-batch timebox.

## Failures / blockers

- Exa semantic search: blocked by the free MCP rate limit (see above). Not used, not claimed.
- `gh search repos` returned `[]` for several queries; treated as a failed route and not claimed.
- PyPI `agent-reach` deliberately not used.
- One-off URL guesses in the first probe batch 404'd (wrong `dos.zone` slugs, a wrong itch.io slug,
  `nethack.xd.cm` now returns 410). Corrected or dropped in the second batch; see
  `research/discovery-report.md`.
