// Strict input validation for client -> gateway control messages.
// Protocol (JSON text frames):
//   {"type":"input","event":{"kind":"mouse","eventType":"mouseMoved|mousePressed|mouseReleased","x":N,"y":N,"button":"left|right|middle"}}
//   {"type":"input","event":{"kind":"key","eventType":"keyDown|keyUp","key":"a","code":"KeyA"}}
//   {"type":"input","event":{"kind":"wheel","x":N,"y":N,"deltaX":N,"deltaY":N}}
// Coordinates are CSS pixels inside the fixed viewer viewport (default 960x540).
export const MAX_COORD = 10_000;
export const MAX_DELTA = 10_000;
export const MAX_KEY_CHARS = 32;

const MOUSE_TYPES = new Set(['mouseMoved', 'mousePressed', 'mouseReleased']);
// 'none' is accepted because the gateway normalises mouseMoved to
// {button:'none'} and the runner re-validates every relayed event.
const BUTTONS = new Set(['left', 'right', 'middle', 'none']);
const BUTTONS_REQUIRED = new Set(['left', 'right', 'middle']);
const KEY_TYPES = new Set(['keyDown', 'keyUp']);
const CODE_RE = /^[A-Za-z0-9]{1,32}$/;

const TOP_KEYS = new Set(['type', 'event']);
const EVENT_KEYS = {
  mouse: new Set(['kind', 'eventType', 'x', 'y', 'button']),
  key: new Set(['kind', 'eventType', 'key', 'code']),
  wheel: new Set(['kind', 'eventType', 'x', 'y', 'deltaX', 'deltaY']),
};

const fail = (code) => ({ ok: false, code });

function coord(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_COORD
    ? Math.round(value)
    : null;
}

function extraKeys(obj, allowed) {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

export function validateInputMessage(raw, { maxBytes = 16 * 1024 } = {}) {
  let msg = raw;
  if (typeof raw === 'string' || Buffer.isBuffer(raw)) {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
    if (buf.length > maxBytes) return fail('payload_too_large');
    try {
      msg = JSON.parse(buf.toString('utf8'));
    } catch {
      return fail('invalid_json');
    }
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return fail('not_an_object');
  if (msg.type !== 'input') return fail('unknown_message_type');
  if (extraKeys(msg, TOP_KEYS).length > 0) return fail('unknown_message_field');

  const ev = msg.event;
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return fail('missing_event');
  if (!Object.hasOwn(EVENT_KEYS, ev.kind)) return fail('invalid_kind');
  if (extraKeys(ev, EVENT_KEYS[ev.kind]).length > 0) return fail('unknown_event_field');

  if (ev.kind === 'mouse') {
    if (!MOUSE_TYPES.has(ev.eventType)) return fail('invalid_event_type');
    const x = coord(ev.x);
    const y = coord(ev.y);
    if (x === null || y === null) return fail('invalid_coordinates');
    let button = 'none';
    if (ev.button !== undefined) {
      if (!BUTTONS.has(ev.button)) return fail('invalid_button');
      button = ev.button;
    }
    if (ev.eventType !== 'mouseMoved' && !BUTTONS_REQUIRED.has(button)) return fail('button_required');
    return { ok: true, event: { kind: 'mouse', eventType: ev.eventType, x, y, button } };
  }

  if (ev.kind === 'key') {
    if (!KEY_TYPES.has(ev.eventType)) return fail('invalid_event_type');
    if (typeof ev.key !== 'string' || ev.key.length === 0 || ev.key.length > MAX_KEY_CHARS) return fail('invalid_key');
    if (typeof ev.code !== 'string' || !CODE_RE.test(ev.code)) return fail('invalid_code');
    return { ok: true, event: { kind: 'key', eventType: ev.eventType, key: ev.key, code: ev.code } };
  }

  if (ev.kind === 'wheel') {
    if (ev.eventType !== undefined && ev.eventType !== 'wheel') return fail('invalid_event_type');
    const x = coord(ev.x);
    const y = coord(ev.y);
    if (x === null || y === null) return fail('invalid_coordinates');
    const dx = ev.deltaX === undefined ? 0 : ev.deltaX;
    const dy = ev.deltaY === undefined ? 0 : ev.deltaY;
    const okDelta = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_DELTA;
    if (!okDelta(dx) || !okDelta(dy)) return fail('invalid_delta');
    return { ok: true, event: { kind: 'wheel', x, y, deltaX: Math.round(dx), deltaY: Math.round(dy) } };
  }

  return fail('invalid_kind');
}
