import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dns from 'node:dns/promises';
import { WebSocketServer, WebSocket } from 'ws';

import { defaultConfig, loadCatalog, resolveGame, classifyAddress, classifyHost } from './config.mjs';
import { createToken } from './auth.mjs';
import { validateInputMessage } from './input.mjs';
import { createDocker, waitForRunner } from './docker.mjs';
import { SessionStore } from './sessions.mjs';
import {
  newSessionId, containerNameFor, corsHeaders, originAllowed, checkGatewayKey,
  readJsonBody, redactingLogger, errorStatus, sendJson, SESSION_ID_RE,
  assertLoopbackHost, checkHostHeader, checkContentType,
} from './http.mjs';

const MAX_INPUT_VIOLATIONS = 20;

// Resolves the game host once, before the container starts, and refuses
// loopback / private / link-local answers. This is a pre-flight check: it
// classifies the address the resolver returns at session start, so a name that
// looks public here but re-resolves inside the container network afterwards is
// NOT blocked by it (see docs/remote-browser.md section 3).
export async function assertPublicHost(url, { lookup = dns.lookup } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { return { ok: false, code: 'invalid_url' }; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false, code: 'invalid_url' };
  const literal = classifyHost(parsed.hostname);
  if (literal) return { ok: false, code: 'host_not_public', detail: `${parsed.hostname} is ${literal}` };
  let records;
  try {
    records = await lookup(parsed.hostname, { all: true });
  } catch (err) {
    return { ok: false, code: 'dns_lookup_failed', detail: String(err && err.code || err && err.message) };
  }
  const list = Array.isArray(records) ? records : [records];
  const bad = list.map((r) => ({ address: r.address, kind: classifyAddress(r.address) })).filter((r) => r.kind);
  if (bad.length > 0) return { ok: false, code: 'host_not_public', detail: `${parsed.hostname} -> ${bad[0].address} (${bad[0].kind})` };
  return { ok: true, addresses: list.map((r) => r.address) };
}

export function createGateway(options = {}) {
  const config = defaultConfig(options.config || {});
  const log = redactingLogger(options.log || config.log);
  const catalog = options.catalog || loadCatalog(path.resolve(config.catalogPath));
  const docker = options.docker || createDocker({ dockerBin: config.dockerBin, log });
  const now = options.now || Date.now;
  const lookup = options.lookup || dns.lookup;
  const waitRunner = options.waitForRunner || waitForRunner;

  let server = null;
  const liveSockets = new Map(); // sessionId -> Set<WebSocket>

  // Single teardown path for every close reason (client DELETE, TTL, idle,
  // shutdown). Sessions removed by reap() are no longer in the store, so the
  // session object is passed in rather than looked up again.
  const teardown = async (session, reason) => {
    session.closeReason = reason;
    for (const ws of liveSockets.get(session.id) || []) {
      try { ws.close(1001, 'session closed'); } catch { /* already gone */ }
    }
    liveSockets.delete(session.id);
    await docker.stop(session.containerName);
    log(`[gateway] session ${session.id} closed (${reason})`);
  };

  const store = new SessionStore({
    ttlMs: config.sessionTtlMs,
    idleTimeoutMs: config.idleTimeoutMs,
    maxSessions: config.maxSessions,
    now,
    onDestroy: teardown,
  });

  async function createSession(gameId, { isAborted = () => false } = {}) {
    const resolved = resolveGame(catalog, gameId, { denyIds: config.denyIds });
    if (!resolved.ok) return { ok: false, code: resolved.code };

    // Reserve first: the DNS probe, container start and health poll are async, so
    // a concurrent requests must not each pass the capacity check.
    try {
      store.reserve();
    } catch {
      return { ok: false, code: 'capacity' };
    }

    const id = newSessionId();
    const containerName = containerNameFor(id);
    const token = createToken();
    const runnerToken = createToken();
    let started = null;
    let handedOff = false;
    let reserved = true;

    try {
      // Pre-flight only: the address a resolver returns now is not the address
      // Chromium will connect to later. See docs/remote-browser.md section 3 -
      // this is NOT a complete DNS-rebinding defence.
      const publicHost = await assertPublicHost(resolved.game.url, { lookup });
      if (!publicHost.ok) return { ok: false, code: publicHost.code, detail: publicHost.detail };

      started = await docker.start({
        name: containerName,
        image: config.runnerImage,
        url: resolved.game.url,
        runnerToken,
        token,
        ttlMs: config.sessionTtlMs,
        seccompProfilePath: config.seccompProfilePath,
        viewerWidth: config.viewerWidth,
        viewerHeight: config.viewerHeight,
        frameQuality: config.frameQuality,
        maxFrameFps: config.maxFrameFps,
        hostPort: config.dockerHostPort ?? 8080,
        containerPort: 8080,
      });
      if (!started.ok) {
        const detail = started.error;
        started = null;
        return { ok: false, code: 'runner_start_failed', detail };
      }

      const ready = await waitRunner(started.hostPort, runnerToken, { timeoutMs: config.runnerReadyTimeoutMs });
      if (!ready.ok) return { ok: false, code: 'runner_not_ready', detail: ready.error };

      // The caller may have gone away while the container was starting. Nothing
      // can reach the session in that case, so it is not handed off: the finally
      // block still releases the reservation and removes the container.
      if (isAborted()) return { ok: false, code: 'client_aborted' };

      // Convert this reservation to a live session synchronously; add() counts
      // pending reservations, so retaining our own would double-count it.
      store.release();
      reserved = false;
      store.add({ id, gameId: resolved.game.id, containerName, hostPort: started.hostPort, runnerToken, token });
      handedOff = true;
      const session = store.get(id);
      log(`[gateway] session ${id} created for ${resolved.game.id} (${resolved.game.origin}) container=${containerName}`);
      return {
        ok: true,
        session,
        body: {
          id,
          token,
          wsUrl: `ws://${config.host}:${config.port}/ws/${id}?token=${encodeURIComponent(token)}`,
          expiresAt: new Date(session.expiresAt).toISOString(),
          game: { id: resolved.game.id, title: resolved.game.title, origin: resolved.game.origin },
          viewer: { width: config.viewerWidth, height: config.viewerHeight, format: 'jpeg', targetFps: config.maxFrameFps },
          capabilities: {
            audio: false,
            relativeMouse: false,
            protocol: 'gameflex-remote-browser/0.1-prototype',
            note: 'Low-FPS visual prototype with an owner-local gateway. No audio, no relative-mouse guarantee, no gameplay claims.',
          },
        },
      };
    } finally {
      if (reserved) store.release();
      // Any container that never reached the store must go, whatever happened:
      // failed health poll, thrown error, or a request aborted mid-flight.
      if (started && !handedOff) await docker.stop(containerName);
    }
  }

  function attachClient(ws, session, req) {
    const existing = liveSockets.get(session.id) || new Set();
    if (existing.size >= config.maxConnectionsPerSession) {
      log(`[gateway] rejected ws for ${session.id}: connection limit`);
      ws.close(1013, 'connection limit reached');
      return;
    }
    // Connecting counts as activity: that is the grace window before the idle
    // timer starts running on user input alone.
    store.touch(session.id);
    session.connections += 1;
    existing.add(ws);
    liveSockets.set(session.id, existing);

    const runner = new WebSocket(`ws://127.0.0.1:${session.hostPort}/runner`, {
      headers: { 'x-runner-token': session.runnerToken },
    });
    let violations = 0;
    let closed = false;
    let windowStart = Date.now();
    let windowCount = 0;

    const closeBoth = (code, reason) => {
      if (closed) return;
      closed = true;
      try { ws.close(code, reason); } catch { /* noop */ }
      try { runner.close(); } catch { /* noop */ }
      liveSockets.get(session.id)?.delete(ws);
      session.connections = Math.max(0, session.connections - 1);
    };

    ws.send(JSON.stringify({
      type: 'accepted',
      sessionId: session.id,
      viewer: { width: config.viewerWidth, height: config.viewerHeight },
      expiresAt: new Date(session.expiresAt).toISOString(),
    }));

    runner.on('open', () => {
      runner.send(JSON.stringify({ type: 'start', sessionId: session.id }));
    });
    runner.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
      if (msg.type === 'frame') {
        // Deliberately NOT an activity signal: an animating game would otherwise
        // keep an abandoned session alive forever.
        session.frames += 1;
        if (ws.readyState !== ws.OPEN) return;
        if (ws.bufferedAmount > 4 * 1024 * 1024) return; // drop frame, never queue
        ws.send(data.toString('utf8'));
        return;
      }
      if (msg.type === 'status' || msg.type === 'stats') {
        if (ws.readyState === ws.OPEN) ws.send(data.toString('utf8'));
      }
    });
    runner.on('error', (err) => {
      log(`[gateway] runner socket error for ${session.id}: ${err.message}`);
      try { ws.send(JSON.stringify({ type: 'error', code: 'runner_unavailable' })); } catch { /* noop */ }
      closeBoth(1011, 'runner error');
    });
    runner.on('close', () => closeBoth(1011, 'runner closed'));

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        violations += 1;
        ws.send(JSON.stringify({ type: 'error', code: 'binary_not_supported' }));
        if (violations >= MAX_INPUT_VIOLATIONS) closeBoth(1008, 'too many invalid messages');
        return;
      }
      // Bounded client message rate, independent of payload validity.
      const nowMs = Date.now();
      if (nowMs - windowStart >= 1_000) { windowStart = nowMs; windowCount = 0; }
      windowCount += 1;
      if (windowCount > config.maxInputRatePerSecond) {
        log(`[gateway] rate limit tripped for ${session.id}`);
        ws.send(JSON.stringify({ type: 'error', code: 'rate_limited' }));
        closeBoth(1008, 'rate limit');
        return;
      }
      const result = validateInputMessage(data.toString('utf8'), { maxBytes: config.maxInputBytes });
      if (!result.ok) {
        violations += 1;
        ws.send(JSON.stringify({ type: 'error', code: result.code }));
        if (violations >= MAX_INPUT_VIOLATIONS) closeBoth(1008, 'too many invalid messages');
        return;
      }
      // Only validated user input extends the idle window.
      store.touch(session.id);
      if (runner.readyState === WebSocket.OPEN) {
        runner.send(JSON.stringify({ type: 'input', event: result.event }));
      }
    });
    ws.on('close', () => closeBoth(1000, 'client closed'));
    ws.on('error', () => closeBoth(1011, 'client error'));
  }

  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    if (!url.pathname.startsWith('/ws/')) { socket.destroy(); return; }
    if (!originAllowed(req.headers.origin, config.allowedOrigins)) {
      log(`[gateway] rejected ws upgrade: origin not allowed`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const id = url.pathname.slice('/ws/'.length);
    if (!SESSION_ID_RE.test(id)) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
    const auth = store.authenticate(id, url.searchParams.get('token'));
    if (!auth.ok) {
      log(`[gateway] rejected ws upgrade for ${id}: ${auth.code}`); // token value never logged
      socket.write(`HTTP/1.1 ${auth.code === 'unknown_session' ? '404 Not Found' : '401 Unauthorized'}\r\n\r\n`);
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => attachClient(ws, auth.session, req));
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxInputBytes });

  async function handler(req, res) {
    // A foreign hostname resolving to 127.0.0.1 must not be able to drive the API.
    const host = checkHostHeader(req, config.port);
    if (!host.ok) return sendJson(res, errorStatus(host.code), { error: { code: host.code } });
    try {
      await routeRequest(req, res);
    } catch (err) {
      // No unhandled rejection can take the gateway down.
      log(`[gateway] request failed: ${String(err && err.message).slice(0, 200)}`);
      try {
        if (!res.headersSent) sendJson(res, 500, { error: { code: 'internal_error' } });
        else res.end();
      } catch { /* socket already gone */ }
    }
  }

  async function routeRequest(req, res) {
    const origin = req.headers.origin;
    const cors = corsHeaders(origin, config.allowedOrigins);
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    if (req.method === 'OPTIONS') {
      if (!cors) return sendJson(res, 403, { error: { code: 'origin_not_allowed' } });
      res.writeHead(204, cors);
      return res.end();
    }

    if (url.pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        engine: await docker.version(),
        sessions: store.size,
        limits: {
          maxSessions: config.maxSessions,
          ttlMs: config.sessionTtlMs,
          idleTimeoutMs: config.idleTimeoutMs,
          viewer: { width: config.viewerWidth, height: config.viewerHeight },
        },
        denyIds: config.denyIds,
      }, cors || {});
    }

    if (url.pathname === '/api/sessions' && req.method === 'POST') {
      if (req.headers.origin && !cors) return sendJson(res, 403, { error: { code: 'origin_not_allowed' } });
      const key = checkGatewayKey(req, config.gatewayKey);
      if (!key.ok) return sendJson(res, errorStatus(key.code), { error: { code: key.code } }, cors || {});
      const type = checkContentType(req);
      if (!type.ok) return sendJson(res, errorStatus(type.code), { error: { code: type.code } }, cors || {});
      const body = await readJsonBody(req, { maxBytes: config.maxBodyBytes });
      if (!body.ok) return sendJson(res, errorStatus(body.code), { error: { code: body.code } }, cors || {});
      // Once the response socket closes without us having answered, the caller is
      // gone and the create must not be handed off as a live session.
      let aborted = false;
      res.on('close', () => { if (!res.writableEnded) aborted = true; });
      const result = await createSession(body.value && body.value.gameId, { isAborted: () => aborted });
      if (!result.ok) {
        if (aborted) return;                      // nothing left to write to
        return sendJson(res, errorStatus(result.code), { error: { code: result.code, detail: result.detail } }, cors || {});
      }
      if (aborted) {
        // Narrow race: the socket closed between the check and the handoff. Drop
        // the session rather than leak one the caller can never connect to.
        await store.destroy(result.session.id, 'client_aborted');
        return;
      }
      // The session token must never be cached by a proxy or the browser.
      return sendJson(res, 201, result.body, { ...(cors || {}), 'cache-control': 'no-store' });
    }

    const del = /^\/api\/sessions\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
    if (del && req.method === 'DELETE') {
      if (req.headers.origin && !cors) return sendJson(res, 403, { error: { code: 'origin_not_allowed' } }, cors || {});
      const id = del[1];
      const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
      const auth = store.authenticate(id, bearer || '');
      if (!auth.ok) return sendJson(res, auth.code === 'unknown_session' ? 404 : 401, { error: { code: auth.code } }, cors || {});
      await store.destroy(id, 'client_delete');
      res.writeHead(204, cors || {});
      return res.end();
    }

    return sendJson(res, 404, { error: { code: 'not_found' } }, cors || {});
  }

  return {
    config,
    store,
    handler,
    handleUpgrade,
    createSession,
    log,
    start() {
      assertLoopbackHost(config.host, config.port);   // no accidental public bind
      return new Promise((resolve, reject) => {
        server = http.createServer(handler);
        server.on('upgrade', handleUpgrade);
        const onListenError = (err) => reject(err);
        server.on('error', onListenError);
        server.listen(config.port, config.host, () => {
          server.removeListener('error', onListenError);
          server.on('error', (err) => log(`[gateway] server error: ${String(err && err.message).slice(0, 200)}`));
          const addr = server.address();
          // wsUrl is built from config, so an ephemeral port has to be adopted.
          if (addr && addr.port) config.port = addr.port;
          log(`[gateway] listening on http://${config.host}:${config.port} (origins: ${config.allowedOrigins.join(', ') || 'none'})`);
          resolve(addr);
        });
      });
    },
    async stop({ graceMs = config.shutdownGraceMs } = {}) {
      wss.close();
      await Promise.allSettled([...liveSockets.keys()].map((id) => store.destroy(id, 'shutdown')));
      await Promise.allSettled(store.reap(now()).map(({ session, reason }) => teardown(session, reason)));
      if (server) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, graceMs);
          server.close(() => { clearTimeout(timer); resolve(); });
        });
      }
      await Promise.allSettled([...store.sessions.values()].map((s) => teardown(s, 'shutdown')));
      store.sessions.clear();
    },
    async reap() {
      for (const { session, reason } of store.reap(now())) await teardown(session, reason);
    },
  };
}

async function main() {
  const config = defaultConfig();
  if (!config.gatewayKey) {
    console.error('GF_RB_KEY is required: refusing to start an unauthenticated session creator.');
    process.exit(2);
  }
  if (config.allowedOrigins.length === 0) {
    console.error('GF_RB_ORIGINS is required: refusing to start without an exact origin allowlist.');
    process.exit(2);
  }
  const gateway = createGateway({ config });
  const addr = await gateway.start();
  const timer = setInterval(() => gateway.reap().catch(() => {}), config.reapIntervalMs);
  gateway.reap().catch(() => {});
  const shutdown = async () => { clearInterval(timer); await gateway.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  gateway.log(`[gateway] ready on ${JSON.stringify(addr)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
