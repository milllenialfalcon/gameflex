import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Paths are resolved from this module so the service runs from any cwd.
const CATALOG_DEFAULT = fileURLToPath(new URL('../../../dist/games.json', import.meta.url));
const SECCOMP_DEFAULT = fileURLToPath(new URL('../runner/seccomp/chromium-sandbox.json', import.meta.url));

// Prototype configuration. Everything is override-able so tests never need
// Docker, a catalogue file, or a real clock.
export function defaultConfig(overrides = {}) {
  const cfg = {
    host: process.env.GF_RB_HOST || '127.0.0.1',   // loopback only; enforced at startup
    port: Number(process.env.GF_RB_PORT || 8081),
    // Session creation requires this shared key. Empty string = refuse to start
    // the gateway (there is no "open mode": unauthenticated session creation is
    // the cross-site risk this prototype must not ship).
    gatewayKey: process.env.GF_RB_KEY || '',
    // Exact origins allowed to call the API / open the socket. Never "*".
    allowedOrigins: (process.env.GF_RB_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500')
      .split(',').map((s) => s.trim()).filter(Boolean),
    catalogPath: process.env.GF_RB_CATALOG || CATALOG_DEFAULT,
    // No catalogue entry may be used as a smoke-test target if it is on this list.
    denyIds: (process.env.GF_RB_DENY_IDS || 'wasmarcade').split(',').map((s) => s.trim()).filter(Boolean),
    sessionTtlMs: Number(process.env.GF_RB_TTL_MS || 120_000),
    idleTimeoutMs: Number(process.env.GF_RB_IDLE_MS || 30_000),
    maxSessions: Number(process.env.GF_RB_MAX_SESSIONS || 3),
    runnerReadyTimeoutMs: Number(process.env.GF_RB_READY_MS || 45_000),
    reapIntervalMs: Number(process.env.GF_RB_REAP_MS || 2_000),
    // Largest accepted client->gateway control frame. Frames out are bigger; this
    // only bounds inbound input messages.
    maxInputBytes: 16 * 1024,
    maxBodyBytes: 4 * 1024,
    // Per-session socket and message-rate bounds (review item 9).
    maxConnectionsPerSession: Number(process.env.GF_RB_MAX_CONNS || 2),
    maxInputRatePerSecond: Number(process.env.GF_RB_MAX_MSG_RATE || 120),
    shutdownGraceMs: Number(process.env.GF_RB_SHUTDOWN_MS || 3_000),
    runnerImage: process.env.GF_RB_IMAGE || 'gameflex/browser-runner:0.1.0',
    seccompProfilePath: process.env.GF_RB_SECCOMP || SECCOMP_DEFAULT,
    dockerBin: process.env.GF_RB_DOCKER || 'docker',
    viewerWidth: 960,
    viewerHeight: 540,
    frameQuality: 45,
    maxFrameFps: 12,
    log: (...a) => console.log(...a),
  };
  return { ...cfg, ...overrides };
}

export function loadCatalog(catalogPath) {
  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`catalogue ${catalogPath} must be a JSON array`);
  const byId = new Map();
  for (const entry of raw) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.url !== 'string') continue;
    let url;
    try { url = new URL(entry.url); } catch { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    byId.set(entry.id, { id: entry.id, title: entry.title || entry.id, url: url.toString(), origin: url.origin });
  }
  return byId;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

// The client only ever supplies a catalogue id. URLs are read from the
// catalogue, never from the request, so no arbitrary destination can be opened.
export function resolveGame(catalog, gameId, { denyIds = [] } = {}) {
  if (typeof gameId !== 'string' || !ID_RE.test(gameId)) return { ok: false, code: 'invalid_game_id' };
  if (denyIds.includes(gameId)) return { ok: false, code: 'game_denied' };
  const game = catalog.get(gameId);
  if (!game) return { ok: false, code: 'unknown_game' };
  return { ok: true, game };
}

const PRIVATE_V4 = [
  [/^127\./, 'loopback'],
  [/^10\./, 'private'],
  [/^192\.168\./, 'private'],
  [/^172\.(1[6-9]|2\d|3[01])\./, 'private'],
  [/^169\.254\./, 'link-local'],
  [/^0\./, 'unspecified'],
  [/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, 'cgnat'],
  [/^19[89]\.18\./, 'benchmark'],
  [/^22[4-9]\.|^23\d\.|^24\d\.|^25[0-5]\./, 'multicast'],
  [/^24[0-9]\.|^25[0-5]\./, 'reserved'],
];

function classifyV4(a) {
  for (const [re, label] of PRIVATE_V4) if (re.test(a)) return label;
  return null;
}

// Used for the DNS pre-flight check at session start and per request in the
// runner. NOTE: this classifies the address a resolver returns. It is a
// pre-flight check, not a complete DNS-rebinding defence - see
// docs/remote-browser.md section 3.
export function classifyAddress(address) {
  const a = String(address).toLowerCase().trim().replace(/^\[|\]$/g, '');
  if (!a) return 'empty';
  if (!a.includes(':')) return classifyV4(a);
  // IPv6. Handle embedded IPv4 in both dotted (::ffff:10.0.0.1) and hex
  // (::ffff:a00:1) forms before looking at the IPv6 ranges.
  const mapped = /^(?:::ffff:|::)([0-9a-f:.]+)$/.exec(a);
  if (mapped) {
    const tail = mapped[1];
    if (tail.includes('.')) {
      const inner = classifyV4(tail);
      if (inner) return inner;
    } else if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(tail)) {
      const [hi, lo] = tail.split(':').map((h) => parseInt(h, 16));
      const dotted = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
      const inner = classifyV4(dotted);
      if (inner) return inner;
    }
  }
  if (a === '::1' || a === '::') return 'loopback';
  if (/^f[cd][0-9a-f]{2}:/.test(a)) return 'private';          // fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(a)) return 'link-local';       // fe80::/10
  if (/^ff[0-9a-f]{2}:/.test(a)) return 'multicast';           // ff00::/8
  if (/^2001:db8:/.test(a)) return 'reserved';                 // documentation
  return null;
}

export function classifyHost(hostname) {
  const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return 'empty';
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return 'private';
  const direct = classifyAddress(host);
  if (direct) return direct;
  return null; // public-looking name or public IP literal
}
