// End-to-end smoke test against a real Docker engine and a real game page.
//   GF_RB_KEY=... node scripts/e2e-smoke.mjs quake
// It creates a session, records frames, sends input, deletes the session and
// reports measured timings. It makes no claim about gameplay.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { WebSocket } from 'ws';

import { createGateway } from '../src/gateway.mjs';

const gameId = process.argv[2] || 'quake';
const KEY = process.env.GF_RB_KEY || 'e2e-key';
const ORIGIN = process.env.GF_RB_ORIGINS || 'http://127.0.0.1:5500';
const OUT_DIR = path.resolve('artifacts/remote');
const FRAME_DIR = path.join(OUT_DIR, 'frames');
fs.mkdirSync(FRAME_DIR, { recursive: true });

const report = { gameId, at: new Date().toISOString(), steps: [], timings: {}, frames: {}, input: {}, cleanup: {} };
const step = (name, detail) => { report.steps.push({ name, detail, at: Date.now() }); console.log(`[step] ${name} ${detail ? JSON.stringify(detail) : ''}`); };

const gateway = createGateway({
  config: {
    port: Number(process.env.GF_RB_PORT || 0),
    gatewayKey: KEY,
    allowedOrigins: [ORIGIN],
    sessionTtlMs: 120_000,
    idleTimeoutMs: 45_000,
    maxSessions: 2,
  },
  log: (line) => console.log(`[gateway] ${line}`),
});

const t0 = Date.now();
const addr = await gateway.start();
report.timings.gatewayListenMs = Date.now() - t0;

const watch = setInterval(() => gateway.reap().catch(() => {}), 2_000);

let body;
try {
  const created = await fetch(`http://127.0.0.1:${addr.port}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-gameflex-key': KEY },
    body: JSON.stringify({ gameId }),
  });
  body = await created.json();
  report.status = created.status;
  if (created.status !== 201) {
    report.error = body;
    step('session_failed', body);
    await finish(1);
  }
  report.timings.sessionCreateMs = Date.now() - t0;
  step('session_created', { id: body.id, expiresAt: body.expiresAt, game: body.game });
} catch (err) {
  report.error = String(err && err.message);
  step('session_error', report.error);
  await finish(1);
}

const frames = [];
const statuses = [];
const stats = [];
const ws = new WebSocket(body.wsUrl, { headers: { origin: ORIGIN } });
const wsOpenAt = Date.now();
const firstFrame = new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 30_000);
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString('utf8'));
    if (msg.type === 'frame') {
      if (frames.length === 0) { report.timings.firstFrameMs = Date.now() - t0; }
      frames.push(msg);
      if (frames.length === 1) {
        fs.writeFileSync(path.join(FRAME_DIR, `${gameId}-frame-1.jpg`), Buffer.from(msg.data, 'base64'));
        clearTimeout(timer);
        resolve(msg);
      }
    } else if (msg.type === 'status') statuses.push(msg);
    else if (msg.type === 'stats') stats.push(msg);
    else if (msg.type === 'error') statuses.push(msg);
  });
  ws.on('open', () => step('ws_open', { ms: Date.now() - wsOpenAt }));
  ws.on('error', (err) => step('ws_error', String(err && err.message)));
});

await new Promise((resolve) => {
  const timer = setTimeout(resolve, 45_000);
  const poll = setInterval(() => {
    if (frames.length >= 8) { clearInterval(poll); clearTimeout(timer); resolve(); }
  }, 250);
});

if (frames.length > 1) {
  fs.writeFileSync(path.join(FRAME_DIR, `${gameId}-frame-last.jpg`), Buffer.from(frames.at(-1).data, 'base64'));
}
report.frames = {
  count: frames.length,
  firstFrameSize: frames[0] ? frames[0].data.length : 0,
  lastFrameSize: frames.at(-1) ? frames.at(-1).data.length : 0,
  width: frames[0]?.width ?? null,
  height: frames[0]?.height ?? null,
  windowMs: frames.length > 1 ? frames.at(-1).ts - frames[0].ts : null,
};
report.frames.observedFps = frames.length > 1 && report.frames.windowMs
  ? Math.round(((frames.length - 1) / (report.frames.windowMs / 1000)) * 10) / 10
  : null;
step('frames_collected', report.frames);

const inputs = [
  { kind: 'mouse', eventType: 'mouseMoved', x: 480, y: 270 },
  { kind: 'mouse', eventType: 'mousePressed', x: 480, y: 270, button: 'left' },
  { kind: 'mouse', eventType: 'mouseReleased', x: 480, y: 270, button: 'left' },
  { kind: 'key', eventType: 'keyDown', key: 'w', code: 'KeyW' },
  { kind: 'key', eventType: 'keyUp', key: 'w', code: 'KeyW' },
  { kind: 'wheel', x: 480, y: 270, deltaX: 0, deltaY: -120 },
];
const errorsBefore = statuses.filter((s) => s.type === 'error').length;
for (const event of inputs) ws.send(JSON.stringify({ type: 'input', event }));
await new Promise((r) => setTimeout(r, 1_500));
const errorsAfter = statuses.filter((s) => s.type === 'error').length;
report.input = { sent: inputs.length, rejected: errorsAfter - errorsBefore };
step('input_sent', report.input);

report.statuses = statuses.slice(0, 10);
report.stats = stats.slice(-3);

ws.close();
step('ws_closed');

const deleted = await fetch(`http://127.0.0.1:${addr.port}/api/sessions/${body.id}`, {
  method: 'DELETE',
  headers: { authorization: `Bearer ${body.token}`, origin: ORIGIN },
});
report.cleanup = { deleteStatus: deleted.status };
await new Promise((r) => setTimeout(r, 1_000));
report.cleanup.containersAfter = execFileSync('docker', ['ps', '-a', '--filter', 'label=gameflex.remote-browser=1', '--format', '{{.Names}}'], { encoding: 'utf8' }).trim();
report.cleanup.sessionsInStore = gateway.store.size;
step('session_deleted', report.cleanup);

await finish(report.error ? 1 : 0);

async function finish(code) {
  clearInterval(watch);
  fs.writeFileSync(path.join(OUT_DIR, `smoke-${gameId}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verdict: report.error ? 'FAILED' : 'COMPLETED', timings: report.timings, frames: report.frames, cleanup: report.cleanup }, null, 2));
  try { await gateway.stop(); } catch { /* noop */ }
  process.exit(code);
}
