import crypto from 'node:crypto';

export const MAX_TOKEN_CHARS = 512;

export function createToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest();
}

// Only the hash is stored on the session; the plaintext token is returned to the
// caller once and never persisted or logged.
export function tokenMatches(expectedHash, provided) {
  if (typeof provided !== 'string' || provided.length === 0 || provided.length > MAX_TOKEN_CHARS) return false;
  const h = tokenHash(provided);
  return h.length === expectedHash.length && crypto.timingSafeEqual(h, expectedHash);
}

const SECRET_QUERY = /(^|[?&\s])((?:token|access_token|key|apikey|api_key)=)[^&\s"'`]+/gi;
const SECRET_HEADER = /(authorization|x-gameflex-key|sec-websocket-protocol)\s*[:=]\s*\S+/gi;

// Redaction is applied to every log line: the WS handshake carries the token as
// a query parameter (browsers cannot set headers on a WebSocket), so request
// paths and headers must never be logged raw.
export function redact(text) {
  return String(text)
    .replace(SECRET_QUERY, '$1$2[redacted]')
    .replace(SECRET_HEADER, '$1: [redacted]');
}

export function redactUrl(value) {
  try {
    const u = new URL(String(value));
    for (const k of ['token', 'access_token', 'key', 'apikey', 'api_key']) {
      if (u.searchParams.has(k)) u.searchParams.set(k, '[redacted]');
    }
    return redact(u.toString());
  } catch {
    return redact(value);
  }
}

export function timingSafeEqualStrings(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function bearerFrom(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const m = /^Bearer ([^\s]+)$/i.exec(headerValue.trim());
  return m ? m[1] : null;
}
