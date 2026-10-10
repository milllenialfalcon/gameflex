import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

import { createGateway } from '../src/gateway.mjs';
import { loadCatalog } from '../src/config.mjs';

const ORIGIN = 'http://127.0.0.1:5500';
const KEY = 'test-gateway-key';
const CATALOG_PATH = fileURLToPath(new URL('../../../dist/games.json', import.meta.url));
const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }];

// A stand-in for the containerised runner: same token header, same JSON frames.
async function startFakeRunner(runnerToken) {
  const received = [];
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' && req.headers['x-runner-token'] === runnerToken) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"ok":true,"phase":"ready"}');
    }
    res.writeHead(404);
    res.end('{}');
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/runner') || req.headers['x-runner-token'] !== runnerToken) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      ws.on('message', (d) => received.push(JSON.parse(d.toString('utf8'))));
      ws.on('close', () => sockets.delete(ws));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    received,
    sockets,
    push: (obj) => { for (const ws of sockets) ws.send(JSON.stringify(obj)); },
    close: () => new Promise((r) => { for (const ws of sockets) ws.terminate(); server.close(r); }),
  };
}

async function startRig({ config = {}, dockerOverrides = {}, lookup = PUBLIC_LOOKUP } = {}) {
  const logs = [];
  const calls = { started: [], stopped: [] };
  const runners = [];
  const docker = {
    async start(opts) {
      if (dockerOverrides.start) return dockerOverrides.start(opts);
      const runner = await startFakeRunner(opts.runnerToken);
      runners.push(runner);
      calls.started.push(opts);
      return { ok: true, containerId: 'deadbeef', hostPort: runner.port };
    },
    async stop(name) { calls.stopped.push(name); if (dockerOverrides.stop) return dockerOverrides.stop(name); return true; },
    async version() { return '29.8.0'; },
    async listManaged() { return []; },
  };
  const gateway = createGateway({
    config: {
      port: 0,
      gatewayKey: KEY,
      allowedOrigins: [ORIGIN],
      catalogPath: CATALOG_PATH,
      denyIds: ['wasmarcade'],
      dockerBin: 'docker',
      ...config,
    },
    catalog: loadCatalog(CATALOG_PATH),
    docker,
    lookup,
    waitForRunner: async (port, token) => {
      if (dockerOverrides.waitRunner) return dockerOverrides.waitRunner(port, token);
      return { ok: true, body: { ok: true } };
    },
    log: (line) => logs.push(line),
  });
  const addr = await gateway.start();
  const base = `http://127.0.0.1:${addr.port}`;
  const post = (gameId, { origin = ORIGIN, key = KEY, body = { gameId } } = {}) => fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'x-gameflex-key': key },
    body: JSON.stringify(body),
  });
  const cleanup = async () => {
    await gateway.stop();
    for (const r of runners) await r.close().catch(() => {});
  };
  return { gateway, base, post, calls, logs, runners, cleanup };
}

test('session creation requires the gateway access key', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);

  const noKey = await rig.post('quake', { key: '' });
  assert.equal(noKey.status, 401);
  assert.equal((await noKey.json()).error.code, 'missing_gateway_key');

  const wrongKey = await rig.post('quake', { key: 'nope' });
  assert.equal(wrongKey.status, 401);
  assert.equal((await wrongKey.json()).error.code, 'invalid_gateway_key');
  assert.equal(rig.calls.started.length, 0, 'no container may start without a valid key');
});

test('no wildcard CORS and no unlisted origin', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);

  const evil = await rig.post('quake', { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  const preflight = await fetch(`${rig.base}/api/sessions`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(preflight.status, 403);

  const okPreflight = await fetch(`${rig.base}/api/sessions`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
  assert.equal(okPreflight.status, 204);
  assert.equal(okPreflight.headers.get('access-control-allow-origin'), ORIGIN);

  const created = await rig.post('quake');
  assert.equal(created.headers.get('access-control-allow-origin'), ORIGIN);
  assert.notEqual(created.headers.get('access-control-allow-origin'), '*');
});

test('only catalogue ids resolve; denied ids and arbitrary urls do not', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);

  const unknown = await rig.post('not-a-game');
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, 'unknown_game');

  const traversal = await rig.post('../../etc/passwd');
  assert.equal(traversal.status, 400);
  assert.equal((await traversal.json()).error.code, 'invalid_game_id');

  const denied = await rig.post('wasmarcade');
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'game_denied');

  const urlInjection = await rig.post('quake', { body: { gameId: 'quake', url: 'https://evil.example' } });
  assert.equal(urlInjection.status, 201);
  assert.equal(rig.calls.started[0].url, 'https://q1.pieter.com/', 'the url must come from the catalogue');
  assert.equal(rig.calls.started[0].url.includes('evil.example'), false);
  await urlInjection.json();
});

test('a host that resolves into the local network is refused before any container starts', async (t) => {
  const rig = await startRig({ lookup: async () => [{ address: '10.0.0.5', family: 4 }] });
  t.after(rig.cleanup);

  const res = await rig.post('quake');
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'host_not_public');
  assert.equal(rig.calls.started.length, 0);
});

test('a successful create returns a bounded session and never leaks the runner token', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);

  const res = await rig.post('quake');
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.id, /^[a-f0-9]{16}$/);
  assert.equal(typeof body.token, 'string');
  assert.ok(body.token.length > 20);
  assert.match(body.wsUrl, new RegExp(`^ws://127\\.0\\.0\\.1:\\d+/ws/${body.id}\\?token=`));
  assert.equal(new Date(body.expiresAt).getTime() > Date.now(), true);
  assert.equal(body.game.id, 'quake');
  assert.equal(body.game.origin, 'https://q1.pieter.com');
  assert.equal(body.capabilities.audio, false);
  assert.equal(body.capabilities.relativeMouse, false);

  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes(rig.calls.started[0].runnerToken), false);
  // The runner token lives only in the container environment.
  assert.equal(rig.calls.started[0].name, `gfx-rb-${body.id}`);
  assert.equal(rig.calls.started[0].url, 'https://q1.pieter.com/');
});

test('capacity is enforced and over-limit creates are rejected', async (t) => {
  const rig = await startRig({ config: { maxSessions: 1 } });
  t.after(rig.cleanup);

  assert.equal((await rig.post('quake')).status, 201);
  const second = await rig.post('quake3');
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error.code, 'capacity');
  assert.equal(rig.calls.started.length, 1);
});

test('a runner that never becomes ready is torn down and reported', async (t) => {
  const rig = await startRig({ dockerOverrides: { waitRunner: async () => ({ ok: false, error: 'timeout' }) } });
  t.after(rig.cleanup);

  const res = await rig.post('quake');
  assert.equal(res.status, 504);
  assert.equal((await res.json()).error.code, 'runner_not_ready');
  assert.equal(rig.calls.stopped.length, 1, 'the half-started container must be removed');
  assert.equal(rig.gateway.store.size, 0);
});

test('docker start failure surfaces as a server error, not a session', async (t) => {
  const rig = await startRig({ dockerOverrides: { start: async () => ({ ok: false, error: 'no engine' }) } });
  t.after(rig.cleanup);

  const res = await rig.post('quake');
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.code, 'runner_start_failed');
  assert.equal(rig.gateway.store.size, 0);
});

test('DELETE requires the session token, then tears the container down', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);

  const created = await (await rig.post('quake')).json();
  const url = `${rig.base}/api/sessions/${created.id}`;

  assert.equal((await fetch(url, { method: 'DELETE', headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 401);
  assert.equal((await fetch(`${rig.base}/api/sessions/${'0'.repeat(16)}`, { method: 'DELETE', headers: { authorization: `Bearer ${created.token}` } })).status, 404);

  const ok = await fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${created.token}` } });
  assert.equal(ok.status, 204);
  assert.deepEqual(rig.calls.stopped, [`gfx-rb-${created.id}`]);
  assert.equal(rig.gateway.store.size, 0);
});

test('expired sessions are reaped and their containers removed', async (t) => {
  const rig = await startRig({ config: { sessionTtlMs: 20, idleTimeoutMs: 20, reapIntervalMs: 5 } });
  t.after(rig.cleanup);

  const created = await (await rig.post('quake')).json();
  await new Promise((r) => setTimeout(r, 40));
  await rig.gateway.reap();
  assert.deepEqual(rig.calls.stopped, [`gfx-rb-${created.id}`]);
  assert.equal(rig.gateway.store.size, 0);
  assert.equal(rig.gateway.store.authenticate(created.id, created.token).ok, false);
});

test('websocket handshake enforces origin, token and forwarding of frames/input', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);
  const created = await (await rig.post('quake')).json();

  const badOrigin = await new Promise((resolve) => {
    const ws = new WebSocket(created.wsUrl, { headers: { origin: 'https://evil.example' } });
    ws.on('error', (err) => resolve(`error:${err.message}`));
    ws.on('open', () => { ws.close(); resolve('opened'); });
  });
  assert.match(badOrigin, /^error:/, 'an unlisted origin must not open a socket');

  const badToken = await new Promise((resolve) => {
    const ws = new WebSocket(`${created.wsUrl.split('?')[0]}?token=wrong`, { headers: { origin: ORIGIN } });
    ws.on('error', (err) => resolve(`error:${err.message}`));
    ws.on('open', () => { ws.close(); resolve('opened'); });
  });
  assert.match(badToken, /^error:/, 'a wrong token must not open a socket');

  const ws = new WebSocket(created.wsUrl, { headers: { origin: ORIGIN } });
  const frames = [];
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    ws.on('message', (d) => frames.push(JSON.parse(d.toString('utf8'))));
  });
  t.after(() => ws.close());

  // accepted banner
  assert.equal(frames[0].type, 'accepted');
  assert.equal(frames[0].sessionId, created.id);
  assert.ok(frames[0].viewer.width > 0);

  // runner -> gateway -> client frame relay (wait for the gateway to attach first)
  const runner = rig.runners[0];
  await waitFor(() => runner.sockets.size > 0);
  runner.push({ type: 'frame', format: 'jpeg', data: 'AAAA', width: 4, height: 4, ts: 1 });
  await waitFor(() => frames.some((f) => f.type === 'frame'));
  const frame = frames.find((f) => f.type === 'frame');
  assert.equal(frame.data, 'AAAA');

  // client -> gateway -> runner input relay, with validation applied
  ws.send(JSON.stringify({ type: 'input', event: { kind: 'key', eventType: 'keyDown', key: 'w', code: 'KeyW' } }));
  await waitFor(() => runner.received.some((m) => m.type === 'input'));
  const relayed = runner.received.find((m) => m.type === 'input');
  assert.deepEqual(relayed.event, { kind: 'key', eventType: 'keyDown', key: 'w', code: 'KeyW' });

  ws.send(JSON.stringify({ type: 'input', event: { kind: 'key', eventType: 'keyDown', key: 'w', code: 'KeyW', extra: 1 } }));
  await waitFor(() => frames.some((f) => f.type === 'error'));
  assert.equal(frames.find((f) => f.type === 'error').code, 'unknown_event_field');
  assert.equal(runner.received.filter((m) => m.type === 'input').length, 1, 'invalid input is never relayed');

  // closing the client socket does not tear the session down
  ws.close();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(rig.gateway.store.get(created.id).connections, 0);
  assert.equal(rig.calls.stopped.length, 0);
});

test('tokens never appear in log lines', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);
  const created = await (await rig.post('quake')).json();
  const ws = new WebSocket(created.wsUrl, { headers: { origin: ORIGIN } });
  await new Promise((r) => ws.on('open', r));
  ws.close();
  await new Promise((r) => setTimeout(r, 30));

  const logs = rig.logs.join('\n');
  assert.equal(logs.includes(created.token), false, 'session token must be redacted');
  assert.equal(logs.includes(rig.calls.started[0].runnerToken), false, 'runner token must never be logged');
  assert.ok(logs.includes(created.id), 'session ids may be logged (they are not secrets)');
});

test('health endpoint reports limits and hides nothing sensitive', async (t) => {
  const rig = await startRig();
  t.after(rig.cleanup);
  const res = await fetch(`${rig.base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.engine, '29.8.0');
  assert.equal(body.limits.maxSessions, 3);
  assert.equal(body.sessions, 0);
  assert.equal(JSON.stringify(body).includes(KEY), false);
});

async function waitFor(predicate, { timeoutMs = 2_000, stepMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error('condition not met in time');
}
