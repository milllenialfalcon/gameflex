/**
 * Emulator QA: boots every listed emulator game in the real gameflex player, in every desktop
 * browser we support, and records what actually happened.
 *
 *   npm run test:emulator                 # hosted listings + the local test shelf, 3 browsers
 *   npm run test:emulator -- --artwork    # capture dist/assets/emu-<id>.png from the real player
 *   npm run test:emulator -- --only super-tilt-bro,ucity --browsers chrome
 *   npm run test:emulator -- --pads-only  # only the simulated-gamepad scenarios
 *   npm run test:emulator -- --no-pads    # skip the simulated-gamepad scenarios
 *
 * What it proves, per ROM per browser: the player opens the right frame, the ROM boots with
 * zero requests to any other origin, the host page reports no CSP violation, the canvas is not
 * blank and is still changing two seconds later, Enter is delivered, and exiting removes the
 * frame. Input is injected and recorded, never asserted: a screenshot pair is saved for a human
 * to look at.
 *
 * The simulated-gamepad scenarios (hosted NES, SNES and GBA listings) assert one more thing: a
 * pad press delivered through the frame's own document reaches the runtime's input call for the
 * control the runtime's default pad map gives it. The pad is injected (navigator.getGamepads is
 * overridden in the page), so this proves gameflex's wiring, not real-browser device exposure.
 *
 * What it does not prove: playability. "booted" is EmulatorJS's own start event. Nobody has
 * played a game because this script pressed Enter.
 *
 * Origin: the run is served over HTTPS on https://gameflex.test:<port>, mapped to loopback in
 * each browser. A loopback hostname would make the vendored runtime run its CDN update check,
 * which its own CSP then blocks, and the "no CSP violation" check would be measuring that quirk
 * instead of the build. The certificate is self-signed and generated into artifacts/emulator-qa/
 * (git-ignored). Both the certificate and the hostname mapping are test scaffolding.
 *
 * Requirements: Node 22+, playwright 1.62.1 (npm install), openssl on PATH, and a running
 * scripts/serve.mjs (this script starts and stops its own).
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
// The QA server uses a self-signed certificate, so Node's fetch has to accept it. This is a
// local test harness talking to localhost, and it applies to this process only.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ARTIFACTS = path.join(ROOT, 'artifacts', 'emulator-qa');
const ORIGIN_HOST = 'gameflex.test';
/** 0 lets the OS pick a free port, so a leftover server from an earlier run cannot block this one. */
const PORT = Number(process.env.GAMEFLEX_QA_PORT || 0);
/** Both are set once the server reports the port it actually bound. */
let ORIGIN = '';
let SERVER = '';
const SHOT_DIR = path.join(ARTIFACTS, 'screenshots');
const ART_DIR = path.join(ROOT, 'artifacts', 'emulator-qa', 'artwork-preview');

/* ------------------------------------------------------------------- options */

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};
const ARTWORK_ONLY = argv.includes('--artwork');
const CORE_AUDIT_ONLY = argv.includes('--core-audit');
const only = option('--only', '').split(',').map(value => value.trim()).filter(Boolean);
const browserFilter = option('--browsers', '').split(',').map(value => value.trim()).filter(Boolean);
/** `--shelf hosted|test-shelf` narrows the matrix; `--no-negative` skips the failure fixtures. */
const shelfFilter = option('--shelf', '');
const skipNegative = argv.includes('--no-negative');
/**
 * The simulated-gamepad scenarios run by default on the hosted NES, SNES and GBA listings
 * (`--no-pads` skips them, `--pads-only` runs nothing else).
 */
const skipPads = argv.includes('--no-pads');
const padsOnly = argv.includes('--pads-only');
const PAD_SCENARIOS = ['load', 'late'];
const PAD_SYSTEMS = ['nes', 'snes', 'gba'];
/** Heavy cores get longer to reach `started`; everything else must boot in 30 s. */
const SLOW_SYSTEMS = ['psx', 'n64', 'nds'];
const START_TIMEOUT_MS = 30000;
const START_TIMEOUT_SLOW_MS = 60000;

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

/** A run passes when it started and every assertion came back true. A missing assertion fails. */
const failedChecks = observed => {
  const flags = Object.entries(observed.checks || {}).filter(([, value]) => value !== true).map(([key]) => key);
  if (!observed.started) flags.unshift('not started');
  return flags;
};

/* -------------------------------------------------------------- png + pixels */

/** Playwright screenshots are 8-bit non-interlaced RGB/RGBA PNGs; that is all this handles. */
function decodePng(buffer) {
  let offset = 8;
  let header = null;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colour: body[9], interlace: body[12] };
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header) throw new Error('screenshot is not a PNG');
  if (header.depth !== 8 || header.interlace !== 0 || ![2, 6].includes(header.colour)) throw new Error('unsupported screenshot format');
  const channels = header.colour === 6 ? 4 : 3;
  const stride = header.width * channels;
  const raw = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(header.height * stride);
  let cursor = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[x - channels] : 0;
      const up = above ? above[x] : 0;
      const upLeft = above && x >= channels ? above[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[x] = value & 0xff;
    }
  }
  return { width: header.width, height: header.height, channels, pixels };
}

/** Distinct colours, mean luminance, the most common colour, and how much two frames differ. */
function imageStats(image, other = null) {
  const { channels, pixels } = image;
  const counts = new Map();
  let luminance = 0;
  for (let i = 0; i < pixels.length; i += channels) {
    const colour = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    counts.set(colour, (counts.get(colour) || 0) + 1);
    luminance += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
  }
  const count = pixels.length / channels;
  let differing = 0;
  if (other) {
    for (let i = 0; i < pixels.length; i += channels) {
      if (pixels[i] !== other.pixels[i] || pixels[i + 1] !== other.pixels[i + 1] || pixels[i + 2] !== other.pixels[i + 2]) differing += 1;
    }
  }
  const [dominant, dominantCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [0, 0];
  return {
    width: image.width,
    height: image.height,
    distinctColours: counts.size,
    meanLuminance: Number((luminance / count).toFixed(2)),
    dominantColour: `#${dominant.toString(16).padStart(6, '0')}`,
    dominantShare: Number((dominantCount / count).toFixed(3)),
    differingPixels: other ? differing : null,
    differingFraction: other ? Number((differing / count).toFixed(4)) : null,
  };
}

/* ------------------------------------------------------------------ harness */

/**
 * --core-audit: decompress every vendored core with the runtime's own 7z worker and record what
 * each archive contains — the core.json it ships (name, extensions, save type, repository) and
 * any ASCII string that mentions firmware or a BIOS file. This is the evidence behind the
 * system/core/extension map in scripts/check-catalog.mjs, behind the choice of DS core, and
 * behind "no vendored core asks this build for a BIOS file".
 */
async function coreAudit(browserInstance) {
  const lock = JSON.parse(await readFile(path.join(ROOT, 'emulator/emulatorjs-lock.json'), 'utf8'));
  const cores = lock.packages.filter(entry => entry.kind === 'core' && entry.core);
  const page = await browserInstance.newPage({ ignoreHTTPSErrors: true });
  // A document on the QA origin without loading the catalogue app; only the origin matters here.
  await page.route(`${ORIGIN}/__core-audit.html`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>core audit</title>' }));
  await page.goto(`${ORIGIN}/__core-audit.html`, { waitUntil: 'domcontentloaded' });
  const audited = [];
  for (const entry of cores) {
    const dataUrl = `${ORIGIN}/emulator/ejs/${lock.version}/cores/${entry.dataFile}`;
    const workerUrl = `${ORIGIN}/emulator/ejs/${lock.version}/compression/extract7z.js`;
    const result = await page.evaluate(async ({ dataUrl, workerUrl }) => {
      const source = await (await fetch(workerUrl)).text();
      const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'application/javascript' })));
      const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
      const files = [];
      const done = new Promise(resolve => {
        worker.onmessage = event => {
          if (!event.data) return;
          if (event.data.t === 2) files.push({ name: event.data.file, data: event.data.data });
          if (event.data.t === 1) resolve('done');
        };
      });
      const outcome = await Promise.race([done, new Promise(resolve => setTimeout(() => resolve('timeout'), 60000))]);
      worker.terminate();
      if (outcome !== 'done') return { error: 'the 7z worker did not finish within 60 s' };
      const decode = data => new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(data));
      // Firmware handling lives in the compiled core, so read ASCII strings out of every file.
      const strings = new Set();
      for (const file of files) {
        const raw = new Uint8Array(file.data);
        let run = '';
        for (let i = 0; i < raw.length; i += 1) {
          const code = raw[i];
          if (code >= 32 && code < 127) run += String.fromCharCode(code);
          else { if (run.length >= 7) strings.add(run); run = ''; }
        }
        if (run.length >= 7) strings.add(run);
      }
      const coreJson = files.find(file => file.name === 'core.json');
      return {
        files: files.map(file => ({ name: file.name, bytes: new Uint8Array(file.data).length })),
        coreJson: coreJson ? JSON.parse(decode(coreJson.data)) : null,
        firmwareStrings: [...strings].filter(text => /bios|firmware|scph/i.test(text)).slice(0, 24),
      };
    }, { dataUrl, workerUrl }).catch(error => ({ error: String(error.message || error).slice(0, 200) }));
    audited.push({ core: entry.core, systems: entry.systems, dataFile: entry.dataFile, ...result });
    const summary = result.error ? `error: ${result.error}` : `extensions ${(result.coreJson?.extensions || []).join(',')} — ${result.firmwareStrings.length} firmware strings`;
    console.log(`  ${entry.core}: ${summary}`);
  }
  await page.close();
  return audited;
}

const browsers = [
  { name: 'chrome', kind: 'chromium', channel: 'chrome' },
  { name: 'msedge', kind: 'chromium', channel: 'msedge' },
  { name: 'firefox', kind: 'firefox' },
];

async function launch(browser) {
  const { chromium, firefox } = await import('playwright');
  if (browser.kind === 'firefox') {
    return firefox.launch({ firefoxUserPrefs: { 'network.dns.localDomains': ORIGIN_HOST } });
  }
  return chromium.launch({
    channel: browser.channel,
    args: [`--host-resolver-rules=MAP ${ORIGIN_HOST} 127.0.0.1`],
  });
}

async function ensureCertificate() {
  await mkdir(ARTIFACTS, { recursive: true });
  const key = path.join(ARTIFACTS, 'gameflex-qa-key.pem');
  const cert = path.join(ARTIFACTS, 'gameflex-qa-cert.pem');
  const existing = await readFile(cert, 'utf8').catch(() => null);
  if (existing) return { key, cert };
  const result = await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert, '-days', '30', '-nodes', '-subj', `/CN=${ORIGIN_HOST}`, '-addext', `subjectAltName=DNS:${ORIGIN_HOST},DNS:localhost,IP:127.0.0.1`]);
  if (result.code !== 0) throw new Error(`openssl could not create the QA certificate: ${result.stderr.slice(0, 300)}`);
  return { key, cert };
}

function run(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: ROOT, shell: process.platform === 'win32' });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

async function startServer(certificate) {
  const child = spawn(process.execPath, ['scripts/serve.mjs', '--test-roms', '--port', String(PORT), '--tls-cert', certificate.cert, '--tls-key', certificate.key], { cwd: ROOT });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve.mjs did not report a listening port within 20 s: ${output.slice(0, 400)}`)), 20000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /Local: https:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`serve.mjs exited with ${code}: ${output.slice(0, 400)}`)); });
  });
  const port = await ready;
  return { child, port, banner: output.trim() };
}

async function httpJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.json();
}

/* --------------------------------------------------------------------- cases */

/**
 * Runs one ROM in one browser through the real player route and returns everything observed.
 */
async function playOne(context, target, { keepArt = null } = {}) {
  const page = await context.newPage();
  const requests = [];
  const consoleMessages = [];
  const pageErrors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('console', message => consoleMessages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => pageErrors.push(String(error)));

  const observed = { id: target.id, title: target.title, system: target.system, core: target.core, shelf: target.shelf, browser: target.browser || '', state: null, started: false, checks: {}, samples: [], screenshots: [], notes: [] };
  try {
    await page.goto(`${ORIGIN}/#play/${target.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#player:not([hidden])', { timeout: 15000 });
    // Start the game the way the panel's own Start game button does.
    await page.click('#player-stage [data-player-action="start"]');
    const timeout = SLOW_SYSTEMS.includes(target.system) ? START_TIMEOUT_SLOW_MS : START_TIMEOUT_MS;
    await page.waitForFunction(
      () => ['loaded', 'failed', 'timeout', 'blocked'].includes(document.getElementById('player-stage')?.dataset.state || ''),
      null,
      { timeout }
    ).catch(() => {});
    observed.state = await page.evaluate(() => document.getElementById('player-stage')?.dataset.state || 'unknown');
    observed.started = observed.state === 'loaded';
    const sandbox = await page.locator('#player iframe.player-frame').first().getAttribute('sandbox').catch(() => null);
    const src = await page.locator('#player iframe.player-frame').first().getAttribute('src').catch(() => null);
    observed.frame = {
      present: await page.locator('#player iframe.player-frame').count() === 1,
      src,
      sandbox,
      title: await page.locator('#player iframe.player-frame').first().getAttribute('title').catch(() => null),
      status: ((await page.locator('#player-status').textContent().catch(() => '')) || '').trim(),
    };
    observed.checks = {
      framePresent: observed.frame.present,
      frameSrcIsEmulatorPage: String(src || '').includes(`emulator/play.html?id=${target.id}`),
      sandboxTokenSet: sandbox === 'allow-scripts allow-same-origin allow-pointer-lock',
    };

    const frame = page.frameLocator('#player iframe.player-frame');
    const canvas = frame.locator('#game canvas').first();
    const hasCanvas = observed.started && await canvas.count() > 0;
    observed.checks.canvasPresent = hasCanvas;
    if (hasCanvas) {
      // Three samples two seconds apart: the first pair is the one the spec asks for, and the
      // extra ones tell a static screen (a menu, a title card) apart from a frozen surface.
      await page.waitForTimeout(1500);
      const taken = [];
      for (let index = 0; index < 3; index += 1) {
        if (index) await page.waitForTimeout(2000);
        const file = path.join(SHOT_DIR, `${target.shelf}-${target.id}-${observed.browser}-sample${index + 1}.png`);
        await canvas.screenshot({ path: file });
        taken.push(await readFile(file));
      }
      const images = taken.map(decodePng);
      const comparisons = [];
      for (let a = 0; a < images.length; a += 1) {
        for (let b = a + 1; b < images.length; b += 1) comparisons.push(imageStats(images[a], images[b]).differingFraction);
      }
      observed.samples = images.map(image => imageStats(image));
      observed.samples[0].comparedToLater = comparisons;
      // A single flat colour in one sample is normal (fades, black transitions, a solid screen),
      // so "renders" means: some sample has content, or any pair of frames differs. A dead
      // surface is a frozen flat colour, which fails both.
      observed.checks.canvasChanging = comparisons.some(fraction => fraction > 0);
      observed.checks.canvasRenders = observed.samples.some(sample => sample.distinctColours > 1) || observed.checks.canvasChanging;
      // Input is delivered and recorded, never asserted: see the screenshot pair.
      const before = path.join(SHOT_DIR, `${target.shelf}-${target.id}-${observed.browser}-before-enter.png`);
      const after = path.join(SHOT_DIR, `${target.shelf}-${target.id}-${observed.browser}-after-enter.png`);
      await canvas.click({ position: { x: 20, y: 20 } }).catch(() => {});
      await canvas.screenshot({ path: before });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1200);
      await canvas.screenshot({ path: after });
      observed.screenshots = [before, after];
      observed.checks.enterDelivered = true;
    }

    const frameViolations = await page.evaluate(() => {
      const frame = document.querySelector('#player iframe.player-frame');
      try { return frame?.contentWindow?.__cspViolations || []; } catch { return null; }
    });
    observed.cspViolations = Array.isArray(frameViolations) ? frameViolations : [];
    observed.checks.noCspViolations = observed.cspViolations.length === 0;
    observed.checks.noNonSelfRequests = requests.every(url => url.startsWith(ORIGIN) || url.startsWith('blob:') || url.startsWith('data:'));
    observed.nonSelfRequests = [...new Set(requests.filter(url => !url.startsWith(ORIGIN) && !url.startsWith('blob:') && !url.startsWith('data:')))];
    observed.consoleErrors = consoleMessages.filter(message => message.startsWith('error:')).slice(0, 8);
    observed.pageErrors = pageErrors.slice(0, 4);
  } catch (error) {
    observed.error = String(error.message || error).slice(0, 400);
  }

  // Exit runs whatever happened above: a frame that survives the close button is an audio and
  // memory leak, and that is worth catching even when the boot itself failed.
  try {
    await page.click('#player-close', { timeout: 5000 });
    await page.waitForTimeout(800);
    observed.checks.exitRemovesFrame = await page.locator('#player iframe').count() === 0;
    observed.checks.playerClosed = await page.locator('#player[hidden]').count() === 1;
  } catch (error) {
    observed.checks.exitRemovesFrame = false;
    observed.exitError = String(error.message || error).slice(0, 200);
  }
  await page.close();
  return observed;
}

/** The negative cases: a bad hash, a missing core and an unknown id must all fail closed. */
async function playNegative(browserInstance, name, mutate) {
  const page = await browserInstance.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1024, height: 768 } });
  await page.addInitScript(() => { window.__GAMEFLEX_PLAYER_TIMEOUT_MS = 60000; });
  // The configs are read from disk rather than through the page: this process cannot resolve the
  // browser's test hostname, and the fixtures only need the shipped catalogue plus one entry.
  const games = JSON.parse(await readFile(path.join(ROOT, 'dist/games.json'), 'utf8'));
  const config = JSON.parse(await readFile(path.join(ROOT, 'dist/player-config.json'), 'utf8'));
  await page.route('**/games.json', async route => {
    await route.fulfill({ json: [...games, { id: mutate.id, title: 'QA case', url: `https://gameflex.lol/#play/${mutate.id}`, genre: 'qa', category: 'test-roms', tag: 'QA', description: 'QA fixture', requirements: 'QA fixture', checkedAt: '2026-10-12' }] });
  });
  await page.route('**/player-config.json', async route => {
    const withCase = JSON.parse(JSON.stringify(config));
    withCase.games[mutate.id] = mutate.entry;
    await route.fulfill({ json: withCase });
  });
  const observed = { case: name, id: mutate.id, browser: '', state: null, message: null, frameLeak: null };
  try {
    await page.goto(`${ORIGIN}/#play/${mutate.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#player:not([hidden])', { timeout: 15000 });
    if (mutate.entry) await page.click('#player-stage [data-player-action="start"]');
    await page.waitForFunction(
      () => ['loaded', 'failed', 'timeout', 'blocked'].includes(document.getElementById('player-stage')?.dataset.state || ''),
      null,
      { timeout: 40000 }
    ).catch(() => {});
    observed.state = await page.evaluate(() => document.getElementById('player-stage')?.dataset.state || 'unknown');
    observed.message = ((await page.locator('#player-view .player-panel').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    observed.frameLeak = await page.locator('#player iframe.player-frame').count() > 0;
    observed.pass = observed.state === mutate.expect && observed.frameLeak === false;
  } catch (error) {
    observed.error = String(error.message || error).slice(0, 300);
    observed.pass = false;
  }
  await page.close();
  return observed;
}

/* ------------------------------------------------------- simulated gamepad */

/**
 * The simulated pad. `mode` is 'load' (the pad is already visible to every document from its
 * first script tick) or 'late' (the pad is invisible until the harness connects it).
 *
 * This stands in for the browser's half of the Gamepad API: it makes one standard-mapping pad
 * visible to navigator.getGamepads() and dispatches the connection events, so the harness can
 * press its buttons. It proves gameflex's own wiring — the player's focus, the host page and
 * the vendored runtime. It proves nothing about a real device, because a real pad is only
 * exposed to a document by the browser, after a button press while that document has focus.
 *
 * Button indices are the standard mapping the runtime's own labels use (button 9 = START,
 * button 15 = DPAD_RIGHT).
 */
const PAD_SCRIPT = (mode) => {
  const buttons = [];
  for (let index = 0; index < 17; index += 1) buttons.push({ pressed: false, touched: false, value: 0 });
  const pad = {
    id: 'Gameflex QA Pad (STANDARD GAMEPAD Vendor: 0000 Product: 0001)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
    hapticActuators: [],
  };
  const state = { exposed: mode === 'load' };
  const fire = (name) => {
    let event;
    try {
      event = new GamepadEvent(name, { gamepad: pad });
    } catch {
      event = new Event(name);
      Object.defineProperty(event, 'gamepad', { value: pad, configurable: true });
    }
    window.dispatchEvent(event);
  };
  // A page script must not be able to tell this apart from the real thing: same shape, same
  // identity across calls, and it only ever answers from the current state.
  const getGamepads = () => (state.exposed ? [pad] : []);
  try {
    Object.defineProperty(Navigator.prototype, 'getGamepads', { value: getGamepads, configurable: true, writable: true });
  } catch {
    try { navigator.getGamepads = getGamepads; } catch { /* the override is best effort */ }
  }
  window.__qaPad = {
    id: pad.id,
    mapping: pad.mapping,
    get exposed() { return state.exposed; },
    press(index) {
      if (buttons[index].pressed) return;
      buttons[index] = { pressed: true, touched: true, value: 1 };
      pad.timestamp = performance.now();
    },
    release(index) {
      if (!buttons[index].pressed) return;
      buttons[index] = { pressed: false, touched: false, value: 0 };
      pad.timestamp = performance.now();
    },
    connect() { if (state.exposed) return; state.exposed = true; fire('gamepadconnected'); },
    disconnect() { if (!state.exposed) return; state.exposed = false; fire('gamepaddisconnected'); },
  };
  // In the player document only: sample where focus sits against the player's own stage state,
  // so the run can say whether focus was on the emulator frame while the game was still booting
  // (before EmulatorJS focuses its own container) or only once it had started.
  if (window.top === window) {
    const log = [];
    window.__qaFocusLog = log;
    setInterval(() => {
      const stage = document.getElementById('player-stage');
      const player = document.getElementById('player');
      const active = document.activeElement;
      log.push({
        state: (stage && stage.dataset.state) || '',
        where: active === player ? 'player' : active && active.classList && active.classList.contains('player-frame') ? 'frame' : (active && active.tagName ? active.tagName.toLowerCase() : 'none'),
        hint: Boolean(document.getElementById('player-pad-hint')),
      });
      if (log.length > 600) log.shift();
    }, 100);
  }
};

/** Standard-mapping button indices, as the runtime's own labels name them. */
const PAD_BUTTONS = { start: 9, dpadRight: 15 };
/**
 * Where those two presses have to land: the vendored runtime's own default pad map binds
 * START to control 3 and DPAD_RIGHT to control 7 of the standard layout (defaultControllers in
 * data/src/emulator.js), so that is what gameManager.simulateInput must be called with.
 */
const PAD_CONTROLS = { start: 3, dpadRight: 7 };

/** The frame the player is showing the emulator in, matched by the id the player put in its URL. */
function emulatorFrame(page, id) {
  return page.frames().find(frame => frame.url().includes(`emulator/play.html?id=${encodeURIComponent(id)}`)) || null;
}

/**
 * One simulated-gamepad scenario in one browser.
 *
 * scenario 'load': the pad is visible to the frame's document before the runtime builds its own
 *   gamepad handler — the state a pad is in when it was already being pressed before the game
 *   page started polling.
 * scenario 'late': the frame's document sees no pad at all until the game has started; the
 *   harness then connects one, so the runtime meets a pad that arrives while it is listening.
 *   That is also the only scenario that can see the player's hint, because the hint is supposed
 *   to stay up while no pad has been seen.
 *
 * Asserted per run: focus lands on the frame, the runtime sees the pad, Player 1's gamepad slot
 * is filled, and the pressed Start and D-pad Right arrive at the runtime's own input call
 * (gameManager.simulateInput) as controls 3 and 7. The canvas screenshots before and after the
 * presses are recorded, never asserted.
 */
async function playPadOne(context, target, scenario) {
  const page = await context.newPage();
  const observed = {
    id: target.id, title: target.title, system: target.system, core: target.core, shelf: target.shelf,
    browser: target.browser || '', scenario, state: null, started: false, checks: {}, notes: [],
    selection: [], padIdentifiers: [], padEvents: [], hintText: '', screenshots: [], samples: [],
  };
  try {
    await page.goto(`${ORIGIN}/#play/${target.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#player:not([hidden])', { timeout: 15000 });
    await page.click('#player-stage [data-player-action="start"]');
    const timeout = SLOW_SYSTEMS.includes(target.system) ? START_TIMEOUT_SLOW_MS : START_TIMEOUT_MS;
    await page.waitForFunction(
      () => ['loaded', 'failed', 'timeout', 'blocked'].includes(document.getElementById('player-stage')?.dataset.state || ''),
      null,
      { timeout }
    ).catch(() => {});
    observed.state = await page.evaluate(() => document.getElementById('player-stage')?.dataset.state || 'unknown');
    observed.started = observed.state === 'loaded';

    const hint = page.locator('#player-pad-hint');
    observed.hintText = (await hint.textContent().catch(() => '')) || '';
    if (scenario === 'late') observed.checks.hintStaysUntilPad = await hint.isVisible().catch(() => false);
    observed.checks.frameFocused = await page.evaluate(() => document.activeElement?.classList?.contains('player-frame') === true);
    // EmulatorJS focuses its own container when the game starts, which alone puts focus on the
    // frame at `loaded`. What the player has to do is get focus there earlier, while the game is
    // still booting, because that is when a pad press has to land in the frame's document.
    // The same sampler catches the hint: in the 'load' scenario the frame reports the pad within
    // the first second, so the hint can be gone before this point is reached.
    const focusLog = await page.evaluate(() => (window.__qaFocusLog || []).map(entry => ({ ...entry })));
    observed.focusWhileLoading = [...new Set(focusLog.filter(entry => entry.state === 'loading').map(entry => entry.where))];
    observed.checks.frameFocusedWhileLoading = observed.focusWhileLoading.includes('frame');
    observed.checks.hintShownOnStart = focusLog.some(entry => entry.hint && (entry.state === 'loading' || entry.state === 'loaded'));

    const frame = emulatorFrame(page, target.id);
    if (!frame) throw new Error('the emulator frame is not in the page');

    // The runtime's own input call is where a pad press has to arrive. Wrapping the instance
    // method measures the runtime's real path; nothing in dist/emulator/ejs/ is touched.
    await frame.evaluate(() => {
      window.__qaInputs = [];
      window.__qaPadEvents = [];
      const runtime = window.EJS_emulator;
      if (window.__qaPad) {
        window.addEventListener('gamepadconnected', event => window.__qaPadEvents.push({ type: event.type, id: event.gamepad?.id || '' }));
        window.addEventListener('gamepaddisconnected', event => window.__qaPadEvents.push({ type: event.type, id: event.gamepad?.id || '' }));
      }
      const manager = runtime && runtime.gameManager;
      if (!manager || typeof manager.simulateInput !== 'function' || manager.__qaWrapped) return;
      const original = manager.simulateInput.bind(manager);
      manager.__qaWrapped = true;
      manager.simulateInput = (player, control, value) => {
        window.__qaInputs.push([player, control, value]);
        return original(player, control, value);
      };
    });

    if (scenario === 'late') {
      await frame.evaluate(() => window.__qaPad.connect());
      await page.waitForTimeout(400);
    }

    const canvas = frame.locator('#game canvas').first();
    const before = path.join(SHOT_DIR, `pads-${target.id}-${observed.browser}-${scenario}-before-start.png`);
    const after = path.join(SHOT_DIR, `pads-${target.id}-${observed.browser}-${scenario}-after-dpad.png`);
    await canvas.screenshot({ path: before }).catch(() => {});
    await frame.evaluate(index => window.__qaPad.press(index), PAD_BUTTONS.start).catch(() => {});
    await page.waitForTimeout(600);
    await frame.evaluate(index => window.__qaPad.press(index), PAD_BUTTONS.dpadRight).catch(() => {});
    await page.waitForTimeout(600);
    await canvas.screenshot({ path: after }).catch(() => {});
    await frame.evaluate(([start, dpad]) => { window.__qaPad.release(start); window.__qaPad.release(dpad); }, [PAD_BUTTONS.start, PAD_BUTTONS.dpadRight]).catch(() => {});
    observed.screenshots = [before, after];
    if (await readFile(before).catch(() => null) && await readFile(after).catch(() => null)) {
      const first = decodePng(await readFile(before));
      const second = decodePng(await readFile(after));
      observed.samples = [imageStats(second, first)];
    }

    const inFrame = await frame.evaluate(() => {
      const runtime = window.EJS_emulator;
      const pads = runtime && runtime.gamepad && Array.isArray(runtime.gamepad.gamepads) ? runtime.gamepad.gamepads : null;
      return {
        runtimeStarted: Boolean(runtime && runtime.started),
        selection: runtime && Array.isArray(runtime.gamepadSelection) ? [...runtime.gamepadSelection] : null,
        pads: pads ? pads.filter(Boolean).map(pad => `${pad.id}_${pad.index}`) : null,
        inputs: window.__qaInputs || [],
        events: window.__qaPadEvents || [],
        padId: window.__qaPad ? window.__qaPad.id : null,
        padExposed: window.__qaPad ? window.__qaPad.exposed : null,
      };
    });
    observed.selection = inFrame.selection || [];
    observed.padIdentifiers = inFrame.pads || [];
    observed.padEvents = inFrame.events || [];
    observed.inputs = (inFrame.inputs || []).slice(0, 12);
    observed.padId = inFrame.padId;
    observed.checks.runtimeStarted = inFrame.runtimeStarted;
    observed.checks.padSeenByRuntime = Boolean(inFrame.pads && inFrame.pads.length);
    observed.checks.playerOneSlotFilled = Boolean(inFrame.selection && inFrame.selection[0]);
    observed.checks.startReachedGame = (inFrame.inputs || []).some(entry => entry[0] === 0 && entry[1] === PAD_CONTROLS.start);
    observed.checks.dpadReachedGame = (inFrame.inputs || []).some(entry => entry[0] === 0 && entry[1] === PAD_CONTROLS.dpadRight);
    await page.waitForTimeout(300);
    observed.checks.hintHiddenAfterPad = await page.locator('#player-pad-hint').count() === 0;
  } catch (error) {
    observed.error = String(error.message || error).slice(0, 400);
  }
  await page.close();
  return observed;
}

/* ---------------------------------------------------------------- the artwork */

/**
 * Captures one in-game screenshot per hosted listing for dist/assets/emu-<id>.png. The shot is
 * the emulator's own canvas after a few seconds of the game running, so every listing's art is
 * genuinely from the ROM gameflex ships.
 */
async function captureArtwork(browserInstance, targets) {
  await mkdir(ARTIFACTS, { recursive: true });
  await mkdir(ART_DIR, { recursive: true });
  const written = [];
  for (const target of targets) {
    const context = await browserInstance.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true, deviceScaleFactor: 1 });
    await context.addInitScript(() => { window.__GAMEFLEX_PLAYER_TIMEOUT_MS = 120000; });
    const page = await context.newPage();
    try {
      await page.goto(`${ORIGIN}/#play/${target.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#player:not([hidden])', { timeout: 15000 });
      await page.click('#player-stage [data-player-action="start"]');
      const timeout = SLOW_SYSTEMS.includes(target.system) ? START_TIMEOUT_SLOW_MS : START_TIMEOUT_MS;
      await page.waitForFunction(() => document.getElementById('player-stage')?.dataset.state === 'loaded', null, { timeout }).catch(() => {});
      const state = await page.evaluate(() => document.getElementById('player-stage')?.dataset.state || 'unknown');
      if (state !== 'loaded') { console.log(`artwork: ${target.id} did not start (${state})`); continue; }
      await page.waitForTimeout(6000);
      const canvas = page.frameLocator('#player iframe.player-frame').locator('#game canvas').first();
      const preview = path.join(ART_DIR, `${target.id}.png`);
      await canvas.screenshot({ path: preview });
      const file = path.join(ROOT, 'dist', 'assets', `emu-${target.id}.png`);
      await writeFile(file, await readFile(preview));
      written.push({ id: target.id, file: `dist/assets/emu-${target.id}.png`, preview, bytes: (await readFile(preview)).length });
      console.log(`artwork: dist/assets/emu-${target.id}.png written`);
    } catch (error) {
      console.log(`artwork: ${target.id} failed — ${error.message}`);
    }
    await context.close();
  }
  return written;
}

/* ----------------------------------------------------------------------- main */

const started = new Date();
const certificate = await ensureCertificate();
const server = await startServer(certificate);
ORIGIN = `https://${ORIGIN_HOST}:${server.port}`;
// This process cannot resolve the test hostname (only the browsers get the mapping), so
// server-side reads go to loopback. serve.mjs does not care which Host header arrives.
SERVER = `https://127.0.0.1:${server.port}`;

const config = await httpJson(`${SERVER}/player-config.json`).catch(async () => JSON.parse(await readFile(path.join(ROOT, 'dist/player-config.json'), 'utf8')));
const catalogue = await httpJson(`${SERVER}/games.json`).catch(async () => JSON.parse(await readFile(path.join(ROOT, 'dist/games.json'), 'utf8')));
const titles = new Map(catalogue.map(game => [game.id, game.title]));
const shipped = new Set(Object.keys(JSON.parse(await readFile(path.join(ROOT, 'dist/player-config.json'), 'utf8')).games));

const targets = Object.entries(config.games)
  .filter(([, entry]) => entry.mode === 'emulator')
  .map(([id, entry]) => ({ id, title: titles.get(id) || entry.title || id, system: entry.system, core: entry.core, shelf: shipped.has(id) ? 'hosted' : 'test-shelf', sha256: entry.sha256 }))
  .filter(target => !only.length || only.includes(target.id))
  .filter(target => !shelfFilter || target.shelf === shelfFilter)
  .sort((a, b) => (a.shelf === b.shelf ? a.id.localeCompare(b.id) : a.shelf === 'hosted' ? -1 : 1));

/** The pad scenarios cover the hosted listings of the three phase-1 systems the owner named. */
const padTargets = targets.filter(target => target.shelf === 'hosted' && PAD_SYSTEMS.includes(target.system));

await mkdir(SHOT_DIR, { recursive: true });

const availability = [];
const results = [];
const negatives = [];
const pads = [];
let artwork = [];
let audited = [];
const browsersToRun = browsers.filter(browser => !browserFilter.length || browserFilter.includes(browser.name));

for (const browser of browsersToRun) {
  let instance = null;
  try {
    instance = await launch(browser);
    const version = instance.version();
    availability.push({ browser: browser.name, channel: browser.channel || 'firefox', available: true, version });
    console.log(`${browser.name} ${version} — ${targets.length} ROMs${padsOnly ? ' (pad scenarios only)' : ''}`);
    if (ARTWORK_ONLY) {
      artwork = await captureArtwork(instance, targets.filter(target => target.shelf === 'hosted'));
      break;
    }
    if (CORE_AUDIT_ONLY) {
      audited = await coreAudit(instance);
      break;
    }
    if (!padsOnly) {
      // One context per browser, reused across ROMs: the emulator's own core cache lives in
      // IndexedDB, so a second ROM on the same system does not download the core again.
      const context = await instance.newContext({ viewport: { width: 1024, height: 768 }, ignoreHTTPSErrors: true, deviceScaleFactor: 1 });
      // The player's own 20 s timeout would tear a slow first boot down before it starts.
      await context.addInitScript(() => { window.__GAMEFLEX_PLAYER_TIMEOUT_MS = 120000; });
      // Records violations from the emulator frame's own CSP, which is what we are checking.
      await context.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', event => {
          window.__cspViolations.push({ directive: event.violatedDirective, blocked: event.blockedURI, source: event.sourceFile || '' });
        });
      });
      for (const target of targets) {
        const observed = await playOne(context, { ...target, browser: browser.name });
        observed.browser = browser.name;
        observed.browserVersion = version;
        results.push(observed);
        const flags = failedChecks(observed);
        console.log(`  ${observed.started ? 'started' : observed.state}  ${target.shelf}  ${target.id}  ${flags.length ? `FAILED: ${flags.join(', ')}` : 'all checks passed'}`);
      }
      if (!skipNegative) for (const mutate of [
        { id: 'qa-bad-sha', expect: 'failed', entry: { mode: 'emulator', system: 'nes', core: 'fceumm', rom: 'emulator/roms/nes/super-tilt-bro.nes', sha256: 'a'.repeat(64), licence: 'QA fixture', title: 'QA bad hash' } },
        { id: 'qa-missing-core', expect: 'failed', entry: { mode: 'emulator', system: 'nes', core: 'nestopia', rom: 'emulator/roms/nes/super-tilt-bro.nes', sha256: config.games['super-tilt-bro']?.sha256, licence: 'QA fixture', title: 'QA missing core' } },
      ]) {
        const negative = await playNegative(instance, mutate.id, mutate);
        negative.browser = browser.name;
        negatives.push(negative);
        console.log(`  negative ${negative.case}: ${negative.state} (expected ${mutate.expect}) ${negative.pass ? 'ok' : 'FAILED'}`);
      }
      if (!skipNegative) {
        const unknown = await playNegative(instance, 'unknown-id', { id: 'qa-not-in-the-catalogue', expect: 'blocked' });
        unknown.browser = browser.name;
        negatives.push(unknown);
        console.log(`  negative unknown-id: ${unknown.state} (expected blocked) ${unknown.pass ? 'ok' : 'FAILED'}`);
      }
      await context.close();
    }
    if (!skipPads) {
      // Each scenario gets its own context, because the pad's state at document load is what
      // tells the two apart and an init script is fixed per context.
      for (const scenario of PAD_SCENARIOS) {
        const padContext = await instance.newContext({ viewport: { width: 1024, height: 768 }, ignoreHTTPSErrors: true, deviceScaleFactor: 1 });
        await padContext.addInitScript(() => { window.__GAMEFLEX_PLAYER_TIMEOUT_MS = 120000; });
        await padContext.addInitScript(PAD_SCRIPT, scenario);
        for (const target of padTargets) {
          const observed = await playPadOne(padContext, { ...target, browser: browser.name }, scenario);
          observed.browser = browser.name;
          observed.browserVersion = version;
          pads.push(observed);
          const flags = failedChecks(observed);
          console.log(`  pad ${scenario}  ${target.id}  ${observed.started ? 'started' : observed.state}  ${flags.length ? `FAILED: ${flags.join(', ')}` : 'all checks passed'}`);
        }
        await padContext.close();
      }
    }
  } catch (error) {
    availability.push({ browser: browser.name, channel: browser.channel || 'firefox', available: false, error: String(error.message || error).slice(0, 300) });
    console.log(`${browser.name} unavailable: ${error.message}`);
  } finally {
    if (instance) await instance.close();
  }
}

server.child.kill();

/**
 * --merge folds this run into artifacts/emulator-qa/run-report.json instead of replacing it, so a
 * long matrix can be run in chunks (per browser, or per group of ROMs) and still produce one
 * verification document. A re-run of the same browser+ROM replaces the earlier result.
 */
let merged = { origin: ORIGIN, availability, results, negatives, pads, artwork, coreAudit: audited };
if (argv.includes('--merge')) {
  const previous = JSON.parse(await readFile(path.join(ARTIFACTS, 'run-report.json'), 'utf8').catch(() => 'null'));
  if (previous) {
    const key = item => `${item.browser}|${item.id || item.case}`;
    const padKey = item => `${item.browser}|${item.id}|${item.scenario}`;
    const byKey = (list, incoming, keyOf = key) => [...new Map([...list, ...incoming].map(item => [keyOf(item), item])).values()];
    merged = {
      origin: ORIGIN,
      availability: [...new Map([...previous.availability, ...availability].map(item => [item.browser, item])).values()],
      results: byKey(previous.results, results),
      negatives: byKey(previous.negatives, negatives),
      pads: byKey(previous.pads || [], pads, padKey),
      artwork: [...previous.artwork, ...artwork],
      coreAudit: audited.length ? audited : previous.coreAudit || [],
    };
  }
}
await writeFile(path.join(ARTIFACTS, 'run-report.json'), JSON.stringify(merged, null, 2));

/* --------------------------------------------------- verification documents */

const { availability: browsersSeen, results: allResults, negatives: allNegatives, pads: allPads = [] } = merged;
const failures = allResults.filter(result => failedChecks(result).length > 0);
const negativeFailures = allNegatives.filter(negative => negative.pass !== true);
const padFailures = allPads.filter(entry => failedChecks(entry).length > 0);
const passed = allResults.length - failures.length;
const seen = new Map();
for (const result of allResults) if (!seen.has(result.id)) seen.set(result.id, result);
const summary = {
  generated: started.toISOString(),
  origin: ORIGIN,
  emulatorjs: JSON.parse(await readFile(path.join(ROOT, 'emulator/emulatorjs-lock.json'), 'utf8')).version,
  playwright: JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).devDependencies.playwright,
  node: process.version,
  browsers: browsersSeen,
  counts: {
    roms: seen.size,
    hosted: [...seen.values()].filter(result => result.shelf === 'hosted').length,
    testShelf: [...seen.values()].filter(result => result.shelf === 'test-shelf').length,
    runs: allResults.length,
    passed,
    failed: failures.length,
    negativeCases: allNegatives.length,
    negativeFailures: negativeFailures.length,
    gamepadRuns: allPads.length,
    gamepadPassed: allPads.length - padFailures.length,
    gamepadFailed: padFailures.length,
  },
  roms: [...seen.values()].map(result => ({ id: result.id, title: result.title, system: result.system, core: result.core, shelf: result.shelf })),
  results: allResults,
  negatives: allNegatives,
  gamepad: allPads,
  artwork: merged.artwork,
  coreAudit: merged.coreAudit || [],
  limits: [
    'A `started` result is EmulatorJS\'s own game-start event: the emulator booted the file. It is not gameplay verification and nobody has played these ROMs by hand in this run.',
    'Input is injected and recorded (screenshot pairs in artifacts/emulator-qa/screenshots/), never asserted to change the game.',
    'The run is served over HTTPS on a mapped test hostname with a self-signed certificate. Only desktop Chrome, Edge and Firefox are covered; mobile, Safari, real hosting and a CDN are not.',
    'Cores without a test ROM available (32X, PS1, N64, NDS, PC Engine, Atari 2600, Atari 7800, Arcade) are vendored but unexercised by this matrix unless a matching test-roms file is present.',
    'No BIOS file is vendored and the host page never sets EJS_biosUrl, so a core that needs firmware would fail here; no such failure was observed for the cores that were exercised.',
    'The gamepad runs use a simulated standard-mapping pad injected into the page, so they prove gameflex\'s own wiring (player focus, host page, vendored runtime). They do not prove that a real browser exposes a real pad to the frame: only a physical device can do that, and it is the owner\'s step in docs/emulator-test-checklist.md.',
  ],
};
await writeFile(path.join(ROOT, 'docs/emulator-verification.json'), `${JSON.stringify(summary, null, 2)}\n`);

const row = result => {
  const failed = failedChecks(result);
  return `| ${result.shelf} | \`${result.id}\` | ${result.system} / ${result.core} | ${result.browser} | ${result.started ? 'started' : (result.state || 'no state')} | ${result.samples[0]?.distinctColours ?? '—'} | ${result.samples[0]?.comparedToLater ? Math.max(...result.samples[0].comparedToLater) : '—'} | ${failed.length ? `**${failed.join(', ')}**` : 'pass'} |`;
};

const markdown = `# Emulator verification — ${started.toISOString().slice(0, 10)}

Generated by \`npm run test:emulator\` (\`scripts/emulator-qa.mjs\`). Machine-readable results:
\`docs/emulator-verification.json\`; screenshots: \`artifacts/emulator-qa/screenshots/\` (git-ignored).

## Versions

| Component | Version |
|---|---|
| EmulatorJS | ${summary.emulatorjs} (pinned in \`emulator/emulatorjs-lock.json\`) |
| Playwright | ${summary.playwright} |
| Node | ${summary.node} |
| Served from | ${ORIGIN} (mapped to loopback, self-signed certificate) |

Browsers: ${browsersSeen.map(entry => entry.available ? `${entry.browser} ${entry.version}` : `${entry.browser} **unavailable** (${entry.error})`).join(', ')}.

## Runs

${summary.counts.runs} runs over ${summary.counts.roms} ROMs (${summary.counts.hosted} hosted, ${summary.counts.testShelf} from the local test shelf):
${summary.counts.passed} passed, ${summary.counts.failed} failed. Negative cases: ${summary.counts.negativeCases - summary.counts.negativeFailures}/${summary.counts.negativeCases} behaved as expected.

| Shelf | ROM | System / core | Browser | Boot | Canvas colours | Frame change 2 s apart | Checks |
|---|---|---|---|---|---|---|---|
${allResults.map(row).join('\n')}

## Vendored cores

Each \`-wasm.data\` was decompressed with the runtime's own 7z worker and its \`core.json\` and ASCII
strings read (${(summary.coreAudit || []).length} cores). Extensions are what the core itself declares; they are the map
\`scripts/check-catalog.mjs\` validates a ROM against.

| Core | Systems | Extensions declared by the core | Save | Firmware/BIOS strings found |
|---|---|---|---|---|
${(summary.coreAudit || []).map(entry => `| \`${entry.core}\` | ${(entry.systems || []).join(', ')} | ${entry.error ? 'error: ' + entry.error : (entry.coreJson?.extensions || []).join(', ')} | ${entry.coreJson?.save === false ? 'none' : (entry.coreJson?.save || '—')} | ${entry.error ? '—' : (entry.firmwareStrings || []).slice(0, 3).join(' · ') || 'none'} |`).join('\n')}
None of these strings makes a BIOS file mandatory: the host page never sets \`EJS_biosUrl\`, so the
runtime never requests one, and the shipped DS cartridge and every ROM in the matrix booted without
one. What the per-core strings do show is where firmware *would* be used — see
\`docs/emulator.md\` for the PS1 and DS reasoning.

## Negative cases

| Case | Browser | Expected | Observed | Pass |
|---|---|---|---|---|
${allNegatives.map(negative => `| \`${negative.case}\` | ${negative.browser} | ${negative.case === 'unknown-id' ? 'blocked panel' : 'failed panel'} | ${negative.state}${negative.message ? ` — ${negative.message.slice(0, 80)}` : ''} | ${negative.pass ? 'yes' : '**no**'} |`).join('\n')}

## Gamepad pipeline (simulated)

${summary.counts.gamepadRuns} runs (${summary.counts.gamepadPassed} passed, ${summary.counts.gamepadFailed} failed) over the hosted ${PAD_SYSTEMS.join(', ').toUpperCase()} listings
${allPads.length ? `in ${[...new Set(allPads.map(entry => entry.browser))].join(', ')}` : ''}, with a **simulated** standard-mapping pad: the harness overrides
\`navigator.getGamepads()\` inside the page and presses button 9 (START) and button 15 (DPAD_RIGHT).
Two scenarios per ROM per browser:

- **load** — the pad is already visible to the frame's document when the runtime builds its own
  gamepad handler.
- **late** — the frame's document sees no pad until the game has started; the harness connects one
  then, so the runtime meets a pad that arrives while it is listening.

This is our own wiring, end to end: focus, host page, vendored runtime. **It is not device
exposure.** A real pad reaches a document only when the browser exposes it after a button press
while that document has focus, and only a physical controller can test that. See the manual
Gamepad row in \`docs/emulator-test-checklist.md\`.

| ROM | System / core | Browser | Scenario | Boot | Focus on frame while loading | Hint shown on start | Pad seen by runtime | P1 slot filled | START → control 3 | D-pad → control 7 | Hint hidden after pad | Checks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${allPads.map(entry => `| \`${entry.id}\` | ${entry.system} / ${entry.core} | ${entry.browser} | ${entry.scenario} | ${entry.started ? 'started' : (entry.state || 'no state')} | ${entry.checks.frameFocusedWhileLoading ? 'yes' : 'no'} | ${entry.checks.hintShownOnStart ? 'yes' : 'no'} | ${entry.checks.padSeenByRuntime ? 'yes' : 'no'} | ${entry.checks.playerOneSlotFilled ? 'yes' : 'no'} | ${entry.checks.startReachedGame ? 'yes' : 'no'} | ${entry.checks.dpadReachedGame ? 'yes' : 'no'} | ${entry.checks.hintHiddenAfterPad ? 'yes' : 'no'} | ${failedChecks(entry).length ? `**${failedChecks(entry).join(', ')}**` : 'pass'} |`).join('\n')}
${allPads.some(entry => entry.inputs && entry.inputs.length) ? `
What the runtime's own input call saw (player, control, value), first entries per run:

${allPads.filter(entry => entry.inputs?.length).map(entry => `- \`${entry.id}\` ${entry.browser} ${entry.scenario}: ${JSON.stringify(entry.inputs.slice(0, 6))}`).join('\n')}
` : ''}

## What these numbers mean

- **Boot** is the player's \`loaded\` state, set by the \`{type:'gameflex-emulator', state:'started'}\` message from
  \`dist/emulator/play.html\`. That message comes from EmulatorJS's own game-start event, so it means the emulator
  booted the file. It is not gameplay verification.
- **Canvas colours** is the number of distinct colours in the first sample of the frame the visitor sees. 1 is a
  single flat colour: a solid screen, a black transition, or a blank surface.
- **Frame change 2 s apart** is the largest share of pixels that differ across three samples taken two seconds
  apart. 0 means the picture did not change in four seconds; it is not a frame-rate claim.
- **canvasRenders** passes when a sample has content or the two samples differ, so a black frame between two
  rendered frames is not counted as a failure; a frozen flat surface still is.
- **Checks** is every assertion for that run: the frame is present with \`allow-scripts allow-same-origin
  allow-pointer-lock\` and its src names the catalogue id, a canvas exists, it renders and is still changing, the
  host page reported no CSP violation, no request left for another origin, and exit removed the frame. Boot
  itself is the player's loaded state, which only the emulator frame's own \`started\` message can set.

## Limits

${summary.limits.map(limit => `- ${limit}`).join('\n')}
`;
await writeFile(path.join(ROOT, 'docs/emulator-verification.md'), markdown);

console.log(`\n${summary.counts.passed}/${summary.counts.runs} runs passed, ${summary.counts.negativeFailures} negative failures`);
if (allPads.length) console.log(`gamepad pipeline (simulated): ${summary.counts.gamepadPassed}/${summary.counts.gamepadRuns} runs passed, ${summary.counts.gamepadFailed} failed`);
console.log('docs/emulator-verification.json + docs/emulator-verification.md written');
if (failures.length) console.log(`failures: ${failures.map(result => `${result.browser}/${result.id}`).join(', ')}`);
if (padFailures.length) console.log(`gamepad failures: ${padFailures.map(entry => `${entry.browser}/${entry.id}/${entry.scenario} (${failedChecks(entry).join(', ')})`).join(', ')}`);
process.exit(failures.length || negativeFailures.length || padFailures.length ? 1 : 0);
