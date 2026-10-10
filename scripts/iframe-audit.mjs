#!/usr/bin/env node
/**
 * gameflex iframe compatibility audit (Hermes QA worker).
 *
 * Purpose: bounded, rerunnable evidence gathering for whether each published
 * catalogue destination produces a document inside a sandboxed cross-origin
 * iframe configured like the intended in-site player.
 *
 * Scope limits (honest by design):
 *  - Observes a document/loader. It does NOT confirm gameplay, and it does NOT
 *    infer hosting/streaming/embedding permission.
 *  - Performs zero clicks. No account creation, no proprietary file supply.
 *  - Refuses to keep downloading media once the session asset budget is passed.
 *
 * Owned by the QA worker: scripts/iframe-audit.mjs, docs/iframe-audit.{json,md},
 * artifacts/iframe-audit/** (git-ignored).
 *
 * Run:  node scripts/iframe-audit.mjs [--ids=id1,id2] [--concurrency=3]
 */

import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- constants

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const HOST = '127.0.0.1';
const PORT = 4174;
const HARNESS_ORIGIN = `http://${HOST}:${PORT}`;

const EDGE_BIN = process.env.GAMEFLEX_EDGE
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const PW_ENTRY = process.env.GAMEFLEX_PLAYWRIGHT_ENTRY
  || 'file:///C:/Users/avizo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

/** iframe container flags — mirror of the intended player configuration. */
const SANDBOX_FLAGS = ['allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-pointer-lock'];
const PERMISSIONS_POLICY = ['fullscreen', 'autoplay', 'gamepad'];
/** Requested through Playwright too, but empirically unsupported (recorded). */
const REQUESTED_GRANTS = ['fullscreen', 'autoplay', 'gamepad'];

const PAGE_BUDGET_MS = Number(process.env.GAMEFLEX_PAGE_BUDGET_MS || 12000);
const PREFLIGHT_TIMEOUT_MS = 8000;
const CONCURRENCY = Number(process.env.GAMEFLEX_CONCURRENCY || 3);
const ASSET_BUDGET_BYTES = Number(process.env.GAMEFLEX_ASSET_BUDGET_BYTES || 50 * 1024 * 1024);
/** Hard-stop network once the asset budget is passed (set to 0 to only observe). */
const ENFORCE_BUDGET = process.env.GAMEFLEX_ENFORCE_BUDGET !== '0';
/** Refuse known large-asset resources once this fraction of the budget is spent. */
const PREBODY_GUARD_RATIO = Number(process.env.GAMEFLEX_PREBODY_GUARD_RATIO || 0.15);
const OVERSIZE_RESOURCE_TYPES = new Set(['media']);
const OVERSIZE_URL_HINT = /\.(zip|gz|tgz|tar|7z|rar|iso|xiso|mp4|webm|wasm|data|pak|pk3|pk4|wad|mpq|bin|cso|chd)(\?|#|$)/i;
/** Declared sizes are not measured wire bytes. Stated once, reused in both outputs. */
const BYTE_ACCOUNTING_CAVEAT = 'Bytes are estimates: the sum of declared response Content-Length headers, cross-checked against Playwright request.sizes() responseBodySize, reported as the larger of the two. These are not measured transferred bytes — compressed, chunked or header-less responses are missed, WebSocket traffic is not counted, and the same bytes may be counted once per observed response.';

const VIEWPORT = { width: 1360, height: 820 };
const IFRAME_BOX = { width: 1280, height: 720 };
/** Gap between the two DOM samples used to detect a live runtime. */
const ACTIVITY_WINDOW_MS = 1200;

const OUT_JSON = path.join(ROOT, 'docs', 'iframe-audit.json');
const OUT_MD = path.join(ROOT, 'docs', 'iframe-audit.md');
const ART_DIR = path.join(ROOT, 'artifacts', 'iframe-audit');

const SKIPPED_TERMS = {
  wasmarcade: 'Publisher terms explicitly prohibit embedding their pages; no frame navigation attempted. Recorded from the pinned player configuration, not re-tested.',
};

const CLASSIFICATIONS = [
  'frame_document_observed',
  'blocked',
  'error',
  'timeout',
  'skipped_terms',
];

// ---------------------------------------------------------------- patterns

const SECURITY_PATTERNS = [
  /content security policy/i, /frame-ancestors/i, /refused to (frame|display|load|connect|run)/i,
  /x-frame-options/i, /sandbox/i, /mixed content/i, /permission/i, /blocked/i,
  /cross-origin/i, /shared ?array ?buffer/i, /not allowed/i, /access to .* has been blocked/i,
];
const WASM_WORKER_PATTERNS = [
  /webassembly/i, /wasm/i, /\.worker|worker\.js|new worker/i, /out of memory|memory access out of bounds|rangeerror/i,
  /failed to fetch|net::err/i, /compile/i, /compilestreaming/i,
];
const OWN_FILE_PATTERNS = [
  /select (your|a|the) (file|game|iso|image|rom)/i, /choose file/i, /upload/i, /browse/i,
  /\.iso\b/i, /\.xiso\b/i, /\.mpq\b/i, /your own (copy|files|game)/i, /game (files|data) (are )?(required|needed|missing)/i,
  /\.tar\.gz/i, /drag (and|&) drop/i, /pick a (file|folder)/i,
];
const LOADER_PATTERNS = [
  /loading/i, /preparing/i, /downloading/i, /fetching/i, /please wait/i, /initializing/i, /compiling/i,
];
/** Behaviour that matters to reviewers and is separate from "did a document render". */
const NOTABLE_PATTERNS = [
  ['cross_origin_isolation_required', /coop\/coep|cross-origin isolation|crossoriginisolated|sharedarraybuffer/i],
  ['cross_origin_focus_blocked', /blocked autofocusing/i],
  ['app_install_prompt', /install (the app|on iphone|on android|on your|app)|add to home screen|home-?screen install/i],
  ['account_or_signin_ui', /sign in|log ?in|create account|register|log-in/i],
  ['threaded_wasm', /pthread|threads?\b.*wasm|wasm.*threads?/i],
  ['http_auth_or_limit_error', /\b(401|403|429)\b/i],
];
const AD_HOST_PATTERN = /googleads|googlesyndication|doubleclick|adservice|adsystem|taboola|outbrain/i;

// ---------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browserVersion = 'unknown';

const nowIso = () => new Date().toISOString();
const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };
const clip = (s, n = 300) => (typeof s === 'string' ? (s.length > n ? `${s.slice(0, n)}…` : s) : s);
const budgetMb = (rec) => Math.round((rec.assetBytes?.responseBodyBytes || 0) / (1024 * 1024));

function matchAny(text, patterns) {
  if (!text) return [];
  return patterns.filter((re) => re.test(text)).map(String);
}

/** Extract frame-ancestors directive out of a CSP header, if present. */
function frameAncestors(csp) {
  if (!csp) return null;
  const m = csp.match(/frame-ancestors([^;]*)/i);
  return m ? m[1].trim() : null;
}

function findEdge() {
  const candidates = [EDGE_BIN, 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  return candidates.find((p) => existsSync(p)) || null;
}

function readCatalogue() {
  const file = path.join(ROOT, 'dist', 'games.json');
  return readFile(file, 'utf8').then((raw) => JSON.parse(raw));
}

// ---------------------------------------------------------------- harness

function harnessHtml(game) {
  const sandbox = SANDBOX_FLAGS.join(' ');
  const allow = PERMISSIONS_POLICY.join('; ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>gameflex iframe audit harness — ${game.id}</title>
<style>
  html,body{margin:0;padding:0;background:#16181c;color:#eaeae5;font:13px/1.4 monospace}
  iframe{display:block;border:0;background:#000;width:${IFRAME_BOX.width}px;height:${IFRAME_BOX.height}px}
</style>
</head>
<body>
<iframe id="game" title="${game.id}"
  src="${game.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"
  sandbox="${sandbox}"
  allow="${allow}"
  referrerpolicy="no-referrer"
  loading="eager"></iframe>
</body>
</html>`;
}

function startHarnessServer(games) {
  const byId = new Map(games.map((g) => [g.id, g]));
  const server = createServer((req, res) => {
    const url = new URL(req.url, HARNESS_ORIGIN);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>iframe audit harness</title>
<h1>gameflex iframe audit harness</h1>
<p>Sandbox: <code>${SANDBOX_FLAGS.join(' ')}</code><br>Permissions policy: <code>${PERMISSIONS_POLICY.join('; ')}</code></p>
<ul>${games.map((g) => `<li><a href="/h/${g.id}">/h/${g.id}</a> — ${g.url}</li>`).join('')}</ul>`);
      return;
    }
    const m = url.pathname.match(/^\/h\/([a-z0-9_-]+)$/i);
    if (m && byId.has(m[1])) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(harnessHtml(byId.get(m[1])));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

// ---------------------------------------------------------------- preflight

/** Header-only probe. Presence of a prohibition is evidence; absence proves nothing. */
async function preflight(url) {
  const startedAt = nowIso();
  const out = { startedAt, requestUrl: url, ok: false };
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gameflex-iframe-audit' },
    });
    out.ok = true;
    out.status = res.status;
    out.finalUrl = res.url;
    out.contentType = res.headers.get('content-type');
    out.xFrameOptions = res.headers.get('x-frame-options');
    const csp = res.headers.get('content-security-policy');
    out.cspFrameAncestors = frameAncestors(csp);
    out.cspPresent = Boolean(csp);
    out.location = res.headers.get('location');
    await res.body?.cancel().catch(() => {});
  } catch (err) {
    out.error = clip(String(err?.message || err), 240);
  } finally {
    out.finishedAt = nowIso();
  }
  return out;
}

// ---------------------------------------------------------------- in-frame sample

const SAMPLE_FN = () => {
  const visible = (el) => {
    try {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0;
    } catch { return false; }
  };
  const all = Array.from(document.querySelectorAll('*'));
  const canvases = Array.from(document.querySelectorAll('canvas'));
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    elementCount: all.length,
    visibleElementCount: all.filter(visible).length,
    canvasCount: canvases.length,
    sizedCanvases: canvases.filter((c) => c.width > 0 && c.height > 0).map((c) => `${c.width}x${c.height}`).slice(0, 6),
    fileInputs: document.querySelectorAll('input[type=file]').length,
    scriptCount: document.scripts.length,
    webAssemblyAvailable: typeof WebAssembly !== 'undefined',
    bodyTextLength: text.length,
    bodyText: text.slice(0, 800),
    documentScrollHeight: document.documentElement?.scrollHeight ?? null,
  };
};

// ---------------------------------------------------------------- one game

async function auditGame({ browser, game, resultsDir }) {
  const record = {
    id: game.id,
    title: game.title,
    url: game.url,
    ownFiles: Boolean(game.ownFiles),
    startedAt: nowIso(),
    classification: 'error',
    classificationReason: '',
    clicksPerformed: 0,
    frameDestination: null,
    frameHttpStatus: null,
    preflight: null,
    dom: null,
    activity: null,
    visual: null,
    consoleSecurity: [],
    consoleWasmWorker: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    popupsBlocked: 0,
    downloadsBlocked: 0,
    topNavigationAttempts: 0,
    ownFilePrompt: { detected: false, matches: [], fileInputs: null },
    ownFileEvidenceSource: null,
    notableMessages: [],
    hosts: null,
    assetBytes: { responseBodyBytes: 0, requestCount: 0, budgetBytes: ASSET_BUDGET_BYTES, budgetExceeded: false, measurement: 'max(sum of playwright request.sizes().responseBodySize, sum of response content-length headers) observed on the page target' },
    timings: {},
    limitations: [],
  };

  let context = null;
  let page = null;
  const consoleLog = [];
  const hosts = new Map();

  // Header-only preflight runs before the browser budget starts, so the 12s
  // observation window is not consumed by the probe.
  record.preflight = await preflight(game.url);
  record.preflight.host = hostOf(game.url);

  const t0 = Date.now();

  try {
    context = await browser.newContext({
      viewport: VIEWPORT,
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      serviceWorkers: 'allow',
    });

    // Playwright rejects these names (unknown permission). Record the real result.
    record.permissionsGrant = { requested: REQUESTED_GRANTS, granted: [], method: '' };
    try {
      await context.grantPermissions(REQUESTED_GRANTS);
      record.permissionsGrant.granted = [...REQUESTED_GRANTS];
      record.permissionsGrant.method = 'browserContext.grantPermissions';
    } catch (err) {
      record.permissionsGrant.error = clip(String(err?.message || err), 200);
      record.permissionsGrant.method = 'iframe allow attribute + launch flags (grantPermissions rejects these names)';
    }

    page = await context.newPage();
    const state = { bytes: 0, headerBytes: 0, responses: 0, abortedAfterBudget: 0, preBodyRejections: 0, budgetExceeded: false };

    const updateBytes = () => {
      const total = Math.max(state.bytes, state.headerBytes);
      record.assetBytes.responseBodyBytes = total;
      record.assetBytes.requestCount = state.responses;
      if (total > ASSET_BUDGET_BYTES) {
        state.budgetExceeded = true;              // drives the route guard below
        record.assetBytes.budgetExceeded = true;  // serialised evidence
      }
    };

    page.on('request', (req) => {
      const host = hostOf(req.url());
      if (!host) return;
      hosts.set(host, (hosts.get(host) || 0) + 1);
    });

    if (ENFORCE_BUDGET) {
      record.assetBytes.enforced = true;
      await page.route('**/*', async (route) => {
        const req = route.request();
        if (state.budgetExceeded) {
          // Budget already passed: no new request body is allowed through.
          state.abortedAfterBudget += 1;
          record.assetBytes.abortedAfterBudget = state.abortedAfterBudget;
          try { await route.abort('blockedbyclient'); } catch { /* noop */ }
          return;
        }
        // Pre-body guard. Playwright's route handler cannot see a response's
        // declared Content-Length before its body, so a known large-asset
        // resource is refused once the remaining budget is small, rather than
        // letting one oversized body overshoot the budget.
        const remaining = ASSET_BUDGET_BYTES - Math.max(state.bytes, state.headerBytes);
        const looksOversize = OVERSIZE_RESOURCE_TYPES.has(req.resourceType()) || OVERSIZE_URL_HINT.test(req.url());
        if (remaining <= ASSET_BUDGET_BYTES * PREBODY_GUARD_RATIO && looksOversize) {
          state.preBodyRejections += 1;
          record.assetBytes.preBodyRejections = state.preBodyRejections;
          try { await route.abort('blockedbyclient'); } catch { /* noop */ }
          return;
        }
        try { await route.continue(); } catch { /* noop */ }
      });
    } else {
      record.assetBytes.enforced = false;
    }

    page.on('response', (resp) => {
      const cl = Number(resp.headers()['content-length'] || 0);
      if (Number.isFinite(cl) && cl > 0) { state.headerBytes += cl; state.responses += 1; updateBytes(); }
      if (resp.request().resourceType() !== 'document') return;
      const u = resp.url();
      if (u.startsWith(HARNESS_ORIGIN)) return;
      record.frameHttpStatus = { status: resp.status(), url: clip(u, 200), at: new Date().toISOString() };
    });

    page.on('console', (msg) => {
      const entry = {
        at: new Date().toISOString(),
        type: msg.type(),
        text: clip(msg.text(), 400),
        location: msg.location()?.url || null,
      };
      consoleLog.push(entry);
      if (msg.type() === 'error') record.consoleErrors.push(entry);
      const haystack = `${entry.text} ${entry.location || ''}`;
      const sec = matchAny(haystack, SECURITY_PATTERNS);
      if (sec.length) record.consoleSecurity.push({ ...entry, matched: sec });
      const ww = matchAny(haystack, WASM_WORKER_PATTERNS);
      if (ww.length) record.consoleWasmWorker.push({ ...entry, matched: ww });
    });

    page.on('pageerror', (err) => {
      record.pageErrors.push({ at: new Date().toISOString(), message: clip(String(err?.message || err), 400) });
    });

    page.on('requestfailed', (req) => {
      record.failedRequests.push({
        at: new Date().toISOString(),
        url: clip(req.url(), 200),
        resourceType: req.resourceType(),
        failure: req.failure()?.errorText || null,
      });
    });

    page.on('requestfinished', (req) => {
      try {
        const body = req.sizes()?.responseBodySize || 0;
        if (body > 0) {
          state.bytes += body;
          state.responses += 1;
          record.assetBytes.requestCount = state.responses;
          updateBytes();
        }
      } catch { /* sizes() unsupported on some targets */ }
    });

    page.on('popup', async (popup) => {
      record.popupsBlocked += 1;
      await popup.close().catch(() => {});
    });
    page.on('download', async (dl) => {
      record.downloadsBlocked += 1;
      await dl.cancel().catch(() => {});
    });
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame() && !f.url().startsWith(HARNESS_ORIGIN) && f.url() !== 'about:blank') {
        record.topNavigationAttempts += 1;
      }
    });

    const tHarness = Date.now();
    const harnessUrl = `${HARNESS_ORIGIN}/h/${game.id}`;

    await page.goto(harnessUrl, { waitUntil: 'commit', timeout: PAGE_BUDGET_MS }).catch((err) => {
      record.limitations.push(`harness navigation: ${clip(String(err?.message || err), 160)}`);
    });
    record.timings.harnessCommitMs = Date.now() - tHarness;

    // Wait for the child frame to appear (and leave about:blank).
    let frame = null;
    const deadline = t0 + PAGE_BUDGET_MS;
    while (Date.now() < deadline) {
      const child = page.frames().find((f) => f !== page.mainFrame());
      if (child) {
        frame = frame || child;
        if (!/^about:blank/.test(child.url())) { frame = child; break; }
      }
      if (record.assetBytes.budgetExceeded) break;
      await sleep(200);
    }

    if (frame) {
      record.timings.frameObservedMs = Date.now() - tHarness;
      await frame.waitForLoadState('load', { timeout: Math.max(400, deadline - Date.now()) }).catch(() => {
        record.limitations.push('child frame did not reach load state inside the page budget');
      });
    } else {
      record.limitations.push('no child frame attached inside the page budget');
    }

    // Drain most of the budget, then take two samples ~1.2s apart so a running
    // render loop can be told apart from a frozen loader.
    const sampleAt = deadline - ACTIVITY_WINDOW_MS;
    while (Date.now() < sampleAt && !record.assetBytes.budgetExceeded) await sleep(150);
    record.timings.observationMs = Date.now() - tHarness;

    // Capture destination from the frame that actually attached.
    if (frame) record.frameDestination = frame.url();

    // DOM sample inside the game frame.
    if (frame) {
      try {
        record.dom = await frame.evaluate(SAMPLE_FN);
      } catch (err) {
        record.limitations.push(`frame DOM sample blocked: ${clip(String(err?.message || err), 200)}`);
      }
    }

    if (frame && Date.now() < deadline) {
      await sleep(Math.max(0, Math.min(ACTIVITY_WINDOW_MS, deadline - Date.now())));
      try {
        const second = await frame.evaluate(SAMPLE_FN);
        const a = JSON.stringify(record.dom?.sizedCanvases || []);
        const b = JSON.stringify(second.sizedCanvases || []);
        record.activity = {
          windowMs: ACTIVITY_WINDOW_MS,
          canvasSizesChanged: a !== b,
          elementCountDelta: (second.elementCount || 0) - (record.dom?.elementCount || 0),
          bodyTextChanged: (second.bodyText || '') !== (record.dom?.bodyText || ''),
          secondSampleSizedCanvases: second.sizedCanvases,
          note: 'DOM deltas across a ~1.2s window. Indicates a live runtime/loader, not confirmed gameplay.',
        };
      } catch (err) {
        record.activity = { windowMs: ACTIVITY_WINDOW_MS, observed: false, note: clip(String(err?.message || err), 160) };
      }
    }

    // Visual evidence (screenshot stays in git-ignored artifacts).
    const shot = path.join(resultsDir, `${game.id}.png`);
    try {
      await page.screenshot({ path: shot, fullPage: false });
      record.visual = { screenshot: path.relative(ROOT, shot).replace(/\\/g, '/'), capturedAt: nowIso(), viewport: VIEWPORT, iframeBox: IFRAME_BOX };
    } catch (err) {
      record.limitations.push(`screenshot failed: ${clip(String(err?.message || err), 160)}`);
    }

    record.timings.totalMs = Date.now() - t0;
  } catch (err) {
    record.limitations.push(`audit exception: ${clip(String(err?.message || err), 300)}`);
  } finally {
    try { await context?.close(); } catch { /* noop */ }
    try {
      await writeFile(path.join(resultsDir, `${game.id}.console.log`), consoleLog.map((e) => `${e.at} [${e.type}] ${e.text}${e.location ? ` @ ${e.location}` : ''}`).join('\n') || '(no console output)', 'utf8');
    } catch { /* noop */ }
  }

  // ---- own-file prompt evidence (never clicked, never supplied)
  const haystack = [
    record.dom?.bodyText || '',
    ...record.consoleErrors.map((c) => c.text),
    ...record.consoleSecurity.map((c) => c.text),
  ].join(' \n ');
  const ownMatches = matchAny(haystack, OWN_FILE_PATTERNS);
  record.ownFilePrompt.matches = ownMatches.map((m) => clip(m, 80));
  record.ownFilePrompt.fileInputs = record.dom?.fileInputs ?? null;
  record.ownFilePrompt.detected = Boolean((record.dom?.fileInputs || 0) > 0 || ownMatches.length);
  record.ownFileEvidenceSource = record.dom ? 'frame DOM text/file inputs (+ console text)' : 'console text only (no frame DOM)';

  // ---- notable messages (prerequisites / cross-origin behaviour), recorded separately
  for (const [label, re] of NOTABLE_PATTERNS) {
    if (re.test(haystack)) {
      const sample = haystack.split('\n').find((l) => re.test(l)) || '';
      record.notableMessages.push({ label, sample: clip(sample.trim(), 200) });
    }
  }
  void hosts;

  // ---- observed hosts (third-party asset/ad hosts are review-relevant)
  record.hosts = {
    total: hosts.size,
    adLike: [...hosts.keys()].filter((h) => AD_HOST_PATTERN.test(h)),
    list: [...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([host, count]) => ({ host, requests: count })),
  };

  // ---- visual tier (DOM/loader derived, never a gameplay confirmation)
  const loaderMatches = matchAny(record.dom?.bodyText || '', LOADER_PATTERNS);
  const sizedCanvas = (record.dom?.sizedCanvases || []).length > 0;
  if (!record.dom) record.visualTier = 'no_dom_observed';
  else if (sizedCanvas && record.activity?.canvasSizesChanged) record.visualTier = 'canvas_present_and_changing';
  else if (sizedCanvas && loaderMatches.length === 0) record.visualTier = 'canvas_present_static';
  else if (loaderMatches.length > 0) record.visualTier = 'loader_or_loading_text';
  else if (record.dom.visibleElementCount > 0) record.visualTier = 'page_ui_observed';
  else record.visualTier = 'empty_document';
  record.visualTierNote = 'Derived from frame DOM/console only. Not a gameplay confirmation; a human observer is required for that. No automated vision analysis of the screenshots was performed.';

  // ---- classification
  const dest = record.frameDestination;
  const destHost = hostOf(dest || '');
  const targetHost = hostOf(game.url);
  const destIsError = !dest || /^chrome-error:|^about:blank|^edge-error:/.test(dest);
  const blockedSignal = [
    record.classificationReason,
    record.preflight?.xFrameOptions ? `x-frame-options: ${record.preflight.xFrameOptions}` : '',
    record.preflight?.cspFrameAncestors ? `frame-ancestors ${record.preflight.cspFrameAncestors}` : '',
    ...record.failedRequests.map((f) => f.failure || ''),
    ...record.consoleSecurity.map((c) => c.text),
    ...record.limitations,
  ].join(' ');
  const explicitBlock = /ERR_BLOCKED_BY_RESPONSE|x-frame-options|frame-ancestors|Refused to display/i.test(blockedSignal);

  if (record.dom && record.dom.elementCount > 0) {
    record.classification = 'frame_document_observed';
    record.classificationReason = `document rendered inside the sandboxed frame (${record.dom.elementCount} elements, ${record.dom.visibleElementCount} visible, ${record.dom.canvasCount} canvas)`;
    if (record.assetBytes.budgetExceeded) {
      record.classificationReason += `; session asset budget exceeded at ${budgetMb(record)} MB (estimate)${record.assetBytes.enforced ? ' — further requests aborted' : ' — cancellation not established'}`;
      record.limitations.push(record.assetBytes.enforced
        ? `asset budget exceeded: ${budgetMb(record)} MB (estimate) against the ${budgetMb({ assetBytes: { responseBodyBytes: ASSET_BUDGET_BYTES } })} MB budget; subsequent requests were aborted, so the observed document state is an early snapshot`
        : `asset budget exceeded: ${budgetMb(record)} MB (estimate) against the ${budgetMb({ assetBytes: { responseBodyBytes: ASSET_BUDGET_BYTES } })} MB budget; enforcement was inactive for this run so the page was not actually prevented from continuing — cancellation not established, and the observed document state is an early snapshot`);
    }
  } else if (record.assetBytes.budgetExceeded) {
    record.classification = 'timeout';
    record.classificationReason = `session asset budget exceeded at ${budgetMb(record)} MB (estimate) before a frame document was observed${record.assetBytes.enforced ? '; further requests aborted' : '; cancellation not established'}`;
  } else if (destIsError && explicitBlock) {
    record.classification = 'blocked';
    record.classificationReason = 'frame refused by response headers / CSP';
  } else if (destIsError) {
    record.classification = 'error';
    record.classificationReason = 'no document in frame (navigation did not produce a frame document)';
  } else if (dest && destHost && targetHost && destHost !== targetHost) {
    record.classification = 'error';
    record.classificationReason = `frame destination host ${destHost} differs from catalogue host ${targetHost}`;
  } else if (Date.now() - t0 >= PAGE_BUDGET_MS - 100) {
    record.classification = 'timeout';
    record.classificationReason = `${PAGE_BUDGET_MS}ms page budget exhausted before a frame document was observed`;
  } else {
    record.classification = 'error';
    record.classificationReason = 'unclassified';
  }

  if (!CLASSIFICATIONS.includes(record.classification)) throw new Error(`bad classification ${record.classification}`);
  record.finishedAt = nowIso();
  return record;
}

// ---------------------------------------------------------------- pool

async function runPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const argIds = process.argv.find((a) => a.startsWith('--ids='))?.slice(6)
    ?.split(',').map((s) => s.trim()).filter(Boolean);

  await mkdir(ART_DIR, { recursive: true });
  await mkdir(path.join(ROOT, 'docs'), { recursive: true });

  const catalogue = await readCatalogue();
  let games = catalogue.map((g) => ({ id: g.id, title: g.title, url: g.url, ownFiles: g.ownFiles }));
  if (argIds) games = games.filter((g) => argIds.includes(g.id));

  const skipped = [];
  const runnable = [];
  for (const g of games) {
    if (SKIPPED_TERMS[g.id]) {
      skipped.push({
        id: g.id, title: g.title, url: g.url, classification: 'skipped_terms',
        classificationReason: SKIPPED_TERMS[g.id], clicksPerformed: 0,
        frameNavigationAttempted: false, startedAt: nowIso(), finishedAt: nowIso(),
      });
      continue;
    }
    runnable.push(g);
  }

  const edge = findEdge();
  if (!edge) throw new Error(`Edge not found. Set GAMEFLEX_EDGE. Tried: ${EDGE_BIN}`);

  const server = await startHarnessServer([...runnable, ...games.filter((g) => SKIPPED_TERMS[g.id])]);
  const { chromium } = await import(PW_ENTRY);

  let browser = null;
  const records = [];
  try {
    browser = await chromium.launch({
      executablePath: edge,
      headless: true,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate,MediaRouter',
        '--autoplay-policy=no-user-gesture-required',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      ],
    });

    browserVersion = browser.version();
    records.push(...await runPool(runnable, (game) => auditGame({ browser, game, resultsDir: ART_DIR }), CONCURRENCY));
  } finally {
    try { await browser?.close(); } catch { /* noop */ }
    await closeServer(server);
  }

  const ordered = games.map((g) => records.find((r) => r.id === g.id) || skipped.find((s) => s.id === g.id));

  const report = {
    schema: 'gameflex.iframe-audit/1',
    generatedAt: nowIso(),
    generatedBy: 'hermes:gameflexqa (scripts/iframe-audit.mjs)',
    catalogueSource: 'dist/games.json',
    hostEnvironment: { os: process.platform, node: process.version, browser: 'Microsoft Edge (headless)', browserVersion: browserVersion, edgeBinary: edge },
    harness: {
      origin: HARNESS_ORIGIN,
      sandbox: SANDBOX_FLAGS,
      permissionsPolicy: PERMISSIONS_POLICY,
      requestedGrants: REQUESTED_GRANTS,
      iframeBox: IFRAME_BOX,
      viewport: VIEWPORT,
      note: 'Cross-origin frame. Harness served from 127.0.0.1, games are remote https origins. The standalone harness mirrors the player sandbox and permission configuration.',
    },
    method: {
      pageBudgetMs: PAGE_BUDGET_MS,
      preflightTimeoutMs: PREFLIGHT_TIMEOUT_MS,
      concurrency: CONCURRENCY,
      assetBudgetBytes: ASSET_BUDGET_BYTES,
      assetBudgetEnforced: ENFORCE_BUDGET,
      byteAccounting: BYTE_ACCOUNTING_CAVEAT,
      assetBudgetEnforcement: {
        enforced: ENFORCE_BUDGET,
        mechanism: 'page.route guard: once the observed estimate passes the budget, every further request is aborted (blockedbyclient); known large-asset resources are additionally refused pre-body once the remaining budget falls below the guard ratio',
        preBodyGuardRatio: PREBODY_GUARD_RATIO,
        knownGap: 'Playwright route handlers cannot read a response Content-Length before its body, so a single oversized body is bounded only by the large-asset guard, not by its declared size. WebSocket traffic bypasses page.route entirely and is not counted or blocked.',
      },
      clicksPerformed: 0,
      classifications: CLASSIFICATIONS,
      limitationsOfMethod: [
        'Frame document presence is not gameplay. No human play was performed.',
        'No permission inference: missing framing headers are not evidence of permission to embed.',
        'Game assets are not downloaded deliberately; a session that exceeds the asset budget stops being observed, and with enforcement active further requests are aborted.',
        BYTE_ACCOUNTING_CAVEAT,
        'Partial duplicate of the byte-accounting caveat: Playwright request.sizes() may not fire at all for cross-origin out-of-process subresources, in which case only declared Content-Length headers contributed to the estimate.',
        'Edge headless (no GPU) may behave differently from a GPU-accelerated desktop browser.',
        'One run per game; no retry. Transient network conditions are not separated from steady state.',
      ],
    },
    summary: {},
    games: ordered,
  };

  const counts = {};
  for (const r of ordered) counts[r.classification] = (counts[r.classification] || 0) + 1;
  report.summary = {
    totalCatalogueUrls: catalogue.length,
    audited: runnable.length,
    skipped: skipped.length,
    counts,
    frameDocumentObserved: ordered.filter((r) => r.classification === 'frame_document_observed').map((r) => r.id),
    assetBudgetExceeded: ordered.filter((r) => r.assetBytes?.budgetExceeded).map((r) => r.id),
    blockedOrErrored: ordered.filter((r) => ['blocked', 'error'].includes(r.classification)).map((r) => r.id),
    timedOut: ordered.filter((r) => r.classification === 'timeout').map((r) => r.id),
    gameplayConfirmed: [],
    gameplayConfirmationNote: 'No entry can appear here from this audit alone. Gameplay requires a human observer; user review remains pending.',
  };

  await writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(OUT_MD, renderMarkdown(report), 'utf8');

  console.log(`iframe audit: ${ordered.length} catalogue URLs — ${JSON.stringify(counts)}`);
  for (const r of ordered) console.log(`  ${r.id.padEnd(14)} ${r.classification.padEnd(24)} ${clip(r.classificationReason, 110)}`);
  console.log(`wrote ${path.relative(ROOT, OUT_JSON)} and ${path.relative(ROOT, OUT_MD)}; screenshots in ${path.relative(ROOT, ART_DIR)}`);
  return report;
}

// ---------------------------------------------------------------- markdown

function renderMarkdown(report) {
  const h = report.harness;
  const rows = report.games.map((r) => {
    const dom = r.dom;
    const detail = dom ? `${dom.elementCount} el / ${dom.visibleElementCount} vis / ${dom.canvasCount} canvas` : '—';
    const sec = r.consoleSecurity?.length ?? 0;
    const wasm = r.consoleWasmWorker?.length ?? 0;
    const fails = r.failedRequests?.length ?? 0;
    const mb = r.assetBytes ? (r.assetBytes.responseBodyBytes / (1024 * 1024)).toFixed(1) : '—';
    return `| ${r.id} | ${r.classification} | ${dom ? 'yes' : 'no'} | ${detail} | ${mb} | ${sec} / ${wasm} / ${fails} | ${r.ownFilePrompt?.detected ? 'yes' : 'no'} | ${r.dom ? r.visualTier : '—'} |`;
  }).join('\n');

  const detail = report.games.map((r) => {
    const lines = [
      `### ${r.id} — ${r.title ?? ''}`,
      '',
      `- URL: ${r.url}`,
      `- Classification: ${r.classification} — ${r.classificationReason}`,
      `- Frame destination: ${r.frameDestination || '(no frame document observed)'}`,
      `- Document HTTP status observed in frame: ${r.frameHttpStatus ? r.frameHttpStatus.status : 'not observed'}; preflight: ${r.preflight ? `status ${r.preflight.status ?? 'n/a'}${r.preflight.xFrameOptions ? `, X-Frame-Options: ${r.preflight.xFrameOptions}` : ', no X-Frame-Options'}${r.preflight.cspFrameAncestors ? `, CSP frame-ancestors ${r.preflight.cspFrameAncestors}` : ''}` : 'not run'}`,
      `- DOM sample: ${r.dom ? `${r.dom.elementCount} elements, ${r.dom.visibleElementCount} visible, ${r.dom.canvasCount} canvas (${(r.dom.sizedCanvases || []).join(', ') || 'none sized'}), ${r.dom.fileInputs} file input(s), WebAssembly ${r.dom.webAssemblyAvailable ? 'present' : 'unavailable'}` : 'not reachable'}`,
      `- Visual tier: ${r.visualTier || 'unknown'} — ${r.visualTierNote || ''}`,
      `- Runtime activity over ~${(r.activity?.windowMs ?? ACTIVITY_WINDOW_MS) / 1000}s: ${r.activity ? `canvas sizes changed: ${r.activity.canvasSizesChanged}, element delta ${r.activity.elementCountDelta}, body text changed: ${r.activity.bodyTextChanged}` : 'not sampled'}`,
      `- Own-file prompt: ${r.ownFilePrompt?.detected ? `detected (${(r.ownFilePrompt.matches || []).join(', ') || `${r.ownFilePrompt.fileInputs} file input(s)`})` : 'not observed'}${r.ownFiles ? ' — catalogue flags ownFiles for this entry' : ''}`,
      `- Notable behaviour: ${r.notableMessages?.length ? r.notableMessages.map((n) => `${n.label} ("${clip(n.sample, 90)}")`).join('; ') : 'none matched'}`,
      `- Hosts contacted: ${r.hosts ? `${r.hosts.total} distinct${r.hosts.adLike.length ? `, ad-like: ${r.hosts.adLike.join(', ')}` : ''}` : 'not tracked'}`,
      `- Console security matches: ${r.consoleSecurity?.length ?? 0}; WebAssembly/worker/network matches: ${r.consoleWasmWorker?.length ?? 0}; failed requests: ${r.failedRequests?.length ?? 0}`,
      `- Popups blocked: ${r.popupsBlocked ?? 0}; downloads blocked: ${r.downloadsBlocked ?? 0}; top-navigation attempts: ${r.topNavigationAttempts ?? 0}; clicks performed: 0`,
      `- Asset bytes observed: ${r.assetBytes ? `${(r.assetBytes.responseBodyBytes / (1024 * 1024)).toFixed(2)} MB (estimate) over ${r.assetBytes.requestCount} responses${r.assetBytes.budgetExceeded ? ` — exceeded the ${r.assetBytes.budgetBytes / (1024 * 1024)} MB budget${r.assetBytes.enforced ? '; further requests aborted' : '; enforcement inactive, cancellation not established'}` : ''}` : '—'}`,
      `- Screenshot: ${r.visual?.screenshot || 'not captured'} (git-ignored, not embedded)`,
      `- Timings: harness commit ${r.timings?.harnessCommitMs ?? '—'} ms, frame observed ${r.timings?.frameObservedMs ?? '—'} ms, observation ${r.timings?.observationMs ?? '—'} ms, total ${r.timings?.totalMs ?? '—'} ms`,
    ];
    if (r.limitations?.length) lines.push(`- Limitations: ${r.limitations.join('; ')}`);
    return lines.join('\n');
  }).join('\n\n');

  return `# Iframe compatibility audit

Generated ${report.generatedAt} by ${report.generatedBy}. Bounded automated observation of every published catalogue destination inside a sandboxed cross-origin frame. Source evidence: \`docs/iframe-audit.json\`; screenshots and raw console logs in the git-ignored \`artifacts/iframe-audit/\`.

## What this does and does not establish

- Establishes: whether the remote page produced a document ("frame document observed"), and what the frame reported about loading, console security messages, failed requests and asset volume inside a ${report.method.pageBudgetMs / 1000}s budget.
- Does **not** establish: gameplay. A visible loader, launch page or canvas is not proof a game is playable. No human play was performed.
- Does **not** infer permission. ${report.harness.note}
- User review remains **pending** for every entry. Nothing here is assistant or user verification of a review decision.

## Method

- Harness: ${h.origin} with sandbox \`${h.sandbox.join(' ')}\` and iframe \`allow="${h.permissionsPolicy.join('; ')}"\`, one cross-origin frame per game, viewport ${h.viewport.width}x${h.viewport.height}, frame box ${h.iframeBox.width}x${h.iframeBox.height}.
- Browser: ${report.hostEnvironment.browser} ${report.hostEnvironment.browserVersion} (headless, no GPU), launched through bundled Playwright.
- Budget: ${report.method.pageBudgetMs} ms per page, concurrency ${report.method.concurrency}, asset budget ${report.method.assetBudgetBytes / (1024 * 1024)} MB per session${report.method.assetBudgetEnforced ? ' (enforcement active: once the estimate passes the budget, further requests are aborted, and known large-asset resources are refused pre-body as the remaining budget runs down)' : ' (enforcement NOT active for this run: the budget was measured, not enforced, so cancellation is not established)'}.
- Asset byte figures: ${report.method.byteAccounting}
- ${report.method.clicksPerformed} clicks were performed: no account creation, no proprietary file supply, no consent dialogs.
- Permission handling: ${report.harness.requestedGrants.join(', ')} were requested through Playwright's \`grantPermissions\`, which rejects these names as unknown; enforcement came from the iframe \`allow\` attribute plus the \`--autoplay-policy=no-user-gesture-required\` launch flag. Recorded per game as \`permissionsGrant\`.

## Summary

${Object.entries(report.summary.counts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
- sessions that exceeded the ${report.method.assetBudgetBytes / (1024 * 1024)} MB asset budget: ${report.summary.assetBudgetExceeded.length ? `${report.summary.assetBudgetExceeded.join(', ')} (estimate; ${report.method.assetBudgetEnforced ? 'further requests aborted' : 'enforcement inactive for this run — cancellation not established'})` : 'none'}
- gameplay confirmed: none (${report.summary.gameplayConfirmationNote})

## Results

| id | classification | frame doc | DOM (elements/visible/canvas) | MB (est.) | sec/wasm/fail | own-file prompt | visual tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Per-game evidence

${detail}
`;
}

main().catch((err) => {
  console.error(`iframe audit failed: ${err?.stack || err}`);
  process.exitCode = 1;
});
