import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { loadCatalog, resolveGame, classifyAddress, classifyHost } from '../src/config.mjs';
import { assertPublicHost } from '../src/gateway.mjs';

// The live catalogue is the allowlist: tests read the real file, not a fixture.
const CATALOG_PATH = fileURLToPath(new URL('../../../dist/games.json', import.meta.url));
const catalog = loadCatalog(CATALOG_PATH);

test('catalogue loads live entries with an origin', () => {
  assert.equal(catalog.size >= 10, true);
  const quake = catalog.get('quake');
  assert.ok(quake);
  assert.equal(quake.origin, 'https://q1.pieter.com');
  assert.equal(quake.url, 'https://q1.pieter.com/');
});

test('only catalogue ids can be launched', () => {
  assert.equal(resolveGame(catalog, 'quake').ok, true);
  assert.deepEqual(resolveGame(catalog, 'does-not-exist'), { ok: false, code: 'unknown_game' });
  assert.deepEqual(resolveGame(catalog, '../../etc/passwd'), { ok: false, code: 'invalid_game_id' });
  assert.deepEqual(resolveGame(catalog, 'https://evil.example'), { ok: false, code: 'invalid_game_id' });
  assert.deepEqual(resolveGame(catalog, ''), { ok: false, code: 'invalid_game_id' });
  assert.deepEqual(resolveGame(catalog, null), { ok: false, code: 'invalid_game_id' });
  assert.deepEqual(resolveGame(catalog, { id: 'quake' }), { ok: false, code: 'invalid_game_id' });
});

test('denied ids cannot be used as session targets', () => {
  assert.deepEqual(resolveGame(catalog, 'wasmarcade', { denyIds: ['wasmarcade'] }), { ok: false, code: 'game_denied' });
});

test('resolved url always comes from the catalogue, never the caller', () => {
  const game = resolveGame(catalog, 'quake').game;
  assert.equal(game.url, catalog.get('quake').url);
  assert.equal(Object.keys(game).includes('url'), true);
});

test('private, loopback and link-local addresses are classified', () => {
  assert.equal(classifyAddress('127.0.0.1'), 'loopback');
  assert.equal(classifyAddress('10.1.2.3'), 'private');
  assert.equal(classifyAddress('192.168.0.5'), 'private');
  assert.equal(classifyAddress('172.16.9.9'), 'private');
  assert.equal(classifyAddress('172.32.9.9'), null);
  assert.equal(classifyAddress('169.254.169.254'), 'link-local');
  assert.equal(classifyAddress('::1'), 'loopback');
  assert.equal(classifyAddress('fd00::1'), 'private');
  assert.equal(classifyAddress('fe80::1'), 'link-local');
  assert.equal(classifyAddress('::ffff:127.0.0.1'), 'loopback');
  assert.equal(classifyAddress('93.184.216.34'), null);
  assert.equal(classifyHost('localhost'), 'loopback');
  assert.equal(classifyHost('foo.localhost'), 'loopback');
  assert.equal(classifyHost('metadata.internal'), 'private');
  assert.equal(classifyHost('q1.pieter.com'), null);
});

test('a host that resolves to a private address is refused (pre-flight check)', async () => {
  // This simulates a resolver answer only. It is a pre-flight check at session
  // start, not connection pinning: the address the runner connects to later is
  // resolved inside the container and is not compared against this answer.
  const privateAnswer = async () => [{ address: '10.0.0.7', family: 4 }];
  const publicAnswer = async () => [{ address: '93.184.216.34', family: 4 }];

  const blocked = await assertPublicHost('https://q1.pieter.com/', { lookup: privateAnswer });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'host_not_public');

  const allowed = await assertPublicHost('https://q1.pieter.com/', { lookup: publicAnswer });
  assert.equal(allowed.ok, true);

  const literal = await assertPublicHost('http://169.254.169.254/latest/meta-data', { lookup: publicAnswer });
  assert.equal(literal.ok, false);
  assert.equal(literal.code, 'host_not_public');

  const dnsFailure = await assertPublicHost('https://nope.invalid/', { lookup: async () => { throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); } });
  assert.equal(dnsFailure.ok, false);
  assert.equal(dnsFailure.code, 'dns_lookup_failed');
});
