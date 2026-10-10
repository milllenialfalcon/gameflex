# Gameflex: hosting games that play in the browser

Research date: 10 October 2026. Decision proposal, not an infrastructure deployment.

Hermes `gameflexresearch`, using OpenCode Go / DeepSeek V4.1 Flash in `D:\AI\Gameflex`, gathered the supporting runtime research. The primary agent reviewed the architecture, source claims and economics below. Nothing in this study verifies a catalogue game's gameplay or grants publishing approval.

## 1. Recommendation

Build one Gameflex player with three runtime adapters. Make licensed web builds the default, add browser emulators for suitable classics, and reserve cloud streaming for selected licensed games whose demand justifies the operating cost. All three stay inside Gameflex.

Owning the delivery infrastructure does not require moving every player's computation onto our servers. Hosting a game's HTML, WASM and assets ourselves while executing them on the player's device is first-party hosting. A sandboxed iframe can be the isolation boundary for our own hosted build as well as for an approved partner embed.

| Route | Where the game runs | Suitable content | Main constraint |
|---|---|---|---|
| HTML5 / WebAssembly | Player's CPU/GPU | Web-native games, authorised engine exports and ports | Download size, device capability and porting work |
| Browser emulator | Player's CPU/GPU | Selected DOS, console and adventure titles | Per-title fidelity, controls, runtime/core and asset licences |
| Cloud streaming | Our rented CPU/GPU; browser receives audio/video and sends input | Authorised Windows/Linux games and demanding ports | Latency, concurrency, recurring cost and production operations |

There is no general-purpose conversion that turns an arbitrary Windows game into a browser game. A web port needs an appropriate engine export or source-level adaptation. A cloud worker running Chromium also cannot automatically run the original Windows executable: native cloud gaming requires an appropriate operating system, GPU, drivers and compatible game build.

## 2. What established platforms teach us

Browser portals standardise the game build and its integration. Poki's developer requirements cover responsive controls, storage failures, asset requests and ad behavior; its SDK exposes lifecycle hooks. The applicable lesson is to accept controlled, tested builds and integrate them with a platform contract. A list of URLs alone cannot deliver consistent startup, saves or ads. [Poki requirements](https://developers.poki.com/guide/requirements-quality), [Poki SDK](https://developers.poki.com/guide/sdk-overview).

Cloud gaming also has client requirements. NVIDIA's browser guidance specifies 15 Mbps for 720p60, 25 Mbps for 1080p60, and network latency below 80 ms to its data centre. These are NVIDIA's requirements, not measured Gameflex thresholds. They demonstrate why a nearby region, stable connection and device testing matter. [NVIDIA browser requirements](https://www.nvidia.com/en-us/geforce-now/system-reqs/).

The content agreement is a separate workstream. Google's platform requires cleared third-party IP, music and other rights. Steam Cloud Play uses publisher opt-in and an addendum; participation there does not authorise Gameflex. We need the actual owner's grant covering our hosting, streaming, monetisation, territories and intended audience. A public port, demo, freeware label or purchased consumer copy is not sufficient evidence by itself. [GameSnacks rights requirements](https://developers.google.com/gamesnacks/developer/requirements), [Steam Cloud Play](https://partner.steamgames.com/doc/features/cloudgaming).

## 3. Proposed stack

### Hosted web games and classics

- Keep the buildless Gameflex shell initially. Serve immutable, versioned game bundles from object storage behind a CDN, using a dedicated runtime origin separate from future account and payment credentials. Use separate origins for mutually untrusted publishers where practical.
- Use Cloudflare R2 Standard for large assets. Add a small TypeScript Worker only when manifests, signed save operations or access control require it. No backend or sign-in is needed just to host a permitted static game.
- Prefer the publisher's existing web build. Godot/Unity exports and Emscripten ports are options depending on the source project; Phaser or PlayCanvas are candidates for new web-native development. Do not rebuild an existing game in another engine merely for uniformity.
- Evaluate js-dos, EmulatorJS and ScummVM per title. Pin runtime/core versions and retain notices and source obligations as applicable. js-dos documents v8 mobile as work in progress; do not promise mobile support from a desktop smoke test. [js-dos](https://github.com/caiiiycuk/js-dos), [EmulatorJS licence](https://github.com/EmulatorJS/EmulatorJS/blob/main/LICENSE), [core licences](https://docs.libretro.com/development/licenses/).
- Define a small, versioned player protocol: ready, loading progress, pause/resume, save/load, error and controls. Validate `postMessage` origins and schemas. An iframe load event is not proof the game reached playable state.
- Store game saves in IndexedDB/OPFS where supported, with explicit export/import. Add cloud saves later if the product needs cross-device continuity; favourites can remain in localStorage. Browser storage can be cleared or evicted, and embedding changes behavior. [MDN storage guidance](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Threaded WASM is a specific hosting decision. SharedArrayBuffer requires cross-origin isolation; that affects headers, parent frames and third-party resources, including some advertising integrations. Prefer single-threaded builds when they meet performance needs. Test isolation with the real Gameflex shell rather than assuming a separate game subdomain solves it. [Emscripten pthreads](https://emscripten.org/docs/porting/pthreads.html), [Godot web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

### Cloud streaming

Start with a managed proof of concept using Amazon GameLift Streams, conditional on title permissions and regional availability. It supplies a browser SDK and streaming infrastructure, but we still build the session broker, access controls, save integration and product experience. Check each game's Windows/Linux/Proton compatibility, DRM and anti-cheat requirements. Even managed streaming has browser/input restrictions; for example, the current AWS matrix excludes iOS embedded in-app browsers. [AWS SDK](https://docs.aws.amazon.com/gameliftstreams/latest/developerguide/sdk.html), [AWS client matrix](https://docs.aws.amazon.com/gameliftstreams/latest/developerguide/compatible-devices-browsers.html).

A self-hosted alternative is a GPU host plus Selkies and our broker. Selkies is Linux-focused, MPL-2.0, and currently defaults to WebSocket/WebCodecs transport with WebRTC opt-in. It is a component to evaluate, not a turnkey Gameflex service. Wolf/Moonlight needs a separately evaluated browser bridge. Neither stack has been benchmarked for Gameflex. [Selkies](https://github.com/selkies-project/selkies), [Moonlight FAQ](https://github.com/moonlight-stream/moonlight-docs/wiki/Frequently-Asked-Questions).

For production, budget for short-lived session credentials; per-user concurrency and time limits; queues; idle shutdown; hard spend ceilings; GPU encoding; audio and relative mouse/gamepad input; reconnect behavior; encrypted signaling; STUN/TURN where needed; network isolation; disposable session environments; save persistence; patching; abuse handling and operational monitoring. Do not expose Docker control access or host secrets to games. Shared GPU/container boundaries need a deliberate threat model; a container is not automatically equivalent to a dedicated VM.

Online multiplayer may also need a separate game server. Streaming the client does not supply multiplayer netcode or remove the game's service dependencies.

Our existing remote-browser prototype uses JPEG frames and has no audio. Its documented measurements are approximately 7–11 fps. It demonstrates session plumbing, not the proposed production experience. Keep production remote streaming disabled until a reviewed broker and end-to-end tests exist. See the [prototype review and evidence](https://github.com/milllenialfalcon/gameflex/pull/4).

## 4. Cost model

USD, excluding taxes and negotiated discounts. Vendor examples checked on the research date; calculations are ours. These are infrastructure scenarios, not a complete business quote.

### File delivery

R2 Standard: $0.015/GB-month, with 10 GB-month free; reads $0.36/million after 10 million free; direct internet egress is free. At 100 GB stored and 20 million monthly read operations, with writes within the free allowance, the example bill is **$4.95/month**: $1.35 storage plus $3.60 reads. Cache hits need not become origin reads. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

A paid Workers subscription starts at $5/month; additional usage or services can add charges. The example above plus an in-allowance paid Worker is **$9.95/month**, before domains, other services, support, engineering and content costs. This is a specified small workload, not a promise about the full platform. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

### Managed streaming

AWS charges allocated capacity while idle as well as active. Its Oregon examples quote $0.4982/hour for `gen4n_high` and $1.82/hour for `gen6n_ultra_win2022`. These are different classes, not interchangeable performance levels; select and price the actual title/region. [AWS pricing](https://aws.amazon.com/gamelift/streams/pricing/).

Assume 70% useful utilisation: allocated hours = actual player-hours / 0.70.

| Actual player-hours/month | $0.4982 class | $1.82 class |
|---:|---:|---:|
| 1,000 | $712 | $2,600 |
| 10,000 | $7,117 | $26,000 |

Ten capacity slots continuously allocated for a 730-hour month cost about $3,637 or $13,286 respectively, even without ten continuously active players. Storage, platform services, content and applicable additional charges remain outside this model. Faster starts and lower idle cost are competing goals.

### Self-hosted streaming

Use measured density, not assumed GPU sharing:

`cost/player-hour = GPU host $/hour ÷ tested sessions/host ÷ utilisation + metered egress + relay + storage/control-plane allocation`

Illustration only: a $1/hour host sustaining four sessions at 70% utilisation costs $0.357 per player-hour before the other terms. The $1 and four-session assumptions are not a provider quote or benchmark.

At a constant 15 Mbps, video alone is 6.75 decimal GB/hour. If egress were $0.05/GB, that adds $0.3375/hour; 100 simultaneous streams require 1.5 Gbps before overhead. R2's free file egress does not make unrelated GPU or TURN traffic free. Real bitrate, relay use and network inclusion depend on the provider.

### Monetisation implication

An illustrative six filled ads per player-hour at a realised net $5 eCPM earns $0.03/hour. This is an assumption, not a market forecast. It would not cover the managed-streaming scenarios. Start with ad-supported hosted web games; price cloud play through credits, subscriptions with usage limits or sponsored sessions. Include content revenue share, payment fees and support when computing margin. Ad integration must pause gameplay and audio appropriately, and preserve saves.

## 5. Rollout and acceptance gates

1. **Content inventory:** record owner, authorised build, distribution/streaming/ads/subscription permissions, territories, expiry, asset/runtime licences and prerequisites. Existing curation evidence is not hosting clearance.
2. **Hosted pilot:** choose three titles with documented permission, spanning a small web build, a larger WASM build and an emulator. Version bundles in Git-managed manifests; store large binaries in object storage. Keep discovered candidates in `research/` until separate assistant and explicit user verification.
3. **Quality gate:** test desktop Chrome/Edge/Firefox/Safari, Android Chrome and iOS Safari as applicable. Exercise startup, real gameplay, audio, saves, fullscreen, keyboard, pointer lock, gamepad, touch, slow networks and recovery. Mark unsupported devices honestly.
4. **Cloud experiment:** one authorised title, one nearby region, a low concurrency limit and scheduled shutdown. Compare managed streaming against one self-hosted setup using the same resolution, bitrate, title and client networks. Measure launch delay, p95 latency, dropped frames, save recovery and actual cost/player-hour.
5. **Scale from evidence:** add regional capacity and automation only after demand, paid conversion, operating margin and reliability justify it. Use GitHub Actions for repeatable build checks and smoke tests, plus manual gameplay review. Separate runtime-service changes from catalogue data and UI releases for rollback.

Proposed initial targets, to validate rather than advertise: web first play within 10 seconds on the declared test connection; warm cloud start within 5 seconds; stable 30 or 60 fps according to title; successful save/restore; and no cross-session data leakage. Cold-start queues, mobile controls and larger downloads need explicit UX.

The next milestone should be the three-game hosted pilot and its rights/performance matrix. Final GPU sizing and publisher budgets require named titles, target geography, expected peak concurrency and monthly player-hours. Publisher licensing and porting effort cannot be priced reliably from the current link list.
