/**
 * GAMEFLEX emulator host page.
 *
 * Loaded as dist/emulator/play.html?id=<catalogue-id> inside the same-origin player frame.
 * It reads only `id` from the URL and resolves everything else from the same-origin
 * dist/player-config.json. The ROM bytes are checked with SHA-256 before EmulatorJS is
 * allowed to see them, and every byte EmulatorJS loads comes from ejs/4.2.3/ on this
 * origin. No new tabs, no external links, no uploads: the ROM only ever moves inside this
 * document.
 *
 * It reports to the parent with postMessage({type:'gameflex-emulator', state, message}).
 * `started` is EmulatorJS's own boot event (EJS_onGameStart). It means the emulator booted
 * the ROM. It is not gameplay verification.
 *
 * Controllers: EmulatorJS 4.2.3 can miss a pad that the document could already see when its own
 * gamepad handler was built, so this page adopts the first visible pad for Player 1 and reports
 * the pad to the player (`state:'gamepad'`) for the "Controller? Press any button." hint. See
 * docs/emulator.md, "Gamepad support".
 *
 * Requirements, all measured against the vendored 4.2.3 build (see docs/emulator.md):
 *  - EJS_defaultOptions { webgl2Enabled: 'enabled' } is what selects the vendored
 *    `<core>-wasm.data`. Without it the runtime asks for `<core>-legacy-wasm.data`, which
 *    this build does not vendor, so a device without WebGL2 gets the error panel instead.
 *  - EJS_gameName must carry the ROM's extension: the runtime names the file it mounts in
 *    its virtual filesystem from the game name when the game URL is a blob.
 */

const EJS_BASE = './ejs/4.2.3/';
const CONFIG_URL = '../player-config.json';
const START_TIMEOUT_MS = 85000;
const CORE_PATTERN = /^[a-z0-9_]{1,40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const els = {
  game: document.getElementById('game'),
  boot: document.getElementById('boot'),
  bootName: document.getElementById('boot-name'),
  panel: document.getElementById('panel'),
  title: document.getElementById('panel-title'),
  note: document.getElementById('panel-note'),
  detail: document.getElementById('panel-detail'),
  code: document.getElementById('panel-code')
};

let watchdog = 0;
let reported = false;
let padTimer = 0;
let padReported = false;

boot().catch(error => fatal(error.message, error.detail || ''));

/* --------------------------------------------------------------------- report */

function problem(message, detail = '') {
  const error = new Error(message);
  error.detail = detail;
  return error;
}

/** Every message to the player is same-origin and addressed to the parent; there is no other. */
function post(payload) {
  if (window.parent === window) return;
  window.parent.postMessage(payload, location.origin);
}

function report(state, message) {
  if (reported) return;
  reported = true;
  post({ type: 'gameflex-emulator', state, message });
}

/** Stops everything and shows the in-frame panel. The visitor stays inside gameflex. */
function fatal(message, detail = '') {
  clearTimeout(watchdog);
  watchdog = 0;
  report('error', message);
  els.game.replaceChildren();
  els.boot.hidden = true;
  els.title.textContent = 'This game can’t start';
  els.note.textContent = message;
  if (detail) {
    els.code.textContent = detail;
    els.detail.hidden = false;
  }
  els.panel.hidden = false;
}

/* ----------------------------------------------------------------------- boot */

async function boot() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) throw problem('No game was requested. Open this page from the gameflex player.');

  const entry = await entryFor(id);
  const romUrl = romFor(entry.rom);

  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw problem('This page needs a secure connection (HTTPS) to check the game file.');
  }

  els.bootName.textContent = entry.title || id;

  /* The core has to be vendored before anything is downloaded for the visitor. */
  const coreUrl = `${EJS_BASE}cores/${entry.core}-wasm.data`;
  const core = await fetch(coreUrl, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
  if (core?.body) await core.arrayBuffer().catch(() => {});
  if (!core || !core.ok) {
    fatal(`The ${entry.core} core is not in this build.`, `${coreUrl}\nHTTP ${core ? core.status : 'no response'}`);
    return;
  }

  if (!document.createElement('canvas').getContext('webgl2')) {
    fatal('This device has no WebGL2 support, so the emulator cannot run here.', `core ${entry.core}`);
    return;
  }

  const response = await fetch(romUrl, { cache: 'no-store' }).catch(() => null);
  if (!response || !response.ok) {
    fatal('The game file could not be loaded.', `${romUrl}\nHTTP ${response ? response.status : 'no response'}`);
    return;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());

  const actual = await sha256(bytes);
  if (actual !== entry.sha256) {
    fatal('The game file failed its integrity check, so it was not started.', `expected ${entry.sha256}\nreceived ${actual}`);
    return;
  }

  startEmulator(id, entry, bytes, romUrl);
}

/**
 * Resolution order matches the player: the same-origin config is the only source of
 * truth for mode, core, ROM path and hash. An unknown or non-emulator id never boots.
 */
async function entryFor(id) {
  const response = await fetch(CONFIG_URL, { cache: 'no-store' }).catch(() => null);
  if (!response || !response.ok) {
    throw problem('The gameflex player configuration could not be read.');
  }
  const config = await response.json().catch(() => null);
  const entry = config && config.games ? config.games[id] : null;
  const label = id.length > 60 ? `${id.slice(0, 60)}…` : id;
  if (!entry) throw problem(`Nothing in this collection is called “${label}”.`);
  if (entry.mode !== 'emulator') {
    throw problem(`“${label}” is not an emulator game.`, `mode: ${entry.mode || 'unset'}`);
  }
  const core = typeof entry.core === 'string' ? entry.core : '';
  const rom = typeof entry.rom === 'string' ? entry.rom : '';
  const sha256 = typeof entry.sha256 === 'string' ? entry.sha256.toLowerCase() : '';
  if (!CORE_PATTERN.test(core) || !rom || !SHA256_PATTERN.test(sha256)) {
    throw problem(`“${label}” is missing its core, rom or sha256 entry.`);
  }
  return { core, rom, sha256, title: typeof entry.title === 'string' ? entry.title : '' };
}

/** `rom` is a path inside dist/, exactly as the plan's config schema records it. */
function romFor(rom) {
  if (!rom || /^[a-z][a-z0-9+.-]*:/i.test(rom) || rom.startsWith('//')) {
    throw problem('The configured game file path is not a local path.');
  }
  const url = new URL(rom.replace(/^\.?\//, ''), new URL('../', location.href));
  if (url.origin !== location.origin) throw problem('The configured game file is on another origin.');
  return url.href;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The emulator mounts the ROM under this name, so the extension has to survive. */
function gameNameFor(id, romUrl) {
  const extension = /\.([a-z0-9]{1,5})$/i.exec(new URL(romUrl).pathname);
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48) || 'game';
  return `gameflex-${safe}${extension ? `.${extension[1].toLowerCase()}` : ''}`;
}

/** Stable per-game id for EmulatorJS's own localStorage settings key. */
function settingsId(text) {
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash = Math.imul(hash ^ character.codePointAt(0), 0x01000193) >>> 0;
  }
  return hash % 2147483647 || 1;
}

/* -------------------------------------------------------------------- gamepad */

/**
 * EmulatorJS 4.2.3 builds its gamepad handler during start-up and attaches its "connected"
 * listener immediately after the handler's first poll (data/src/emulator.js, bindListeners), so a
 * pad the browser had already exposed to this document at that moment fires "connected" into
 * nothing: it is never written into gamepadSelection, and gamepadEvent() then drops every press
 * from it ("Gamepad not set anywhere"). That is measured, not guessed — see
 * docs/emulator-verification.md, "Gamepad pipeline (simulated)", scenario "load".
 *
 * So the host page adopts the pad itself: once per half-second it looks for a pad the browser can
 * see, and gives the first one that no player slot holds to Player 1. Pads that appear later are
 * left to the runtime's own listener, and are adopted here too if that listener misses them.
 *
 * Only the runtime's public object is touched — window.EJS_emulator.gamepadSelection and
 * updateGamepadLabels() — and every read is guarded, so a runtime change cannot crash the frame.
 */
function padIdentifier(pad) {
  return `${pad.id}_${pad.index}`;
}

/** The first pad that Player 1 has no claim on, or null while Player 1 is already covered. */
function padForPlayerOne(runtime) {
  const selection = runtime.gamepadSelection;
  const pads = runtime.gamepad && runtime.gamepad.gamepads;
  if (!Array.isArray(selection) || !selection.length) return null;
  if (selection[0]) return null;
  if (!Array.isArray(pads)) return null;
  const taken = new Set(selection.filter(Boolean));
  return pads.find(pad => pad && !taken.has(padIdentifier(pad))) || null;
}

/** True once Player 1 holds a pad because of this page. */
function adoptGamepad() {
  try {
    const runtime = window.EJS_emulator;
    if (!runtime) return false;
    const pad = padForPlayerOne(runtime);
    if (!pad) return false;
    runtime.gamepadSelection[0] = padIdentifier(pad);
    if (typeof runtime.updateGamepadLabels === 'function') runtime.updateGamepadLabels();
    return true;
  } catch {
    return false;
  }
}

/** The first pad this document can see, or null. A frame without the gamepad permission throws. */
function visiblePad() {
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) if (pad) return pad;
  } catch { /* no gamepad access in this document */ }
  return null;
}

/**
 * Watches for a controller from the moment the page boots — earlier than the runtime's own
 * handler, which is the whole point — and tells the player the first time one is visible, so the
 * "Controller? Press any button." hint can go away. It stops once Player 1 holds a pad.
 */
function watchGamepads() {
  clearInterval(padTimer);
  padTimer = setInterval(() => {
    const pad = visiblePad();
    if (!pad) return;
    const adopted = adoptGamepad();
    if (!padReported) {
      padReported = true;
      post({ type: 'gameflex-emulator', state: 'gamepad', message: String(pad.id), assigned: adopted });
    }
    if (adopted) clearInterval(padTimer);
  }, 500);
}

function startEmulator(id, entry, bytes, romUrl) {
  const gameName = gameNameFor(id, romUrl);

  window.EJS_player = '#game';
  window.EJS_core = entry.core;
  window.EJS_gameUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  window.EJS_pathtodata = EJS_BASE;
  window.EJS_startOnLoaded = true;
  window.EJS_gameName = gameName;
  window.EJS_gameID = settingsId(id);
  window.EJS_backgroundColor = '#101210';
  /* Selects the non-legacy, non-threaded core build this repository vendors. */
  window.EJS_defaultOptions = { webgl2Enabled: 'enabled' };
  /* No language fetch: the runtime's built-in English strings are the keys it looks up. */
  window.EJS_disableAutoLang = false;
  /* EJS_netplayServer and every EJS_Ad* value stay unset on purpose. */

  window.EJS_onGameStart = () => {
    clearTimeout(watchdog);
    watchdog = 0;
    els.boot.hidden = true;
    report('started', `${entry.core} booted ${gameName}`);
  };
  window.EJS_ready = () => {
    els.boot.hidden = true;
  };

  watchdog = setTimeout(() => {
    watchdog = 0;
    fatal('The emulator did not start in time.', `core ${entry.core}\nrom ${entry.rom}\nstarted within ${START_TIMEOUT_MS / 1000}s`);
  }, START_TIMEOUT_MS);

  const loader = document.createElement('script');
  loader.src = `${EJS_BASE}loader.js`;
  loader.addEventListener('error', () => {
    fatal('The emulator runtime is missing from this build.', `missing ${EJS_BASE}loader.js`);
  });
  document.head.append(loader);
  // Starts before the runtime exists: a pad the browser exposes during the boot has to be adopted
  // once Player 1's slot exists, and the player hides its controller hint from the report below.
  watchGamepads();
}
