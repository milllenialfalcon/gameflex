import { classifyHost } from '../src/config.mjs';

// Egress policy for the in-container browser. Everything not explicitly allowed
// is aborted, so a game page cannot:
//   - navigate the player somewhere else (off-origin documents are refused)
//   - reach loopback / LAN / link-local / metadata endpoints
//   - open popups or trigger downloads
// Residual risk (documented, not solved here): a hostname that is on the
// allowlist and later resolves to a private address (DNS rebinding).
const NET_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:']);
const INERT_SCHEMES = new Set(['about:', 'blob:', 'data:', 'chrome-extension:']);

export function originOf(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (NET_SCHEMES.has(u.protocol)) {
      const proto = u.protocol === 'ws:' ? 'http:' : u.protocol === 'wss:' ? 'https:' : u.protocol;
      return { origin: `${proto}//${u.host}`, host: u.hostname, scheme: u.protocol };
    }
    return { origin: null, host: u.hostname, scheme: u.protocol };
  } catch {
    return { origin: null, host: '', scheme: 'invalid' };
  }
}

export function decideRequest(rawUrl, { allowedOrigins }) {
  const { origin, host, scheme } = originOf(rawUrl);
  if (scheme === 'invalid') return { allow: false, reason: 'unparseable_url' };
  if (INERT_SCHEMES.has(scheme)) return { allow: true, reason: 'inert_scheme' };
  if (!NET_SCHEMES.has(scheme)) return { allow: false, reason: `scheme_denied:${scheme}` };
  const privateKind = classifyHost(host);
  if (privateKind) return { allow: false, reason: `private_target:${privateKind}` };
  if (!allowedOrigins.includes(origin)) return { allow: false, reason: 'origin_denied' };
  return { allow: true, reason: 'origin_allowed' };
}

export async function installEgressPolicy(context, page, { allowedOrigins, onBlock = () => {} }) {
  await context.route('**/*', async (route) => {
    const decision = decideRequest(route.request().url(), { allowedOrigins });
    if (decision.allow) return route.continue();
    onBlock(decision.reason, route.request().url());
    return route.abort('blockedbyclient');
  });

  // Popups and off-origin document swaps are dropped: each one would be an
  // unauthenticated browsing context outside the game origin.
  context.on('page', (extraPage) => {
    if (extraPage !== page) {
      onBlock('popup_blocked', extraPage.url());
      extraPage.close().catch(() => {});
    }
  });

  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const { origin } = originOf(frame.url());
    if (origin && !allowedOrigins.includes(origin)) onBlock('main_frame_off_origin', frame.url());
  });

  page.on('download', (download) => {
    onBlock('download_blocked', download.url());
    download.cancel().catch(() => {});
  });

  return { allowedOrigins };
}

export async function denyDownloads(cdp) {
  try {
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny', eventsEnabled: true });
  } catch {
    /* older protocol revision: acceptDownloads:false already covers it */
  }
}
