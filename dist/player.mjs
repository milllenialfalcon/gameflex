/**
 * gameflex in-site player.
 *
 * Every launch path routes through the internal hash #play/<id>. The player
 * loads the catalogue game's own page inside a sandboxed cross-origin frame, or
 * (only when player-config.json enables it) into a prototype remote-session
 * canvas. There is no new-tab or external-fallback path.
 *
 * Two limits this module does not hide:
 *  1. A frame `load` event means the host page loaded. It is not gameplay
 *     verification, and gameflex cannot see inside a cross-origin frame.
 *  2. Remote session support is a client-side prototype. The shipped config has
 *     remote.enabled=false, so this build talks to no backend and promises
 *     nothing about relative mouse input, latency or frame rate. There is no
 *     audio path in this prototype at all.
 */

const DEFAULT_LOAD_TIMEOUT_MS = 20000;
/* PS1, N64 and DS cores plus large ROMs can take well past 20 s to boot without threads. */
const EMULATOR_LOAD_TIMEOUT_MS = 90000;
const REMOTE_CREATE_TIMEOUT_MS = 60000;
const REMOTE_CONNECT_TIMEOUT_MS = 10000;
const REMOTE_FIRST_FRAME_MS = 15000;
const MAX_FRAME_BYTES = 4_000_000;
const MAX_DIMENSION = 4096;
const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-pointer-lock';
/**
 * The emulator frame is our own same-origin page, so it needs no allow-forms. It is not a
 * security boundary either: scripts plus same-origin means the frame can reach this document.
 * What keeps the emulator honest is that every byte it runs is a vendored, pinned file and its
 * page carries its own strict CSP (dist/emulator/play.html, docs/emulator.md).
 */
const EMULATOR_SANDBOX = 'allow-scripts allow-same-origin allow-pointer-lock';
const FRAME_ALLOW = 'fullscreen; autoplay; gamepad';
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const MOUSE_BUTTONS = { 0: 'left', 1: 'middle', 2: 'right' };

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let host = {
  games: () => [],
  isFavourite: () => false,
  toggleFavourite: () => {},
  toast: () => {},
  closeDialogs: () => {},
};
let config = null;
let configError = false;
let els = {};
let open = false;
let currentId = null;
let generation = 0;
let loadTimer = 0;
let openedByPush = false;
let restoreFocus = null;
let savedScroll = 0;
let stageState = 'idle';
let remote = null;
let pushDepth = 0;
let notesOpen = false;
let notesOrigin = null;

/* ---------------------------------------------------------------- helpers */

const byId = (id) => host.games().find(game => game.id === id) || null;

/**
 * The one decision record for a launch: the catalogue entry, the sandbox-pending override and
 * the player config, in that order. Only iframe and emulator modes can start here; every other
 * value (a missing entry, an unknown mode, an unreadable config) fails closed.
 */
function entryFor(id) {
  const game = byId(id);
  if (!game) return { mode: 'unavailable', reason: 'That game is not in this collection.' };
  if (game.availability === 'sandbox-pending') return { mode: 'unavailable', reason: 'Sandbox pending. This port is listed for review and is not playable in Gameflex yet.' };
  if (configError) return { mode: 'unavailable', reason: 'The player could not start. Reload the page to try again.' };
  const entry = config?.games?.[id];
  if (!entry || !entry.mode) return { mode: 'unavailable', reason: 'This game is not ready to play here yet.' };
  if (entry.mode === 'iframe') return { mode: 'iframe' };
  if (entry.mode === 'emulator') return { mode: 'emulator' };
  return { mode: 'unavailable', reason: typeof entry.reason === 'string' && entry.reason ? entry.reason : 'This game cannot play inside gameflex.' };
}

/** The player can start these modes; everything else is the blocked panel. */
const startable = entry => entry.mode === 'iframe' || entry.mode === 'emulator';

/** Only a host URL straight from the catalogue is ever framed. Hash and query input is ignored. */
function frameUrl(game) {
  if (!game || typeof game.url !== 'string') return null;
  let url;
  try { url = new URL(game.url); } catch { return null; }
  return url.protocol === 'https:' ? url.href : null;
}

function remoteBase() {
  const remoteConfig = config?.remote;
  if (!remoteConfig || remoteConfig.enabled !== true || typeof remoteConfig.apiBase !== 'string' || !remoteConfig.apiBase) return null;
  let url;
  try { url = new URL(remoteConfig.apiBase); } catch { return null; }
  const trusted = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  return trusted ? url : null;
}

function remoteApiBase() {
  const url = remoteBase();
  return url ? url.href.replace(/\/+$/, '') : null;
}

/**
 * The owner key is a lock on a relay running on this machine, so it is only ever
 * offered or sent when both this page (location.hostname) and the configured
 * apiBase are loopback. Any other broker is reached without it; a future
 * authenticated broker gets a separate identity flow, not this shared key.
 */
function ownerKeyEligible() {
  const url = remoteBase();
  return Boolean(url) && LOOPBACK_HOSTS.has(location.hostname) && LOOPBACK_HOSTS.has(url.hostname);
}

function timeoutMs(fallback = DEFAULT_LOAD_TIMEOUT_MS) {
  const override = Number(globalThis.__GAMEFLEX_PLAYER_TIMEOUT_MS);
  return Number.isFinite(override) && override > 200 ? override : fallback;
}

function remoteCreateTimeoutMs() {
  const override = Number(globalThis.__GAMEFLEX_REMOTE_CREATE_TIMEOUT_MS);
  return Number.isFinite(override) && override > 200 ? override : REMOTE_CREATE_TIMEOUT_MS;
}

function setStatus(message) {
  if (els.status) els.status.textContent = message;
}

/**
 * The stage container also holds the Notes overlay, so replacing the whole stage would
 * destroy it. Every state writes into a dedicated .player-view layer instead, and the
 * overlay survives restarts, timeouts and remote errors.
 */
function setStage(state, html) {
  stageState = state;
  els.stage.dataset.state = state;
  if (typeof html === 'string' && els.view) els.view.innerHTML = html;
}

function panel({ badge = '', heading, copy, actions = '', extraNote = '' }) {
  return `<div class="player-panel">${badge ? `<span class="player-badge">${escape(badge)}</span>` : ''}<h3>${escape(heading)}</h3>${copy ? `<p>${escape(copy)}</p>` : ''}${extraNote ? `<p class="player-panel-note">${escape(extraNote)}</p>` : ''}${actions ? `<div class="player-actions">${actions}</div>` : ''}</div>`;
}

const actionBack = '<button class="button ghost" type="button" data-player-action="back">Back to games</button>';
const actionStart = (label = 'Start game') => `<button class="button lime" type="button" data-player-action="start">${escape(label)}</button>`;

function setChrome() {
  const game = byId(currentId);
  const entry = entryFor(currentId);
  const canStart = startable(entry);
  els.title.textContent = game ? game.title : 'Game not found';
  els.title.title = game ? game.title : '';
  // Tag, genre, platform and own-files meta moved out of the toolbar and into the Notes
  // overlay, so the toolbar stays a single compact row on desktop.
  if (els.notesTag) els.notesTag.textContent = game ? (game.tag || '—') : '—';
  if (els.notesGenre) els.notesGenre.textContent = game ? (game.genre || '—') : '—';
  if (els.notesPlatform) els.notesPlatform.textContent = game ? (game.platform || 'Desktop') : '—';
  if (els.notesFiles) els.notesFiles.textContent = game ? (game.ownFiles ? 'Own files required' : 'No own files noted') : '—';
  const startLabel = stageState === 'loaded' ? 'Restart game' : 'Start game';
  els.start.hidden = !(canStart && (stageState === 'loaded' || stageState === 'timeout' || stageState === 'remote-error' || stageState === 'failed'));
  els.start.textContent = startLabel;
  els.start.disabled = stageState === 'loading';
  // The remote prototype streams a game host's page, so it is only offered for iframe mode.
  els.remote.hidden = !(entry.mode === 'iframe' && remoteApiBase());
  els.fullscreen.hidden = !(stageState === 'loaded' || stageState === 'streaming');
  els.fullscreen.setAttribute('aria-pressed', String(document.fullscreenElement === els.root));
  els.favourite.hidden = !game;
  if (game) els.favourite.dataset.favourite = game.id;
  els.requirements.hidden = !game?.requirements;
  if (game?.requirements) els.requirementsCopy.textContent = game.requirements;
  syncPlayerFavourite();
}

/* --------------------------------------------------------------- notes overlay */

/**
 * The Notes overlay is opened by the toolbar Notes button (aria-expanded / aria-controls)
 * and closed by the same button, its own close button, or Escape. It overlays the stage
 * instead of shrinking it, so the game keeps its viewport area, and it scrolls inside its
 * own max-height. Focus moves to the close button when it opens, Tab is trapped inside it,
 * and focus returns to whichever Notes button opened it.
 */
export function isNotesOpen() { return notesOpen; }

function notesTriggers() { return [els.notesButton, els.notesOpen].filter(Boolean); }

export function openNotes() {
  if (notesOpen || !els.notes) return;
  notesOpen = true;
  notesOrigin = document.activeElement instanceof HTMLElement && document.activeElement.closest('#player-notes') === null
    ? document.activeElement
    : null;
  els.notes.hidden = false;
  els.view.inert = true;
  notesTriggers().forEach(button => button.setAttribute('aria-expanded', 'true'));
  setStatus('Game notes opened. Press Escape to close them.');
  const target = els.notesClose || els.notes;
  if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
}

export function closeNotes({ restore = true } = {}) {
  if (!notesOpen || !els.notes) return;
  notesOpen = false;
  els.notes.hidden = true;
  els.view.inert = false;
  notesTriggers().forEach(button => button.setAttribute('aria-expanded', 'false'));
  setStatus('Game notes closed.');
  const target = notesOrigin && notesOrigin.isConnected ? notesOrigin : els.notesButton;
  notesOrigin = null;
  if (restore && target && typeof target.focus === 'function') target.focus({ preventScroll: true });
}

function toggleNotes() { if (notesOpen) closeNotes(); else openNotes(); }

/** Keeps Tab inside the overlay while it is open, so Escape is always reachable. */
function trapNotes(event, items) {
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/* -------------------------------------------------------------- favourites */

export function syncPlayerFavourite() {
  const button = els.favourite;
  if (!button || !currentId) return;
  const saved = host.isFavourite(currentId);
  button.classList.toggle('saved', saved);
  button.setAttribute('aria-pressed', String(saved));
  const label = saved ? 'Remove from favourites' : 'Save to favourites';
  button.setAttribute('aria-label', `${label}: ${byId(currentId)?.title || ''}`.trim());
  const text = button.querySelector('span');
  if (text) text.textContent = saved ? 'Saved' : 'Favourite';
}

/* ------------------------------------------------------------------ stages */

function renderBlocked() {
  const game = byId(currentId);
  const entry = entryFor(currentId);
  teardownFrame();
  setStage('blocked', panel({
    badge: game ? 'NOT PLAYABLE HERE' : 'UNKNOWN GAME',
    heading: game ? `${game.title} can't run here` : 'That game is not in the collection',
    copy: entry.reason,
    actions: actionBack,
  }));
  setStatus(`${game ? game.title : 'That game'} is not playable inside gameflex. ${entry.reason}`);
  setChrome();
}

function renderStart() {
  const game = byId(currentId);
  const entry = entryFor(currentId);
  teardownFrame();
  const remoteAvailable = entry.mode === 'iframe' && Boolean(remoteApiBase());
  const keyField = ownerKeyEligible()
    ? '<label class="player-key">Owner key <input type="password" id="player-remote-key" autocomplete="off" aria-label="Owner access key for the loopback remote relay"></label>'
    : '';
  // Emulator games run on the visitor's device, so the remote-relay note does not apply.
  const note = entry.mode === 'emulator'
    ? 'Runs on this device. Save states stay in this browser.'
    : remoteAvailable && !keyField
      ? 'The owner key is only offered for a relay on this machine.'
      : 'Some ports may not load here yet.';
  setStage('ready', panel({
    badge: 'IN-SITE PLAYER',
    heading: `Play ${game.title} here`,
    copy: game.description,
    extraNote: note,
    actions: `${actionStart()}${remoteAvailable ? `${keyField}<button class="button ghost" type="button" data-player-action="remote">Remote session</button>` : ''}`,
  }));
  setStatus(`Player open for ${game.title}.`);
  setChrome();
}

function renderLoading(mode) {
  if (mode === 'remote') {
    setStage('loading', panel({
      heading: 'Starting a remote session',
      copy: 'Requesting a remote preview session.',
      actions: actionBack,
    }));
  } else if (mode === 'emulator') {
    setStage('loading', '<p class="player-stage-label">Starting the emulator…</p>');
  } else {
    setStage('loading', '<p class="player-stage-label">Loading the host page…</p>');
  }
  setChrome();
}

function renderTimeout() {
  teardownFrame();
  setStage('timeout', panel({
    badge: 'STILL LOADING, OR BLOCKED',
    heading: `${byId(currentId).title} did not finish loading`,
    copy: `This game took longer than ${Math.round(timeoutMs() / 1000)} seconds to open. Large games can be slow; some ports may not run here yet.`,
    extraNote: 'Restart tries the same address again.',
    actions: `${actionStart('Restart game')}${actionBack}`,
  }));
  setStatus(`${byId(currentId).title} did not finish loading. Restart it here, or go back to the games.`);
  setChrome();
}

function renderRemoteError(message) {
  teardownFrame();
  setStage('remote-error', panel({
    badge: 'REMOTE SESSION',
    heading: 'The remote session could not start',
    copy: message,
    extraNote: 'The frame player is the supported path.',
    actions: `${actionStart()}${actionBack}`,
  }));
  setStatus('The remote session could not start. Use the frame player instead.');
  setChrome();
}

/* --------------------------------------------------------------- iframe path */

/**
 * The frame the player is currently listening to. Only this frame's messages are accepted:
 * event.source must be this iframe's contentWindow, the origin must be ours, and the payload
 * must be one of ours. Restart and exit clear it, so a late message from a torn-down frame is
 * ignored rather than acted on.
 */
let emulatorFrame = null;

function teardownFrame() {
  generation += 1;
  clearTimeout(loadTimer);
  loadTimer = 0;
  els.view.querySelectorAll('iframe.player-frame, canvas.player-canvas').forEach(node => node.remove());
  emulatorFrame = null;
  clearStageNote();
  hidePadHint();
  if (remote) { stopRemote(remote); remote = null; }
  els.fullscreen.hidden = true;
}

/** Remote preview notes are per session, so restarts don't stack them up. */
function clearStageNote() {
  els.foot?.querySelectorAll('.player-stream-note').forEach(node => node.remove());
}

function startFrame() {
  const game = byId(currentId);
  const url = frameUrl(game);
  if (!url) return renderBlocked();
  teardownFrame();
  const gen = generation;
  renderLoading('iframe');
  const frame = document.createElement('iframe');
  frame.className = 'player-frame';
  frame.setAttribute('sandbox', FRAME_SANDBOX);
  frame.setAttribute('allow', FRAME_ALLOW);
  frame.setAttribute('allowfullscreen', '');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('loading', 'eager');
  frame.title = `${game.title} inside the gameflex player`;
  frame.dataset.generation = String(gen);
  frame.addEventListener('load', () => {
    if (gen !== generation) return;
    clearTimeout(loadTimer);
    loadTimer = 0;
    els.view.querySelector('.player-stage-label')?.remove();
    els.stage.dataset.state = 'loaded';
    stageState = 'loaded';
    setStatus(`${game.title} game page opened. If it stays blank, use Restart game.`);
    setChrome();
  });
  frame.addEventListener('error', () => {
    if (gen !== generation) return;
    renderTimeout();
  });
  frame.src = url;
  loadTimer = setTimeout(() => {
    if (gen !== generation) return;
    renderTimeout();
  }, timeoutMs());
  els.view.append(frame);
}

/* ------------------------------------------------------------- emulator path */

/**
 * "Controller? Press any button." — a nudge shown in the stage while the emulator frame has seen
 * no controller. It makes no promise: only a real pad can hide it, because the frame is the only
 * thing here that can see one (the game polls the same Gamepad API the visitor's device feeds),
 * and it reports that back with {type:'gameflex-emulator', state:'gamepad'}.
 */
function showPadHint() {
  hidePadHint();
  const hint = document.createElement('p');
  hint.className = 'player-pad-hint';
  hint.id = 'player-pad-hint';
  hint.textContent = 'Controller? Press any button.';
  els.stage.append(hint);
}

function hidePadHint() {
  els.stage.querySelectorAll('.player-pad-hint').forEach(node => node.remove());
}

/**
 * Hands focus to the emulator frame, so a gamepad button press lands in the frame's own
 * document: browsers expose a pad to a document only after a press while that document has
 * focus, and the runtime only focuses its own container once the game has started — during the
 * boot, focus would otherwise sit on the player page. A toolbar control the visitor just used
 * keeps focus, and the Notes overlay keeps it while it is open.
 */
function focusEmulatorFrame() {
  const frame = emulatorFrame;
  if (!frame || !frame.isConnected || notesOpen) return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && els.root.contains(active) && !active.closest('#player-stage')) return;
  try { frame.focus({ preventScroll: true }); } catch { /* the frame may already be gone */ }
  try { frame.contentWindow?.focus(); } catch { /* same-origin only, and best effort */ }
}

/**
 * Keydown from inside a frame never reaches the parent's own handler, so Escape would stop
 * working as soon as focus moved into the emulator. The frame is same-origin, so the player can
 * listen on it directly and keep Escape behaving exactly as it does in the toolbar. While the
 * emulator is in its own fullscreen, Escape is left to the browser, which is what leaves it.
 */
function watchFrameKeys(frame, gen) {
  let doc = null;
  try { doc = frame.contentDocument; } catch { doc = null; }
  if (!doc) return;
  doc.addEventListener('keydown', event => {
    if (gen !== generation || !open || event.key !== 'Escape') return;
    if (doc.fullscreenElement) return;
    event.preventDefault();
    if (notesOpen) closeNotes();
    else closePlayer();
  }, true);
}

/**
 * Runs one of our own vendored emulators in a same-origin frame.
 *
 * The frame URL is built from the catalogue id only, never from user input, and the frame gets
 * the same generation/teardown/timeout treatment as the cross-origin path, so restart and exit
 * remove it (which is what stops the audio and releases the emulator's WebGL context).
 *
 * `started` and `error` come from dist/emulator/play.mjs. `started` is EmulatorJS's own boot
 * event: the emulator booted the ROM. It is not gameplay verification.
 */
function startEmulator() {
  const game = byId(currentId);
  const entry = config?.games?.[currentId];
  if (!entry || entry.mode !== 'emulator') return renderBlocked();
  teardownFrame();
  const gen = generation;
  renderLoading('emulator');
  const frame = document.createElement('iframe');
  frame.className = 'player-frame';
  frame.setAttribute('sandbox', EMULATOR_SANDBOX);
  frame.setAttribute('allow', FRAME_ALLOW);
  frame.setAttribute('allowfullscreen', '');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('loading', 'eager');
  frame.title = `${game.title} inside the gameflex player`;
  frame.dataset.generation = String(gen);
  emulatorFrame = frame;
  frame.addEventListener('load', () => {
    if (gen !== generation) return;
    // Focus goes into the frame as soon as its document exists, so a controller press during the
    // boot lands in the frame's document rather than on the player page behind it.
    focusEmulatorFrame();
    watchFrameKeys(frame, gen);
  });
  loadTimer = setTimeout(() => {
    if (gen !== generation) return;
    renderTimeout();
  }, timeoutMs(EMULATOR_LOAD_TIMEOUT_MS));
  // Only the id travels in the URL; play.mjs reads core, ROM and hash from player-config.json.
  frame.src = `emulator/play.html?id=${encodeURIComponent(currentId)}`;
  els.view.append(frame);
  showPadHint();
}

function renderEmulatorError(message) {
  teardownFrame();
  setStage('failed', panel({
    badge: 'EMULATOR',
    heading: `${byId(currentId)?.title || 'That game'} could not start`,
    copy: message,
    extraNote: 'This ran on your device from files gameflex ships. Nothing was uploaded.',
    actions: `${actionStart('Try again')}${actionBack}`,
  }));
  setStatus(`${byId(currentId)?.title || 'That game'} could not start in this player. ${message}`);
  setChrome();
}

/** Accepts a boot report only from the frame this player created, on our own origin. */
function onFrameMessage(event) {
  if (!open || !emulatorFrame) return;
  if (event.origin !== location.origin) return;
  if (event.source !== emulatorFrame.contentWindow) return;
  const data = event.data;
  if (!data || data.type !== 'gameflex-emulator') return;
  if (Number(emulatorFrame.dataset.generation) !== generation) return;
  if (data.state === 'started') {
    clearTimeout(loadTimer);
    loadTimer = 0;
    els.view.querySelector('.player-stage-label')?.remove();
    els.stage.dataset.state = 'loaded';
    stageState = 'loaded';
    // The runtime takes focus for its own container at this point; make sure it is ours to keep,
    // so a controller press cannot land on the player page instead.
    focusEmulatorFrame();
    setStatus(`${byId(currentId)?.title || 'The game'}: the emulator booted the game file. Restart game replays it from the beginning.`);
    setChrome();
    return;
  }
  if (data.state === 'gamepad') {
    // The frame saw a controller. Nothing here has to know whether the visitor presses it.
    hidePadHint();
    const assigned = typeof data.assigned === 'boolean' ? data.assigned : null;
    setStatus(assigned === false
      ? 'A controller was detected in the emulator.'
      : 'A controller was detected and is set to Player 1.');
    return;
  }
  if (data.state === 'error') {
    renderEmulatorError(typeof data.message === 'string' && data.message ? data.message : 'The emulator stopped before the game started.');
  }
}

/* --------------------------------------------------------- remote prototype */

function startRemote() {
  const base = remoteApiBase();
  if (!base) return renderStart();
  const game = byId(currentId);
  const field = els.view.querySelector('#player-remote-key');
  const createKey = field && ownerKeyEligible() ? field.value.trim() : '';
  teardownFrame();
  const gen = generation;
  const controller = new AbortController();
  const createTimer = setTimeout(() => controller.abort(), remoteCreateTimeoutMs());
  // createTimer deliberately lives outside `timers`: while no id exists it is the
  // only thing bounding the request, so stopRemote() must not clear it.
  remote = { id: null, token: null, socket: null, generation: gen, controller, createTimer, timers: [], key: createKey };
  renderLoading('remote');
  setStatus(`Requesting a remote session for ${game.title}.`);

  // The owner key is memory-only: never written to storage, and only ever sent to a
  // loopback apiBase from a loopback page (ownerKeyEligible()).
  const headers = { 'Content-Type': 'application/json' };
  if (createKey) headers['X-Gameflex-Key'] = createKey;

  fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ gameId: currentId }),
    signal: controller.signal,
  }).then(async response => {
    const session = await response.json().catch(() => null);
    clearTimeout(createTimer);
    if (gen !== generation) { discardLateSession(base, session, createKey); return; }
    if (response.status === 401 || response.status === 403) throw new Error('The relay refused the owner key.');
    if (!response.ok || !validSession(session)) throw new Error('The relay did not return a usable session.');
    remote.id = session.id;
    remote.token = typeof session.token === 'string' ? session.token : '';
    openSocket(base, session, gen);
  }).catch(error => {
    clearTimeout(createTimer);
    if (gen !== generation) return;
    if (error?.name === 'AbortError') return renderRemoteError(`The relay did not answer within ${Math.round(remoteCreateTimeoutMs() / 1000)} seconds.`);
    renderRemoteError(error?.message || 'gameflex could not reach the relay.');
  });
}

function validSession(session) {
  if (!session || typeof session !== 'object') return false;
  if (typeof session.id !== 'string' || !session.id) return false;
  if (typeof session.wsUrl !== 'string' || !session.wsUrl) return false;
  try {
    const url = new URL(session.wsUrl, location.href);
    if (!['wss:', 'ws:'].includes(url.protocol)) return false;
    return url.protocol === 'wss:' || LOOPBACK_HOSTS.has(url.hostname);
  } catch { return false; }
}

function openSocket(base, session, gen) {
  const canvas = document.createElement('canvas');
  canvas.className = 'player-canvas';
  canvas.tabIndex = 0;
  canvas.width = 960;
  canvas.height = 540;
  canvas.setAttribute('aria-label', `Remote preview stream for ${byId(currentId)?.title || 'this game'}. Click the canvas to send keyboard input.`);
  setStage('streaming');
  els.stage.dataset.state = 'streaming';
  els.view.innerHTML = '';
  els.view.append(canvas);
  const context = canvas.getContext('2d');
  const state = { width: canvas.width, height: canvas.height };
  let socket;
  try { socket = new WebSocket(new URL(session.wsUrl, location.href).href); } catch { return renderRemoteError('The relay gave a stream address the browser refused.'); }
  remote.socket = socket;

  const connectTimer = setTimeout(() => { if (gen === generation) renderRemoteError('The stream did not connect in time.'); }, REMOTE_CONNECT_TIMEOUT_MS);
  const firstFrameTimer = setTimeout(() => { if (gen === generation) renderRemoteError('No video arrived from the relay.'); }, REMOTE_FIRST_FRAME_MS);
  remote.timers.push(connectTimer, firstFrameTimer);

  const toCanvas = (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * state.width),
      y: Math.round(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * state.height),
    };
  };
  const send = (payload) => {
    if (gen !== generation || !remote || remote.socket !== socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify({ type: 'input', event: payload }));
  };
  const mouse = (eventType) => (event) => { const { x, y } = toCanvas(event); send({ kind: 'mouse', eventType, x, y, button: MOUSE_BUTTONS[event.button] || 'left' }); };

  canvas.addEventListener('mousemove', mouse('mouseMoved'));
  canvas.addEventListener('mousedown', event => { event.preventDefault(); canvas.focus(); mouse('mousePressed')(event); });
  canvas.addEventListener('mouseup', mouse('mouseReleased'));
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('wheel', event => { event.preventDefault(); const { x, y } = toCanvas(event); send({ kind: 'wheel', x, y, deltaX: Math.round(event.deltaX), deltaY: Math.round(event.deltaY) }); }, { passive: false });
  canvas.addEventListener('keydown', event => { event.preventDefault(); send({ kind: 'key', eventType: 'keyDown', key: event.key, code: event.code }); });
  canvas.addEventListener('keyup', event => { event.preventDefault(); send({ kind: 'key', eventType: 'keyUp', key: event.key, code: event.code }); });

  // One decode at a time: the newest frame replaces any queued frame so a slow
  // decoder can't build an unbounded backlog.
  let decoding = false, queued = null;
  const draw = (data) => {
    if (gen !== generation) return;
    if (decoding) { queued = data; return; }
    decoding = true;
    const image = new Image();
    image.onload = () => {
      if (gen === generation) context.drawImage(image, 0, 0, canvas.width, canvas.height);
      decoding = false;
      if (queued) { const next = queued; queued = null; draw(next); }
    };
    image.onerror = () => { decoding = false; };
    image.src = `data:image/jpeg;base64,${data}`;
  };

  socket.addEventListener('open', () => {
    if (gen !== generation) return;
    clearTimeout(connectTimer);
    setStatus('Remote session connected. Preview only: mouse accuracy and keyboard support may differ.');
    els.fullscreen.hidden = false;
    generateStageNote('Remote preview stream. Relative mouse movement and frame rate are not guaranteed.');
  });
  socket.addEventListener('message', event => {
    if (gen !== generation) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message || message.type !== 'frame') return;
    if (typeof message.data !== 'string' || !message.data || message.data.length > MAX_FRAME_BYTES) return;
    if (!/^[A-Za-z0-9+/=]+$/.test(message.data)) return;
    clearTimeout(firstFrameTimer);
    const width = Number(message.width), height = Number(message.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      state.width = Math.min(Math.round(width), MAX_DIMENSION);
      state.height = Math.min(Math.round(height), MAX_DIMENSION);
      if (canvas.width !== state.width || canvas.height !== state.height) { canvas.width = state.width; canvas.height = state.height; }
    }
    draw(message.data);
  });
  socket.addEventListener('close', () => { if (gen !== generation) return; renderRemoteError('The stream closed.'); });
  socket.addEventListener('error', () => { if (gen !== generation) return; renderRemoteError('The stream connection failed.'); });
}

function generateStageNote(text) {
  const note = document.createElement('p');
  note.className = 'player-stream-note';
  note.textContent = text;
  els.foot.append(note);
}

/**
 * Ends a remote session.
 *
 * A session whose create request has not returned an id yet is deliberately left
 * alone: aborting that request would discard the response, and with it the only
 * session id available to delete. The pending create keeps its own AbortController
 * timeout (REMOTE_CREATE_TIMEOUT_MS), so the wait stays bounded, and the resumed
 * promise is caught by the generation guard, which routes it to
 * discardLateSession() instead of a canvas. So exit never does "abort and delete a
 * returned id" at the same time — with no id it does neither and lets the bounded
 * response do the deleting. Once an id exists, the socket and the session go at once.
 */
function stopRemote(session) {
  if (!session.id) return;
  session.timers?.forEach(timer => clearTimeout(timer));
  session.timers = [];
  if (session.socket) { try { session.socket.close(); } catch { /* already gone */ } }
  const base = remoteApiBase();
  if (base) endSession(base, session.id, session.token, session.key);
}

/** A session that arrives after the player moved on is cleaned up rather than displayed. */
function discardLateSession(base, session, key) {
  if (!session || typeof session.id !== 'string' || !session.id) return;
  endSession(base, session.id, typeof session.token === 'string' ? session.token : '', key);
}

function endSession(base, id, token, key) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['X-Gameflex-Key'] = key;
  fetch(`${base}/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', headers, keepalive: true })
    .catch(() => { /* the relay may already have expired the session */ });
}

/* ------------------------------------------------------------- open / close */

export function isPlayerOpen() { return open; }

export function gameMode(id) { return entryFor(id); }

/** Keeps the catalogue behind the player out of the tab order and out of assistive tech while it is open. */
function setPageInert(on) {
  document.querySelectorAll('body > header, body > main, body > footer, body > .skip-link').forEach(node => {
    if (on) node.setAttribute('inert', '');
    else node.removeAttribute('inert');
  });
}

export function openPlayer(id, { push = true, focus = true } = {}) {
  const safeId = typeof id === 'string' && ID_PATTERN.test(id) ? id : '';
  const switching = open && currentId !== safeId;
  currentId = safeId;
  if (!open) {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    savedScroll = window.scrollY;
    document.documentElement.classList.add('player-open');
    els.root.hidden = false;
    setPageInert(true);
    open = true;
  }
  // Notes default closed: every open and every game switch starts with the overlay shut.
  if (notesOpen || switching) closeNotes({ restore: false });
  if (push) {
    const url = `${location.pathname}${location.search}#play/${safeId}`;
    if (location.hash !== `#play/${safeId}`) {
      pushDepth = open && openedByPush ? pushDepth + 1 : 1;
      history.pushState({ gameflexPlayer: safeId }, '', url);
      openedByPush = true;
    } else { pushDepth = 0; openedByPush = false; }
  } else {
    pushDepth = 0;
    openedByPush = false;
  }
  host.closeDialogs();
  renderBlockedOrStart();
  if (focus) focusPlayer();
  return true;
}

function renderBlockedOrStart() {
  const entry = entryFor(currentId);
  if (entry.mode === 'unavailable') return renderBlocked();
  return renderStart();
}

/** One start path for both modes, so restart keeps using whichever mode the entry declares. */
function startCurrent() {
  const entry = entryFor(currentId);
  if (entry.mode === 'emulator') return startEmulator();
  return startFrame();
}

export function closePlayer() {
  if (!open) return;
  // Leaving costs one history step per entry the player pushed, so switching
  // games while open still lands back on the catalogue, not on the last game.
  const depth = openedByPush && history.state?.gameflexPlayer ? Math.max(1, pushDepth) : 0;
  teardown();
  if (depth) history.go(-depth);
  else history.replaceState(null, '', `${location.pathname}${location.search}`);
}

function teardown() {
  closeNotes({ restore: false });
  teardownFrame();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* already exiting */ });
  els.view.innerHTML = '';
  setStage('idle', '');
  els.root.hidden = true;
  open = false;
  openedByPush = false;
  pushDepth = 0;
  currentId = null;
  document.documentElement.classList.remove('player-open');
  setPageInert(false);
  window.scrollTo(0, savedScroll);
  const target = restoreFocus && restoreFocus.isConnected ? restoreFocus : document.querySelector('.game-art');
  restoreFocus = null;
  if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  setStatus('Player closed. Back to the games.');
}

function focusPlayer() {
  const primary = els.view.querySelector('[data-player-action="start"]');
  const target = primary || (els.start.hidden ? els.close : els.start);
  target.focus({ preventScroll: true });
  // Making the catalogue inert can move focus after the fact, so re-assert it on the next frame.
  requestAnimationFrame(() => {
    if (open && !els.root.contains(document.activeElement)) target.focus({ preventScroll: true });
  });
}

/* -------------------------------------------------------------------- chrome */

function syncFromLocation() {
  const match = /^#play\/(.*)$/.exec(location.hash || '');
  if (match) {
    const id = ID_PATTERN.test(match[1]) ? match[1] : '';
    if (!open || currentId !== id) openPlayer(id, { push: false });
    return;
  }
  if (open) closePlayer();
}

function focusables(scope = els.root) {
  return [...scope.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])')]
    .filter(node => !node.hidden && node.offsetParent !== null);
}

/**
 * Escape closes the notes overlay first and the player only on a second press. While the
 * overlay is open, Tab is trapped inside it; otherwise it is trapped inside the player, so
 * the catalogue behind stays unreachable.
 */
function onKeydown(event) {
  if (!open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (notesOpen) closeNotes();
    else closePlayer();
    return;
  }
  if (event.key !== 'Tab') return;
  const items = notesOpen ? focusables(els.notes) : focusables(els.root);
  if (!items.length) return;
  if (notesOpen) trapNotes(event, items);
  else {
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}

function onFullscreenChange() {
  els.fullscreen.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
}

/* ---------------------------------------------------------------------- init */

export async function initPlayer(playerHost = {}) {
  host = { ...host, ...playerHost };
  els = {
    root: document.getElementById('player'),
    close: document.getElementById('player-close'),
    title: document.getElementById('player-title'),
    start: document.getElementById('player-start'),
    remote: document.getElementById('player-remote'),
    fullscreen: document.getElementById('player-fullscreen'),
    favourite: document.getElementById('player-favourite'),
    stage: document.getElementById('player-stage'),
    foot: document.querySelector('.player-foot'),
    notes: document.getElementById('player-notes'),
    notesButton: document.getElementById('player-notes-button'),
    notesOpen: document.getElementById('player-notes-open'),
    notesClose: document.getElementById('player-notes-close'),
    notesTag: document.getElementById('player-notes-tag'),
    notesGenre: document.getElementById('player-notes-genre'),
    notesPlatform: document.getElementById('player-notes-platform'),
    notesFiles: document.getElementById('player-notes-files'),
    requirements: document.getElementById('player-requirements'),
    requirementsCopy: document.getElementById('player-requirements-copy'),
    status: document.getElementById('player-status'),
  };
  if (!els.root || !els.stage) return false;
  // The stage keeps its own Notes overlay, so game surfaces live in a view layer beside it.
  els.view = document.createElement('div');
  els.view.className = 'player-view';
  els.stage.prepend(els.view);

  try {
    const response = await fetch('player-config.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('player config unavailable');
    const loaded = await response.json();
    if (!loaded || loaded.version !== 2 || typeof loaded.games !== 'object' || loaded.games === null) throw new Error('player config invalid');
    config = loaded;
  } catch {
    config = null;
    configError = true;
  }

  els.close.addEventListener('click', () => closePlayer());
  els.notesButton?.addEventListener('click', () => toggleNotes());
  els.notesOpen?.addEventListener('click', () => toggleNotes());
  els.notesClose?.addEventListener('click', () => closeNotes());
  els.start.addEventListener('click', () => startCurrent());
  els.remote.addEventListener('click', () => startRemote());
  els.favourite.addEventListener('click', () => {
    if (!currentId) return;
    host.toggleFavourite(currentId);
    syncPlayerFavourite();
  });
  els.fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (typeof els.root.requestFullscreen !== 'function') { host.toast('Fullscreen is not available in this browser.'); return; }
    els.root.requestFullscreen().catch(() => host.toast('Fullscreen was blocked by the browser.'));
  });
  els.stage.addEventListener('click', event => {
    const button = event.target.closest('[data-player-action]');
    if (!button) return;
    if (button.dataset.playerAction === 'start') startCurrent();
    if (button.dataset.playerAction === 'remote') startRemote();
    if (button.dataset.playerAction === 'back') closePlayer();
  });

  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('message', onFrameMessage);
  window.addEventListener('popstate', syncFromLocation);
  window.addEventListener('hashchange', syncFromLocation);
  syncFromLocation();
  return true;
}
