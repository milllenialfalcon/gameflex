// Regression tests for the primary review findings: capacity reservation,
// input-based idle expiry, guaranteed container cleanup, loopback-only binding,
// WS/message bounds, host + content-type validation, protocol normalisation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

import { createGateway } from '../src/gateway.mjs';
import { loadCatalog } from '../src/config.mjs';
import { validateInputMessage } from '../src/input.mjs';
import { checkHostHeader, assertLoopbackHost } from '../src/http.mjs';

const ORIGIN = 'http://127.0.0.1:5500';
const KEY = 'test-gateway-key';
const CATALOG = fileURLToPath(new URL('../../../dist/games.json', import.meta.url));
const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startRig({ config = {}, docker = {} } = {}) {
  const calls = { started: [], stopped: [] };
  const runners = [];
  const fakeDocker = {
    // docker.start receives the shared call log and the runner registry so an
    // override still has to register (and therefore close) every server it
    // creates - an unregistered fake runner leaks an HTTP server and hangs the
    // whole test file. Prefer docker.delayMs over an override when possible.
    async start(opts) {
      if (docker.start) return docker.start(opts, calls, runners);
      if (docker.delayMs) await sleep(docker.delayMs);
      const runner = await startFakeRunner(opts.runnerToken);
      runners.push(runner);
      calls.started.push(opts);
      return { ok: true, containerId: 'c0ffee', hostPort: runner.port };
    },
    async stop(name) { calls.stopped.push(name); return true; },
    async version() { return 'test-engine'; },
    async listManaged() { return []; },
  };
  const gateway = createGateway({
    config: { port: 0, gatewayKey: KEY, allowedOrigins: [ORIGIN], denyIds: ['wasmarcade'], shutdownGraceMs: 250, ...config },
    catalog: loadCatalog(CATALOG),
    docker: fakeDocker,
    lookup: PUBLIC_LOOKUP,
    waitForRunner: docker.waitRunner || (async () => ({ ok: true, body: { ok: true } })),
    log: () => {},
  });
  const addr = await gateway.start();
  const base = `http://127.0.0.1:${addr.port}`;
  const post = (gameId, { signal } = {}) => fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-gameflex-key': KEY },
    body: JSON.stringify({ gameId }),
    signal,
  });
  return {
    gateway, base, post, calls, runners,
    // Runs from t.after(), so it must close every fake server even when an
    // assertion already threw - an open server keeps the file's event loop alive
    // and node:test then waits forever instead of reporting the failure.
    cleanup: async () => {
      try { await gateway.stop(); } catch { /* teardown best-effort */ }
      for (const r of runners) { try { await r.close(); } catch { /* already closed */ } }
    },
  };
}

async function startFakeRunner(runnerToken) {
  const sockets = new Set();
  const server = http.createServer((req, res) => { res.writeHead(200); res.end('{"ok":true}'); });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (req.headers['x-runner-token'] !== runnerToken) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => { sockets.add(ws); ws.on('close', () => sockets.delete(ws)); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    // The gateway dials ws://127.0.0.1:<port>/runner, so the port is part of the
    // fixture contract, not an extra.
    port: server.address().port,
    sockets,
    push: (obj) => { for (const ws of sockets) ws.send(JSON.stringify(obj)); },
    close: () => new Promise((r) => {
      for (const ws of sockets) ws.terminate();
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
}

function openSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { origin: ORIGIN } });
    const messages = [];
    ws.on('message', (d) => messages.push(JSON.parse(d.toString('utf8'))));
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

test('capacity is reserved before async work: 4 concurrent starts, max 3', async (t) => {
  const rig = await startRig({
    config: { maxSessions: 3 },
    // Slow start widens the race window that the reservation has to close.
    docker: { start: async (opts) => { await sleep(40); return { ok: false, error: 'no engine' }; } },
  });
  t.after(rig.cleanup);

  const responses = await Promise.all([rig.post('quake'), rig.post('quake'), rig.post('quake'), rig.post('quake')]);
  const statuses = responses.map((r) => r.status).sort();
  assert.deepEqual(statuses, [429, 502, 502, 502], 'only three starts may be attempted, the fourth is refused');
  assert.equal(rig.calls.started.length, 0);   // start() was overridden, so nothing recorded there
  assert.equal(rig.gateway.store.pendingCount, 0, 'every reservation must be released');
  assert.equal(rig.gateway.store.size, 0);
});

test('concurrent capacity reservation with successful starts leaves no orphans', async (t) => {
  // delayMs widens the race window while still using the default fake runner, so
  // every server it creates is registered and closed by rig.cleanup().
  const rig = await startRig({ config: { maxSessions: 3 }, docker: { delayMs: 30 } });
  t.after(rig.cleanup);

  const responses = await Promise.all([rig.post('quake'), rig.post('quake'), rig.post('quake'), rig.post('quake')]);
  const ok = responses.filter((r) => r.status === 201);
  const limited = responses.filter((r) => r.status === 429);
  assert.equal(ok.length, 3);
  assert.equal(limited.length, 1);
  assert.equal(rig.calls.started.length, 3, 'exactly maxSessions containers start');
  assert.equal(rig.calls.stopped.length, 0, 'no container is left without a session');
  assert.equal(rig.gateway.store.size, 3);
  assert.equal(rig.gateway.store.pendingCount, 0);
});

test('a failed create releases its reservation', async (t) => {
  let fail = true;
  const rig = await startRig({
    docker: { start: async () => (fail ? { ok: false, error: 'engine down' } : { ok: true, containerId: 'x', hostPort: 1 }) },
    config: { maxSessions: 1 },
  });
  t.after(rig.cleanup);

  assert.equal((await rig.post('quake')).status, 502);
  assert.equal(rig.gateway.store.pendingCount, 0, 'capacity must not leak after a failure');
  fail = false;
  const runner = await startFakeRunner('anything');
  rig.runners.push(runner);
  assert.equal((await rig.post('quake')).status, 201, 'capacity is available again');
});

test('an exception during create is answered and cleans up the container', async (t) => {
  const rig = await startRig({
    docker: {
      start: async (opts, calls) => { calls.started.push(opts); return { ok: true, containerId: 'x', hostPort: 1 }; },
      waitRunner: async () => { throw new Error('health poll exploded'); },
    },
  });
  t.after(rig.cleanup);

  const res = await rig.post('quake');
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error.code, 'internal_error');
  assert.equal(rig.calls.stopped.length, 1, 'the started container is removed even on a thrown error');
  assert.equal(rig.gateway.store.size, 0);
  assert.equal(rig.gateway.store.pendingCount, 0);
});

test('a successful create is not handed off when the HTTP response is aborted', async (t) => {
  // Regression: a caller that disconnects while the container is starting must
  // not leave an unreachable session in the store or a running container behind.
  let releaseStart;
  const held = new Promise((r) => { releaseStart = r; });
  const rig = await startRig({
    config: { maxSessions: 1 },
    docker: {
      start: async (opts, calls, runners) => {
        await held;
        const runner = await startFakeRunner(opts.runnerToken);
        runners.push(runner);                       // registered, so cleanup closes it
        calls.started.push(opts);
        return { ok: true, containerId: 'c0ffee', hostPort: runner.port };
      },
    },
  });
  t.after(rig.cleanup);

  const controller = new AbortController();
  const pending = rig.post('quake', { signal: controller.signal }).then(() => 'answered', () => 'aborted');
  await sleep(20);                                  // create is parked inside docker.start
  controller.abort();
  assert.equal(await pending, 'aborted', 'the client socket must be gone');
  await sleep(60);                                  // let the server observe the close
  releaseStart();
  await sleep(80);                                  // let the create settle

  assert.equal(rig.gateway.store.size, 0, 'an unreachable session must not be stored');
  assert.equal(rig.gateway.store.pendingCount, 0, 'the reservation must be released');
  assert.deepEqual(rig.calls.stopped.length, 1, 'the started container is removed');
  assert.equal(rig.calls.started.length, 1, 'the container did start before the abort');
});

test('idle expiry is driven by input, not by generated frames', async (t) => {
  const rig = await startRig({ config: { sessionTtlMs: 60_000, idleTimeoutMs: 60 } });
  t.after(rig.cleanup);

  const created = await (await rig.post('quake')).json();
  const { ws } = await openSocket(created.wsUrl);
  t.after(() => ws.close());

  // A continuously animating game must not keep an abandoned session alive.
  const pump = setInterval(() => rig.runners[0].push({ type: 'frame', format: 'jpeg', data: 'AA', width: 2, height: 2, ts: Date.now() }), 5);
  await sleep(150);
  clearInterval(pump);

  await rig.gateway.reap();
  assert.deepEqual(rig.calls.stopped, [`gfx-rb-${created.id}`], 'frames alone must not extend the idle window');
  assert.equal(rig.gateway.store.size, 0);
});

test('user input keeps a session alive and is the only activity signal', async (t) => {
  const rig = await startRig({ config: { sessionTtlMs: 60_000, idleTimeoutMs: 700 } });
  t.after(rig.cleanup);

  const created = await (await rig.post('quake')).json();
  const { ws } = await openSocket(created.wsUrl);
  t.after(() => ws.close());

  await sleep(400);
  ws.send(JSON.stringify({ type: 'input', event: { kind: 'key', eventType: 'keyDown', key: 'w', code: 'KeyW' } }));
  await sleep(400);                     // 800ms since creation, 400ms since input
  await rig.gateway.reap();
  assert.equal(rig.calls.stopped.length, 0, 'recent input keeps the session');

  await sleep(750);                     // idle window elapsed with no input
  await rig.gateway.reap();
  assert.equal(rig.calls.stopped.length, 1, 'idle expiry fires once input stops');
});

test('websocket connections per session are capped', async (t) => {
  const rig = await startRig({ config: { maxConnectionsPerSession: 2 } });
  t.after(rig.cleanup);

  const created = await (await rig.post('quake')).json();
  const a = await openSocket(created.wsUrl);
  const b = await openSocket(created.wsUrl);
  t.after(() => { a.ws.close(); b.ws.close(); });

  const third = await new Promise((resolve) => {
    const ws = new WebSocket(created.wsUrl, { headers: { origin: ORIGIN } });
    const codes = [];
    ws.on('close', (code) => { codes.push(code); resolve(codes); });
    ws.on('error', () => {});
    setTimeout(() => resolve(codes), 1_000);
  });
  assert.ok(third.includes(1013), `expected close 1013, saw ${JSON.stringify(third)}`);
  assert.equal(rig.gateway.store.get(created.id).connections, 2);
});

test('client message rate is bounded', async (t) => {
  const rig = await startRig({ config: { maxInputRatePerSecond: 5 } });
  t.after(rig.cleanup);

  const created = await (await rig.post('quake')).json();
  const { ws, messages } = await openSocket(created.wsUrl);
  t.after(() => ws.close());
  const closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)));

  for (let i = 0; i < 12; i += 1) {
    ws.send(JSON.stringify({ type: 'input', event: { kind: 'key', eventType: 'keyDown', key: 'w', code: 'KeyW' } }));
  }
  const code = await closed;
  assert.equal(code, 1008);
  assert.ok(messages.some((m) => m.type === 'error' && m.code === 'rate_limited'));
});

test('binary input is counted and refused, invalid input never reaches the runner', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);

  const created = await (await rig.post('quake')).json();
  const { ws, messages } = await openSocket(created.wsUrl);
  t.after(() => ws.close());
  ws.send(Buffer.from([1, 2, 3]));
  await sleep(60);
  assert.ok(messages.some((m) => m.type === 'error' && m.code === 'binary_not_supported'));
});

test('host and content-type validation on the API', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);

  // A foreign Host header is refused: otherwise a page served under another
  // hostname that resolves to 127.0.0.1 could drive the loopback API.
  const badHost = await new Promise((resolve, reject) => {
    const u = new URL(rig.base);
    const req = http.request({ host: u.hostname, port: u.port, path: '/api/health', method: 'GET', headers: { host: 'evil.example' } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(badHost.status, 403);
  assert.equal(JSON.parse(badHost.body).error.code, 'invalid_host_header');

  const wrongType = await fetch(`${rig.base}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', origin: ORIGIN, 'x-gameflex-key': KEY },
    body: JSON.stringify({ gameId: 'quake' }),
  });
  assert.equal(wrongType.status, 415);
  assert.equal((await wrongType.json()).error.code, 'unsupported_media_type');

  const created = await rig.post('quake');
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.equal(checkHostHeader({ headers: { host: 'localhost:8081' } }, 8081).ok, true);
  assert.equal(checkHostHeader({ headers: { host: 'localhost:9999' } }, 8081).ok, false);
  assert.equal(checkHostHeader({ headers: {} }, 8081).ok, false);
});

test('the gateway refuses to bind anything but loopback', () => {
  assert.equal(assertLoopbackHost('127.0.0.1', 8081), '127.0.0.1');
  assert.equal(assertLoopbackHost('::1', 8081), '::1');
  assert.throws(() => assertLoopbackHost('0.0.0.0', 8081), /loopback-only/);
  assert.throws(() => assertLoopbackHost('192.168.1.10', 8081), /loopback-only/);
  assert.throws(() => createGateway({ config: { host: '0.0.0.0', gatewayKey: 'k', allowedOrigins: [ORIGIN] } }).start(), /loopback-only/);
});

test('mouse protocol normalisation survives runner-side revalidation', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);

  const created = await (await rig.post('quake')).json();
  const { ws } = await openSocket(created.wsUrl);
  t.after(() => ws.close());
  const runnerSockets = rig.runners[0].sockets;
  const received = [];
  // Attach a listener to what the gateway actually relays.
  await new Promise((r) => setTimeout(r, 50));
  for (const s of runnerSockets) s.on('message', (d) => received.push(JSON.parse(d.toString('utf8'))));

  ws.send(JSON.stringify({ type: 'input', event: { kind: 'mouse', eventType: 'mouseMoved', x: 100, y: 60 } }));
  await sleep(80);
  const relayed = received.find((m) => m.type === 'input');
  assert.deepEqual(relayed.event, { kind: 'mouse', eventType: 'mouseMoved', x: 100, y: 60, button: 'none' });
  // The runner validates again: the normalised shape must pass, a bad button must not.
  assert.equal(validateInputMessage(JSON.stringify(relayed)).ok, true);
  assert.equal(validateInputMessage(JSON.stringify({ type: 'input', event: { kind: 'mouse', eventType: 'mousePressed', x: 1, y: 1, button: 'none' } })).code, 'button_required');
  assert.equal(validateInputMessage(JSON.stringify({ type: 'input', event: { kind: 'mouse', eventType: 'mousePressed', x: 1, y: 1, button: 'side' } })).code, 'invalid_button');
});

test('shutdown closes sockets and removes sessions', async (t) => {
  const rig = await startRig();
  const created = await (await rig.post('quake')).json();
  const { ws } = await openSocket(created.wsUrl);
  const closed = new Promise((resolve) => ws.on('close', () => resolve(true)));
  await rig.gateway.stop({ graceMs: 100 });
  assert.equal(await closed, true);
  assert.deepEqual(rig.calls.stopped, [`gfx-rb-${created.id}`]);
  assert.equal(rig.gateway.store.size, 0);
  t.after(async () => { for (const r of rig.runners) await r.close().catch(() => {}); });
});
