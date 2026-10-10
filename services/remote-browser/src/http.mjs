import crypto from 'node:crypto';
import { redact, bearerFrom, timingSafeEqualStrings } from './auth.mjs';

export const SESSION_ID_RE = /^[a-f0-9]{16}$/;

export function newSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

export function containerNameFor(sessionId) {
  if (!SESSION_ID_RE.test(sessionId)) throw new Error('invalid session id for container name');
  return `gfx-rb-${sessionId}`;
}

// CORS is exact-match only; `*` is never emitted. Requests from an origin that
// is not configured are refused before any work happens, which is what stops a
// random page from creating a session on a local gateway.
export function corsHeaders(origin, allowedOrigins) {
  if (!origin || !allowedOrigins.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,x-gameflex-key,authorization',
    'Access-Control-Max-Age': '60',
    Vary: 'Origin',
  };
}

export function originAllowed(origin, allowedOrigins) {
  return typeof origin === 'string' && allowedOrigins.includes(origin);
}

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

// The prototype is owner-local: binding anything else would publish an
// unauthenticated-by-design session creator. Deployments need the broker
// described in docs/remote-browser.md.
export function assertLoopbackHost(host, port) {
  const h = String(host).trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (!LOOPBACK_HOSTS.has(h)) {
    throw new Error(`refusing to bind ${host}:${port}: the prototype gateway is loopback-only; production requires an authenticated broker`);
  }
  return h;
}

// Guards against a foreign hostname resolving to 127.0.0.1 and driving the API
// from a browser page (a rebinding target on the gateway itself).
export function checkHostHeader(req, port) {
  const raw = req.headers.host;
  if (!raw) return { ok: false, code: 'invalid_host_header' };
  const m = /^(\[[^\]]+\]|[^:]*)(?::(\d+))?$/.exec(String(raw).trim());
  if (!m) return { ok: false, code: 'invalid_host_header' };
  const host = m[1].replace(/^\[|\]$/g, '').toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) return { ok: false, code: 'invalid_host_header' };
  if (m[2] && port && Number(m[2]) !== port) return { ok: false, code: 'invalid_host_header' };
  return { ok: true };
}

export function checkContentType(req) {
  const ct = req.headers['content-type'];
  if (typeof ct !== 'string' || !/^application\/json(\s*;|$)/i.test(ct.trim())) {
    return { ok: false, code: 'unsupported_media_type' };
  }
  return { ok: true };
}

// Two independent gates for state-changing calls: a shared gateway access key
// (so a drive-by page cannot mint sessions even from an allowed origin) plus the
// origin check. Deployments need a real authenticated broker instead - see
// docs/remote-browser.md.
export function checkGatewayKey(req, gatewayKey) {
  const header = req.headers['x-gameflex-key'];
  const provided = typeof header === 'string' && header.length > 0 ? header : bearerFrom(req.headers.authorization);
  if (!gatewayKey) return { ok: false, code: 'gateway_key_not_configured' };
  if (!provided) return { ok: false, code: 'missing_gateway_key' };
  return timingSafeEqualStrings(provided, gatewayKey) ? { ok: true } : { ok: false, code: 'invalid_gateway_key' };
}

export function readJsonBody(req, { maxBytes }) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    let done = false;
    const finish = (result) => { if (!done) { done = true; resolve(result); } };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        finish({ ok: false, code: 'body_too_large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', () => finish({ ok: false, code: 'body_read_error' }));
    req.on('end', () => {
      if (done) return;
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return finish({ ok: true, value: {} });
      try { finish({ ok: true, value: JSON.parse(text) }); }
      catch { finish({ ok: false, code: 'invalid_json' }); }
    });
  });
}

export function redactingLogger(write = console.log) {
  return (...args) => write(args.map((a) => redact(typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
}

const STATUS = {
  invalid_game_id: 400, unknown_game: 404, game_denied: 403, invalid_json: 400,
  missing_gateway_key: 401, invalid_gateway_key: 401, gateway_key_not_configured: 401,
  origin_not_allowed: 403, capacity: 429, body_too_large: 413, disabled: 403,
  host_not_public: 403, dns_lookup_failed: 502, runner_start_failed: 502, runner_not_ready: 504,
  invalid_host_header: 403, unsupported_media_type: 415, internal_error: 500, not_found: 404,
};

export function errorStatus(code) { return STATUS[code] ?? 500; }

export function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...extraHeaders });
  res.end(payload);
}
