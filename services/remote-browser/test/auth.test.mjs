import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createToken, tokenHash, tokenMatches, redact, redactUrl, bearerFrom, timingSafeEqualStrings } from '../src/auth.mjs';

test('tokens match only against their own hash', () => {
  const t = createToken();
  const other = createToken();
  assert.equal(t.length > 20, true);
  assert.equal(tokenMatches(tokenHash(t), t), true);
  assert.equal(tokenMatches(tokenHash(t), other), false);
  assert.equal(tokenMatches(tokenHash(t), ''), false);
  assert.equal(tokenMatches(tokenHash(t), undefined), false);
});

test('token matching rejects oversized or non-string input', () => {
  const t = createToken();
  assert.equal(tokenMatches(tokenHash(t), 'x'.repeat(600)), false);
  assert.equal(tokenMatches(tokenHash(t), 12345), false);
});

test('redact strips tokens from query strings and headers', () => {
  const line = 'GET /ws/abc?token=SUPERSECRET123&other=1  x-gameflex-key: KEYVALUE';
  const out = redact(line);
  assert.equal(out.includes('SUPERSECRET123'), false);
  assert.equal(out.includes('KEYVALUE'), false);
  assert.equal(out.includes('[redacted]'), true);
  assert.equal(redactUrl('ws://127.0.0.1:8081/ws/ab?token=SUPERSECRET123').includes('SUPERSECRET123'), false);
  assert.equal(redactUrl('not a url token=SUPERSECRET123').includes('SUPERSECRET123'), false);
});

test('bearer parsing is strict', () => {
  assert.equal(bearerFrom('Bearer abc'), 'abc');
  assert.equal(bearerFrom('bearer abc'), 'abc');
  assert.equal(bearerFrom('Token abc'), null);
  assert.equal(bearerFrom(undefined), null);
});

test('timingSafeEqualStrings compares by value only', () => {
  assert.equal(timingSafeEqualStrings('same', 'same'), true);
  assert.equal(timingSafeEqualStrings('same', 'diff'), false);
  assert.equal(timingSafeEqualStrings('same', 'samer'), false);
  assert.equal(timingSafeEqualStrings('', ''), false);
});
