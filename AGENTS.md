# gameflex

Project root: D:\AI\Gameflex. Use this folder for all Gameflex work, including Hermes sessions.

Frontend is buildless HTML, CSS and JavaScript in dist/. The current frontend has no app credentials, telemetry, sign-in, or backend dependency. Backend sandbox work is separately owned and must stay behind the disabled remote-session flag until reviewed. Favourites stay in localStorage.

Brand: GAMEFLEX logo in a pixel font; charcoal, warm white and electric lime. Keep copy short, concrete and playful. No generic marketing filler. Supporting text must remain comfortably readable on desktop and mobile.

Target player experience: all game launches stay inside Gameflex. Use sandboxed iframes where compatible and permitted, or an isolated remote browser streamed into the Gameflex player. Do not implement external-new-tab fallback. This supersedes the initial external-link design. The player ships with iframe mode; remote streaming stays disabled until a production broker is ready. Only publish destinations supported by verification evidence; HTTP 200 alone does not prove gameplay. Record prerequisites and verification limits honestly. Do not claim universal runtime compatibility or infer hosting/streaming/monetisation permission from missing framing headers.

Hermes worker: profile gameflex, provider opencode-go, model deepseek-v4.1-flash. Always invoke with --in D:\AI\Gameflex. Hermes workers modify only assigned files and never commit, push, publish, or update Trello. Human engineers own separate branches/worktrees and their own commits and PRs. Each engineer updates their assigned Trello card so both can follow progress; the designated release owner handles merge and Sites publication.

Delegation preference: always delegate simple, time-consuming Gameflex jobs to Hermes to conserve the user's ChatGPT usage. This includes bulk link/header checks, discovery, data cleanup and routine file work. The primary agent sets scope, reviews results and makes architecture/product decisions. Do not substitute a ChatGPT subagent for the requested Hermes worker.

Research worker profile: gameflexresearch, same provider/model and project root. Discovered games belong in research/ only, never dist/games.json. Research evidence is not user approval. Candidates need separate assistant verification and explicit user verification before publication; do not infer either from HTTP status or discovery. Do not modify existing review decisions.
