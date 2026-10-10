import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SessionStore } from '../src/sessions.mjs';

function clock(start = 1_000) {
  let now = start;
  return { now: () => now, advance: (ms) => { now += ms; } };
}

function makeStore(overrides = {}) {
  const c = clock();
  const destroyed = [];
  const store = new SessionStore({
    ttlMs: 60_000, idleTimeoutMs: 10_000, maxSessions: 2, now: c.now,
    onDestroy: (session, reason) => { destroyed.push({ id: session.id, reason }); },
    ...overrides,
  });
  return { store, clock: c, destroyed };
}

test('constructor validates its bounds', () => {
  assert.throws(() => new SessionStore({ ttlMs: 0, idleTimeoutMs: 1, maxSessions: 1 }), /ttlMs/);
  assert.throws(() => new SessionStore({ ttlMs: 1, idleTimeoutMs: 0, maxSessions: 1 }), /idleTimeoutMs/);
  assert.throws(() => new SessionStore({ ttlMs: 1, idleTimeoutMs: 1, maxSessions: 0 }), /maxSessions/);
});

test('sessions authenticate only with the issued token', () => {
  const { store } = makeStore();
  store.add({ id: 'a'.repeat(16), gameId: 'quake', containerName: 'c', hostPort: 1, runnerToken: 'r', token: 'good-token' });
  assert.equal(store.authenticate('a'.repeat(16), 'good-token').ok, true);
  assert.deepEqual(store.authenticate('a'.repeat(16), 'wrong'), { ok: false, code: 'invalid_token' });
  assert.deepEqual(store.authenticate('b'.repeat(16), 'good-token'), { ok: false, code: 'unknown_session' });
});

test('tokens expire at the hard TTL and cannot be revived', () => {
  const { store, clock } = makeStore();
  const id = 'c'.repeat(16);
  store.add({ id, gameId: 'quake', containerName: 'c', hostPort: 1, runnerToken: 'r', token: 't' });
  clock.advance(59_000);
  assert.equal(store.authenticate(id, 't').ok, true);
  clock.advance(2_000);
  assert.deepEqual(store.authenticate(id, 't'), { ok: false, code: 'expired' });
});

test('reap removes TTL-expired and idle sessions, keeping the rest', () => {
  const { store, clock } = makeStore({ maxSessions: 5, ttlMs: 60_000, idleTimeoutMs: 10_000 });
  store.add({ id: '1'.repeat(16), gameId: 'a', containerName: 'c1', hostPort: 1, runnerToken: 'r', token: 't' });
  clock.advance(1_000);
  store.add({ id: '2'.repeat(16), gameId: 'b', containerName: 'c2', hostPort: 2, runnerToken: 'r', token: 't' });

  clock.advance(4_000);              // t=5s: session 1 last active at t=0 -> idle 5s, not yet
  assert.deepEqual(store.reap(), []);

  clock.advance(6_000);              // t=11s: session 1 idle 11s -> reaped; session 2 idle 10s -> reaped
  const removed = store.reap();
  assert.deepEqual(removed.map((r) => [r.id, r.reason]).sort(), [
    ['1111111111111111', 'idle'], ['2222222222222222', 'idle'],
  ]);
  assert.equal(store.size, 0);
});

test('activity keeps a session alive until the hard TTL, then TTL wins', () => {
  const { store, clock } = makeStore({ ttlMs: 30_000, idleTimeoutMs: 10_000 });
  const id = '3'.repeat(16);
  store.add({ id, gameId: 'a', containerName: 'c', hostPort: 1, runnerToken: 'r', token: 't' });
  for (let i = 0; i < 4; i++) { clock.advance(6_000); store.touch(id); }   // t = 24s
  clock.advance(5_000);                                                    // t = 29s, idle 5s
  assert.equal(store.reap().length, 0, 'touched session survives the idle window');
  clock.advance(2_000);              // t = 31s > 30s TTL
  assert.deepEqual(store.reap().map((r) => r.reason), ['ttl']);
});

test('capacity is enforced at creation time', () => {
  const { store } = makeStore({ maxSessions: 2 });
  store.add({ id: '1'.repeat(16), gameId: 'a', containerName: 'c1', hostPort: 1, runnerToken: 'r', token: 't' });
  store.add({ id: '2'.repeat(16), gameId: 'a', containerName: 'c2', hostPort: 2, runnerToken: 'r', token: 't' });
  assert.equal(store.atCapacity(), true);
  assert.throws(() => store.add({ id: '3'.repeat(16), gameId: 'a', containerName: 'c3', hostPort: 3, runnerToken: 'r', token: 't' }), /capacity/);
  assert.throws(() => store.add({ id: '1'.repeat(16), gameId: 'a', containerName: 'c1', hostPort: 1, runnerToken: 'r', token: 't' }), /duplicate/);
});

test('destroy runs the teardown callback once and records the reason', async () => {
  const { store, destroyed } = makeStore();
  const id = '4'.repeat(16);
  store.add({ id, gameId: 'a', containerName: 'c1', hostPort: 1, runnerToken: 'r', token: 't' });
  assert.equal(await store.destroy(id, 'client_delete'), true);
  assert.equal(await store.destroy(id, 'client_delete'), false);
  assert.deepEqual(destroyed, [{ id, reason: 'client_delete' }]);
  assert.equal(store.size, 0);
});

test('a failing teardown callback does not break destroy', async () => {
  const { store } = makeStore({ onDestroy: async () => { throw new Error('docker down'); } });
  const id = '5'.repeat(16);
  store.add({ id, gameId: 'a', containerName: 'c1', hostPort: 1, runnerToken: 'r', token: 't' });
  assert.equal(await store.destroy(id, 'ttl'), true);
  assert.equal(store.size, 0);
});
