import http from 'node:http';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';

import { validateInputMessage } from '../src/input.mjs';
import { installEgressPolicy, denyDownloads } from './policy.mjs';
import { verifySandbox } from './sandbox-check.mjs';

// One session = one container = one browser = one page, pointed at a single
// catalogue URL. Nothing here is shared between sessions.

const PORT = Number(process.env.RUNNER_PORT || 8080);
const TOKEN = process.env.RUNNER_TOKEN || '';
const GAME_URL = process.env.GAME_URL || '';
const TTL_MS = Number(process.env.RUNNER_TTL_MS || 120_000);
const WIDTH = Number(process.env.VIEWER_WIDTH || 960);
const HEIGHT = Number(process.env.VIEWER_HEIGHT || 540);
const QUALITY = Number(process.env.FRAME_QUALITY || 45);
const MAX_FPS = Number(process.env.MAX_FRAME_FPS || 12);
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 20_000);

if (!TOKEN || !GAME_URL) {
  console.error('RUNNER_TOKEN and GAME_URL are required');
  process.exit(2);
}

const state = {
  phase: 'starting',
  startedAt: Date.now(),
  readyAt: null,
  firstFrameAt: null,
  framesSent: 0,
  framesThrottled: 0,
  framesDroppedBacklog: 0,
  frameBytes: 0,
  blocked: [],
  sandbox: null,
  error: null,
  fps: 0,
};

const allowedOrigins = [new URL(GAME_URL).origin];
const log = (msg, extra) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...(extra || {}) }));

let browser = null;
let context = null;
let page = null;
let cdp = null;
let shuttingDown = false;

// ---------------- health + runner socket ----------------
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    const authorized = req.headers['x-runner-token'] === TOKEN;
    if (!authorized) { res.writeHead(401); return res.end('{"error":"invalid_runner_token"}'); }
    const body = JSON.stringify({
      ok: state.phase === 'ready',
      phase: state.phase,
      error: state.error,
      sandbox: state.sandbox,
      game: GAME_URL,
      allowedOrigins,
      viewer: { width: WIDTH, height: HEIGHT, format: 'jpeg', quality: QUALITY, maxFps: MAX_FPS },
      capabilities: { audio: false, relativeMouse: false, clipboard: false, downloads: false, popups: false },
      metrics: {
        startupMs: state.readyAt ? state.readyAt - state.startedAt : null,
        firstFrameMs: state.firstFrameAt ? state.firstFrameAt - state.startedAt : null,
        framesSent: state.framesSent,
        framesThrottled: state.framesThrottled,
        framesDroppedBacklog: state.framesDroppedBacklog,
        avgFrameBytes: state.framesSent ? Math.round(state.frameBytes / state.framesSent) : 0,
        fps: state.fps,
      },
      blocked: state.blocked.slice(0, 20),
    });
    res.writeHead(state.phase === 'ready' ? 200 : 503, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    return res.end(body);
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end('{"error":"not_found"}');
});

const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/runner') || req.headers['x-runner-token'] !== TOKEN) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'status', event: 'attached', phase: state.phase, sandbox: state.sandbox, blocked: state.blocked.slice(0, 10) }));
    ws.on('message', (data) => handleClientMessage(data.toString('utf8')).catch((err) => log('input_error', { error: String(err && err.message) })));
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
});

function broadcast(obj) {
  const text = JSON.stringify(obj);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(text);
}

function noteBlocked(reason, url) {
  const entry = { reason, origin: safeOrigin(url), at: new Date().toISOString() };
  state.blocked.push(entry);
  if (state.blocked.length > 200) state.blocked.shift();
  log('egress_blocked', entry);
  broadcast({ type: 'status', event: 'egress_blocked', detail: entry });
}

function safeOrigin(rawUrl) {
  try { return new URL(rawUrl).origin; } catch { return 'unparseable'; }
}

// ---------------- input ----------------
function keyCodeFor(code, key) {
  if (/^Digit[0-9]$/.test(code)) return 48 + Number(code.slice(5));
  if (/^Key[A-Z]$/.test(code)) return 65 + code.charCodeAt(3) - 65;
  if (/^Numpad[0-9]$/.test(code)) return 96 + Number(code.slice(6));
  if (/^F([1-9]|1[0-2])$/.test(code)) return 111 + Number(code.slice(1));
  const table = {
    Backspace: 8, Tab: 9, Enter: 13, ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17,
    AltLeft: 18, AltRight: 18, Pause: 19, CapsLock: 20, Escape: 27, Space: 32, PageUp: 33, PageDown: 34,
    End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46,
    MetaLeft: 91, MetaRight: 92, ContextMenu: 93, Semicolon: 186, Equal: 187, Comma: 188, Minus: 189,
    Period: 190, Slash: 191, Backquote: 192, BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222,
  };
  if (table[code]) return table[code];
  if (typeof key === 'string' && key.length === 1) {
    const upper = key.toUpperCase().charCodeAt(0);
    if (upper >= 32 && upper <= 126) return upper;
  }
  return 0;
}

const pressedButtons = new Set();

async function handleClientMessage(text) {
  const result = validateInputMessage(text, { maxBytes: 16 * 1024 });
  if (!result.ok) return;                      // gateway already validated; drop quietly
  if (!cdp) return;
  const ev = result.event;

  if (ev.kind === 'mouse') {
    if (ev.eventType === 'mousePressed') pressedButtons.add(ev.button);
    if (ev.eventType === 'mouseReleased') pressedButtons.delete(ev.button);
    await cdp.send('Input.dispatchMouseEvent', {
      type: ev.eventType === 'mouseMoved' ? 'mouseMoved' : ev.eventType === 'mousePressed' ? 'mousePressed' : 'mouseReleased',
      x: ev.x, y: ev.y,
      button: ev.button === 'none' ? 'none' : ev.button,
      buttons: [...pressedButtons].reduce((acc, b) => acc | (b === 'left' ? 1 : b === 'right' ? 2 : 4), 0),
      clickCount: ev.eventType === 'mouseMoved' ? 0 : 1,
    });
    return;
  }

  if (ev.kind === 'wheel') {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: ev.x, y: ev.y, deltaX: ev.deltaX, deltaY: ev.deltaY,
      button: 'none', buttons: 0,
    });
    return;
  }

  if (ev.kind === 'key') {
    const keyCode = keyCodeFor(ev.code, ev.key);
    const payload = {
      type: ev.eventType === 'keyDown' ? 'keyDown' : 'keyUp',
      key: ev.key,
      code: ev.code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      autoRepeat: false,
      isKeypad: ev.code.startsWith('Numpad'),
    };
    if (ev.eventType === 'keyDown' && ev.key.length === 1) payload.text = ev.key;
    await cdp.send('Input.dispatchKeyEvent', payload);
  }
}

// ---------------- boot ----------------
async function boot() {
  let sandbox;
  try {
    sandbox = await verifySandbox();
  } catch (err) {
    // Chromium aborts outright when it is told to sandbox and cannot: that is a
    // failure, not a reason to relaunch inside an unsandboxed browser.
    state.phase = 'failed';
    state.error = `SANDBOX_UNAVAILABLE: sandboxed chromium failed to start: ${String(err && err.message).split('\n')[0]}`;
    log('sandbox_unavailable', { error: state.error });
    await shutdown(3);
    return;
  }
  state.sandbox = { ok: sandbox.ok, failures: sandbox.failures, evidence: sandbox.evidence };
  if (!sandbox.ok) {
    state.phase = 'failed';
    state.error = `SANDBOX_UNAVAILABLE: ${sandbox.failures.join(',')}`;
    log('sandbox_unavailable', { failures: sandbox.failures, evidence: sandbox.evidence });
    // No silent downgrade: the container exits and the gateway reports failure.
    await shutdown(3);
    return;
  }
  log('sandbox_verified', { evidence: sandbox.evidence, failures: sandbox.failures });

  browser = await chromium.launch({
    channel: 'chromium',
    headless: true,
    chromiumSandbox: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--mute-audio', '--hide-scrollbars'],
  });
  context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    acceptDownloads: false,
    ignoreHTTPSErrors: false,
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  await installEgressPolicy(context, page, { allowedOrigins, onBlock: noteBlocked });

  cdp = await context.newCDPSession(page);
  await denyDownloads(cdp);

  const navStart = Date.now();
  try {
    await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    log('game_loaded', { ms: Date.now() - navStart, url: page.url() });
  } catch (err) {
    // A blocked or slow launch page is reported, never worked around silently.
    log('game_load_incomplete', { error: String(err && err.message).split('\n')[0], url: page.url() });
  }

  await startScreencast();

  state.phase = 'ready';
  state.readyAt = Date.now();
  log('runner_ready', { startupMs: state.readyAt - state.startedAt });

  setTimeout(() => { broadcast({ type: 'status', event: 'expiring', ttlMs: TTL_MS }); }, Math.max(1_000, TTL_MS - 5_000));
  setTimeout(() => { log('ttl_reached'); shutdown(0); }, TTL_MS);
}

// ---------------- screencast ----------------
async function startScreencast() {
  let lastSentAt = 0;
  const minInterval = 1000 / MAX_FPS;
  cdp.on('Page.screencastFrame', async (frame) => {
    const now = Date.now();
    try {
      if (now - lastSentAt < minInterval) state.framesThrottled += 1;
      else {
        lastSentAt = now;
        state.framesSent += 1;
        state.frameBytes += frame.data.length;
        if (!state.firstFrameAt) state.firstFrameAt = now;
        // CDP screencast metadata carries deviceWidth/deviceHeight, not width/height.
        const width = frame.metadata.deviceWidth || WIDTH;
        const height = frame.metadata.deviceHeight || HEIGHT;
        let skipped = false;
        for (const ws of clients) {
          if (ws.readyState !== ws.OPEN) continue;
          if (ws.bufferedAmount > 2 * 1024 * 1024) { skipped = true; continue; }
          ws.send(JSON.stringify({ type: 'frame', format: 'jpeg', data: frame.data, width, height, ts: now }));
        }
        if (skipped) state.framesDroppedBacklog += 1;
      }
      await cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    } catch (err) {
      log('screencast_error', { error: String(err && err.message) });
    }
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg', quality: QUALITY, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1,
  });

  setInterval(() => {
    const window = 5;
    state.fps = Math.round((state.framesSent - (state.lastStatsFrames || 0)) / window * 10) / 10;
    state.lastStatsFrames = state.framesSent;
    broadcast({
      type: 'stats',
      fps: state.fps,
      framesSent: state.framesSent,
      framesThrottled: state.framesThrottled,
      framesDroppedBacklog: state.framesDroppedBacklog,
      avgFrameBytes: state.framesSent ? Math.round(state.frameBytes / state.framesSent) : 0,
      clients: clients.size,
    });
  }, 5_000);
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  try { if (cdp) await cdp.send('Page.stopScreencast'); } catch { /* already gone */ }
  for (const ws of clients) { try { ws.close(1001, 'runner stopping'); } catch { /* noop */ } }
  try { if (browser) await browser.close(); } catch { /* noop */ }
  try { server.close(); } catch { /* noop */ }
  process.exit(code);
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

server.listen(PORT, '0.0.0.0', () => {
  log('runner_listening', { port: PORT, game: GAME_URL, allowedOrigins });
  boot().catch((err) => {
    state.phase = 'failed';
    state.error = String(err && err.message);
    log('boot_failed', { error: state.error });
    shutdown(4);
  });
});
