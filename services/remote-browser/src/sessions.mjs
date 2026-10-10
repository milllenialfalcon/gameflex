import { tokenHash, tokenMatches } from './auth.mjs';

// Session bookkeeping only: no Docker, no sockets, no timers of its own. The
// gateway drives reap() on an interval, tests drive it with a fake clock.
export class SessionStore {
  constructor({ ttlMs, idleTimeoutMs, maxSessions, now = Date.now, onDestroy = () => {} }) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('ttlMs must be a positive number');
    if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) throw new Error('idleTimeoutMs must be a positive number');
    if (!Number.isInteger(maxSessions) || maxSessions < 1) throw new Error('maxSessions must be >= 1');
    this.ttlMs = ttlMs;
    this.idleTimeoutMs = idleTimeoutMs;
    this.maxSessions = maxSessions;
    this.now = now;
    this.onDestroy = onDestroy;
    this.sessions = new Map();
    // Creates in flight (DNS check, docker run, health poll). Reserved before any
    // async work so N concurrent requests cannot each see "room for one".
    this.pending = 0;
  }

  get size() { return this.sessions.size; }

  get pendingCount() { return this.pending; }

  atCapacity() { return this.sessions.size + this.pending >= this.maxSessions; }

  reserve() {
    if (this.atCapacity()) { const e = new Error('session capacity reached'); e.code = 'capacity'; throw e; }
    this.pending += 1;
  }

  release() {
    this.pending = Math.max(0, this.pending - 1);
  }

  add({ id, gameId, containerName, hostPort, runnerToken, token, ttlMs = this.ttlMs }) {
    if (this.sessions.has(id)) { const e = new Error('duplicate session id'); e.code = 'duplicate_id'; throw e; }
    if (this.atCapacity()) { const e = new Error('session capacity reached'); e.code = 'capacity'; throw e; }
    const createdAt = this.now();
    const session = {
      id,
      gameId,
      containerName,
      hostPort,
      runnerToken,
      createdAt,
      lastActivityAt: createdAt,
      expiresAt: createdAt + ttlMs,
      // Only the hash is kept; the plaintext token exists solely in the POST
      // response body handed to the caller.
      tokenHash: token ? tokenHash(token) : null,
      connections: 0,
      frames: 0,
      closedAt: null,
      closeReason: null,
    };
    this.sessions.set(id, session);
    return session;
  }

  setToken(id, plaintextToken) {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.tokenHash = tokenHash(plaintextToken);
    return true;
  }

  authenticate(id, token) {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, code: 'unknown_session' };
    if (!tokenMatches(s.tokenHash, token)) return { ok: false, code: 'invalid_token' };
    if (this.now() >= s.expiresAt) return { ok: false, code: 'expired' };
    return { ok: true, session: s };
  }

  get(id) { return this.sessions.get(id) || null; }

  touch(id) {
    const s = this.sessions.get(id);
    if (s) s.lastActivityAt = this.now();
    return s || null;
  }

  // Removes sessions past their hard TTL or idle window. Returns the removed ids
  // so the caller can tear containers down.
  reap(now = this.now()) {
    const removed = [];
    for (const s of [...this.sessions.values()]) {
      let reason = null;
      if (now >= s.expiresAt) reason = 'ttl';
      else if (now - s.lastActivityAt >= this.idleTimeoutMs) reason = 'idle';
      if (!reason) continue;
      this.sessions.delete(s.id);
      s.closedAt = now;
      s.closeReason = reason;
      removed.push({ id: s.id, reason, session: s });
    }
    return removed;
  }

  async destroy(id, reason = 'requested') {
    const s = this.sessions.get(id);
    if (!s) return false;
    this.sessions.delete(id);
    s.closedAt = this.now();
    s.closeReason = reason;
    try {
      await Promise.resolve(this.onDestroy(s, reason));
    } catch {
      // A failing teardown must not keep the session record alive: the container
      // is also started with --rm and a label, so orphans stay removable.
    }
    return true;
  }

  snapshot() {
    return [...this.sessions.values()].map((s) => ({
      id: s.id, gameId: s.gameId, createdAt: s.createdAt,
      expiresAt: s.expiresAt, lastActivityAt: s.lastActivityAt, connections: s.connections,
    }));
  }
}
