import fs from 'node:fs';
import { chromium } from 'playwright';

// Chromium runs with its OWN sandbox enabled (Playwright: chromiumSandbox:true,
// which *adds* the sandbox - the default in Playwright is no sandbox at all).
// This module proves the sandbox is actually engaged, and fails loudly if it is
// not: the runner never falls back to an unsandboxed browser.
//
// Evidence, all read from inside the session container:
//  1. chrome://sandbox -> Chromium's own namespace / seccomp layer report
//  2. no process may carry --no-sandbox
//  3. at least one child process must live in a PID or NET namespace other than
//     the browser's, which is the visible effect of the namespace sandbox
export function readProcs() {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync('/proc'); } catch { return out; }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let cmdline = '';
    try { cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, 'utf8'); } catch { continue; }
    if (!cmdline.includes('chrom')) continue;
    const ns = {};
    for (const name of ['user', 'pid', 'net', 'mnt']) {
      try { ns[name] = fs.readlinkSync(`/proc/${entry}/ns/${name}`); } catch { ns[name] = null; }
    }
    out.push({ pid: Number(entry), cmdline: cmdline.split('\u0000').filter(Boolean).join(' '), ns });
  }
  return out;
}

export function analyse(procs) {
  const browser = procs.find((p) => /chrome(-linux64)?\/chrome/.test(p.cmdline) && !p.cmdline.includes('crashpad') && !p.cmdline.includes('--type=')) || null;
  const noSandboxFlags = procs.filter((p) => /(^|\s)--no-sandbox(\s|$)/.test(p.cmdline));
  const isolatedPidNs = browser && browser.ns.pid
    ? procs.filter((p) => p.ns.pid && p.ns.pid !== browser.ns.pid)
    : [];
  const isolatedNetNs = browser && browser.ns.net
    ? procs.filter((p) => p.ns.net && p.ns.net !== browser.ns.net)
    : [];
  return { browser, noSandboxFlags, isolatedPidNs, isolatedNetNs };
}

export async function verifySandbox({ selfTest = false } = {}) {
  const started = Date.now();
  const browser = await chromium.launch({
    channel: 'chromium',
    headless: true,
    chromiumSandbox: !selfTest,                      // selfTest forces the unsandboxed control
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--mute-audio',
      '--hide-scrollbars',
    ],
  });

  const context = await browser.newContext({ viewport: { width: 320, height: 200 } });
  const page = await context.newPage();
  const pixelAlpha = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillRect(0, 0, 8, 8);
    return ctx.getImageData(0, 0, 1, 1).data[3];
  });
  const userAgent = await page.evaluate(() => navigator.userAgent);

  const procs = readProcs();
  const { browser: browserProc, noSandboxFlags, isolatedPidNs, isolatedNetNs } = analyse(procs);
  const sandboxPage = await readChromeSandboxPage(browser);
  const sandboxPageText = typeof sandboxPage === 'string' ? sandboxPage : '';
  const sandboxPageSaysAdequate = /adequately sandboxed/i.test(sandboxPageText);
  const sandboxPageSaysNone = /not sandboxed|sandbox is not|no sandbox/i.test(sandboxPageText);

  const evidence = {
    launchMs: Date.now() - started,
    selfTest,
    chromiumVersion: browser.version(),
    userAgent,
    pixelAlpha,
    chromeSandboxPage: sandboxPage,
    sandboxPageSaysAdequate,
    processesSeen: procs.length,
    noSandboxFlagsFound: noSandboxFlags.length,
    browserPidNs: browserProc ? browserProc.ns.pid : null,
    childProcessesInOtherPidNs: isolatedPidNs.length,
    childProcessesInOtherNetNs: isolatedNetNs.length,
  };

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  const failures = [];
  if (pixelAlpha === undefined || pixelAlpha === null) failures.push('renderer_did_not_render');
  if (!browserProc) failures.push('browser_process_not_found');
  if (noSandboxFlags.length > 0) failures.push('no_sandbox_flag_present');
  if (sandboxPageSaysNone) failures.push('chromium_reports_not_sandboxed');
  if (isolatedPidNs.length === 0 && isolatedNetNs.length === 0) failures.push('no_namespace_isolated_child');
  if (!sandboxPageSaysAdequate && isolatedPidNs.length === 0) failures.push('no_positive_sandbox_evidence');

  return { ok: failures.length === 0, failures, evidence };
}

// Best-effort: chrome://sandbox is not always reachable from an automated
// session. When it is, its text is the strongest single piece of evidence.
async function readChromeSandboxPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto('chrome://sandbox', { timeout: 5_000, waitUntil: 'domcontentloaded' });
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+\n/g, '\n').slice(0, 2_000));
    await context.close();
    return text;
  } catch (err) {
    await context.close().catch(() => {});
    return `unavailable: ${String(err && err.message).split('\n')[0]}`;
  }
}

if (process.argv[1] && process.argv[1].endsWith('sandbox-check.mjs')) {
  const selfTest = process.env.SANDBOX_CHECK_SELF_TEST === '1';
  const result = await verifySandbox({ selfTest });
  console.log(JSON.stringify(result, null, 2));
  if (selfTest) {
    // Fault injection: an unsandboxed launch MUST be detected.
    const detected = !result.ok;
    console.log(detected ? 'SELF_TEST_OK: unsandboxed launch was detected' : 'SELF_TEST_FAILED: checker is a rubber stamp');
    process.exit(detected ? 0 : 1);
  }
  process.exit(result.ok ? 0 : 3);
}
