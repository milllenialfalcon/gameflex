import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateInputMessage, MAX_COORD } from '../src/input.mjs';
import { decideRequest, originOf } from '../runner/policy.mjs';

const asText = (obj) => JSON.stringify(obj);

test('valid mouse events pass and are normalised', () => {
  const moved = validateInputMessage(asText({ type: 'input', event: { kind: 'mouse', eventType: 'mouseMoved', x: 12, y: 34.6 } }));
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.event, { kind: 'mouse', eventType: 'mouseMoved', x: 12, y: 35, button: 'none' });

  const pressed = validateInputMessage(asText({ type: 'input', event: { kind: 'mouse', eventType: 'mousePressed', x: 1, y: 2, button: 'left' } }));
  assert.equal(pressed.ok, true);
  assert.equal(pressed.event.button, 'left');
});

test('valid key and wheel events pass', () => {
  const down = validateInputMessage(asText({ type: 'input', event: { kind: 'key', eventType: 'keyDown', key: 'w', code: 'KeyW' } }));
  assert.equal(down.ok, true);
  const wheel = validateInputMessage(asText({ type: 'input', event: { kind: 'wheel', x: 5, y: 6, deltaX: 0, deltaY: -120 } }));
  assert.equal(wheel.ok, true);
  assert.equal(wheel.event.deltaY, -120);
});

test('malformed messages are rejected', () => {
  const cases = [
    ['not json', 'invalid_json'],
    [asText({ type: 'frame', data: 'x' }), 'unknown_message_type'],
    [asText({ type: 'input' }), 'missing_event'],
    [asText({ type: 'input', event: { kind: 'nope' } }), 'invalid_kind'],
    [asText({ type: 'input', event: { kind: 'mouse', eventType: 'mouseClicked', x: 1, y: 1 } }), 'invalid_event_type'],
    [asText({ type: 'input', event: { kind: 'mouse', eventType: 'mouseMoved', x: -1, y: 1 } }), 'invalid_coordinates'],
    [asText({ type: 'input', event: { kind: 'mouse', eventType: 'mouseMoved', x: MAX_COORD + 1, y: 1 } }), 'invalid_coordinates'],
    [asText({ type: 'input', event: { kind: 'mouse', eventType: 'mousePressed', x: 1, y: 1, button: 'side' } }), 'invalid_button'],
    [asText({ type: 'input', event: { kind: 'mouse', eventType: 'mousePressed', x: 1, y: 1 } }), 'button_required'],
    [asText({ type: 'input', event: { kind: 'key', eventType: 'keyDown', key: '', code: 'KeyW' } }), 'invalid_key'],
    [asText({ type: 'input', event: { kind: 'key', eventType: 'keyDown', key: 'w' } }), 'invalid_code'],
    [asText({ type: 'input', event: { kind: 'key', eventType: 'keyDown', key: 'w', code: 'KeyW; rm -rf /' } }), 'invalid_code'],
    [asText({ type: 'input', event: { kind: 'wheel', x: 1, y: 1, deltaY: 99_999 } }), 'invalid_delta'],
    [asText({ type: 'input', event: { kind: 'mouse', eventType: 'mouseMoved', x: 1, y: 1, extra: 1 } }), 'unknown_event_field'],
    [asText({ type: 'input', event: { kind: 'mouse', eventType: 'mouseMoved', x: 1, y: 1 }, url: 'https://evil' }), 'unknown_message_field'],
  ];
  for (const [raw, code] of cases) {
    const res = validateInputMessage(raw);
    assert.equal(res.ok, false, `expected rejection for ${raw}`);
    assert.equal(res.code, code, `wrong code for ${raw}`);
  }
  assert.equal(validateInputMessage(null).code, 'not_an_object');
  assert.equal(validateInputMessage([]).code, 'not_an_object');
  assert.equal(validateInputMessage(undefined).code, 'not_an_object');
  assert.equal(validateInputMessage(42).code, 'not_an_object');
});

test('non-finite numbers are rejected', () => {
  for (const value of [Infinity, -Infinity, NaN, '10', null, {}, []]) {
    const res = validateInputMessage(asText({ type: 'input', event: { kind: 'mouse', eventType: 'mouseMoved', x: value, y: 1 } }));
    assert.equal(res.ok, false, `x=${String(value)} must be rejected`);
  }
});

test('oversized payloads are rejected before parsing', () => {
  const big = asText({ type: 'input', event: { kind: 'key', eventType: 'keyDown', key: 'a', code: 'KeyA' } }) + ' '.repeat(20_000);
  assert.equal(validateInputMessage(big, { maxBytes: 1024 }).code, 'payload_too_large');
  assert.equal(validateInputMessage(Buffer.from(big), { maxBytes: 1024 }).code, 'payload_too_large');
});

test('buffers and objects are accepted where strings are', () => {
  const msg = { type: 'input', event: { kind: 'key', eventType: 'keyUp', key: 'Escape', code: 'Escape' } };
  assert.equal(validateInputMessage(msg).ok, true);
  assert.equal(validateInputMessage(Buffer.from(asText(msg))).ok, true);
});

test('egress policy allows only the game origin', () => {
  const allowedOrigins = ['https://q1.pieter.com'];
  assert.equal(decideRequest('https://q1.pieter.com/quake.js', { allowedOrigins }).allow, true);
  assert.equal(decideRequest('wss://q1.pieter.com/socket', { allowedOrigins }).allow, true);
  assert.equal(decideRequest('https://evil.example/x.js', { allowedOrigins }).allow, false);
  assert.equal(decideRequest('https://evil.example/x.js', { allowedOrigins }).reason, 'origin_denied');
  assert.equal(decideRequest('http://127.0.0.1:8080/healthz', { allowedOrigins }).allow, false);
  assert.equal(decideRequest('http://169.254.169.254/latest/meta-data', { allowedOrigins }).reason, 'private_target:link-local');
  assert.equal(decideRequest('https://q1.pieter.com.evil.example/x', { allowedOrigins }).allow, false);
  assert.equal(decideRequest('file:///etc/passwd', { allowedOrigins }).allow, false);
  assert.equal(decideRequest('about:blank', { allowedOrigins }).allow, true);
  assert.equal(decideRequest('not-a-url', { allowedOrigins }).allow, false);
});

test('origin parsing normalises ws to http', () => {
  assert.equal(originOf('wss://q1.pieter.com/s').origin, 'https://q1.pieter.com');
  assert.equal(originOf('ws://q1.pieter.com/s').origin, 'http://q1.pieter.com');
});
