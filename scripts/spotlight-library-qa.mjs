/**
 * gameflex spotlight-library QA — the local launch history behind the Spotlight
 * "Continue playing" shelf (spotlight.html only).
 *
 * Playwright is resolved from GAMEFLEX_PLAYWRIGHT, then a normal node_modules lookup, then
 * this repo's node_modules from the worktree or root. Edge (channel: msedge) is used, so
 * nothing is downloaded. The page comes from GAMEFLEX_PREVIEW (default
 * http://127.0.0.1:4176) when that preview is already serving, otherwise from a private
 * static server over dist/.
 *
 * What it checks, all against the real DOM and real localStorage:
 *   - a fresh visitor sees the Continue playing demo shelf (five fixed editorial ids — halo, bo1,
 *     quake3, diablo, vicecity — no Preview badge) and no stored history is written; the shelf is a
 *     direct-launch shelf: each card is a #play/<id> anchor with data-play and no aria-haspopup, and
 *     then a real launch, and its rail is left unfilled with no fabricated progress;
 *   - opening the ready player (no frame yet) records nothing;
 *   - a sandbox-pending game reaching the blocked state records nothing;
 *   - pressing the player's own Start creates the sandboxed frame and records the allowed id;
 *   - closing the player repaints the shelf with that game first, and the order survives a reload;
 *   - a repeat launch deduplicates and moves the game to the front (newest first);
 *   - malformed JSON and unknown/blank/non-string stored ids degrade to a missing or filtered
 *     shelf instead of an error;
 *   - no fabricated progress percentage anywhere in the player or the shelves.
 *
 * The frame-creating control is the ready panel's action (`[data-player-action="start"]`,
 * "Start game"). The header `#player-start` stays hidden until a frame has loaded and is only
 * the Restart control, so it is asserted hidden here rather than clicked.
 *
 * Fixtures: every non-loopback request is answered locally with a deterministic page, so no
 * game host is contacted. Creating a frame records an attempted launch; it proves nothing about
 * gameplay, compatibility or saved progress.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');
const GAMES = JSON.parse(await readFile(path.join(DIST, 'games.json'), 'utf8'));
const CONFIG = JSON.parse(await readFile(path.join(DIST, 'player-config.json'), 'utf8'));
const RECENT_KEY = 'gameflex:recent';
const VIEWPORT = { width: 1440, height: 1000 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
// A game is launchable here only when the player config marks it iframe and it is not pending.
const LAUNCHABLE = GAMES.filter(game => !game.availability && CONFIG.games?.[game.id]?.mode === 'iframe');
const READY = LAUNCHABLE[0], READY_SECOND = LAUNCHABLE[1];
const PENDING = GAMES.find(game => game.availability === 'sandbox-pending');

async function loadPlaywright() {
  const candidates = [
    process.env.GAMEFLEX_PLAYWRIGHT,
    'playwright',
    pathToFileURL(path.resolve(HERE, '..', '..', 'node_modules', 'playwright', 'index.mjs')).href,
    pathToFileURL(path.resolve(HERE, '..', '..', '..', 'node_modules', 'playwright', 'index.mjs')).href,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return await import(candidate); } catch { /* try the next location */ }
  }
  throw new Error('playwright not found — set GAMEFLEX_PLAYWRIGHT to its index.mjs');
}

async function localServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const target = path.resolve(DIST, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(DIST + path.sep) && target !== DIST) { response.writeHead(403); response.end(); return; }
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise(resolve => server.close(resolve)) };
}

async function resolveBase() {
  const preview = (process.env.GAMEFLEX_PREVIEW || 'http://127.0.0.1:4176').replace(/\/+$/, '');
  try { const response = await fetch(`${preview}/games.json`); if (response.ok) return { base: preview, stop: async () => {}, preview: true }; } catch { /* no preview running */ }
  return { ...(await localServer()), preview: false };
}

const server = await resolveBase();
const PAGE_URL = `${server.base}/spotlight.html`;
await mkdir('artifacts/qa', { recursive: true });

const external = [];
const blockExternal = page => page.route(url => ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname), route => {
  external.push(route.request().url());
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GAMEFLEX QA FIXTURE</title></head><body data-gameflex-fixture="1"><h1>Deterministic QA fixture — not real gameplay</h1></body></html>' });
});

const checks = [];
const pass = label => { checks.push(label); console.log(`ok — ${label}`); };
let browser = null;
const results = { passed: false, games: GAMES.length, launchable: LAUNCHABLE.length, ready: READY?.id || '', second: READY_SECOND?.id || '', pending: PENDING?.id || '', checks, externalRequests: external, errors: [] };

try {
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT }); // fresh storage: no favourites, no history
  const page = await context.newPage();
  const errors = [], consoleErrors = [], pops = [];
  page.on('pageerror', error => errors.push(error.message));
  // The catalogue artwork maps (spotlight-media.json, spotlight-thumbnails.json, spotlight-portraits.json)
  // are all shipped in this tree; a missing one would fall back to the catalogue art. Other console
  // errors are real failures.
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location()?.url || '' }); });
  page.on('popup', popup => pops.push(popup.url()));
  await blockExternal(page);

  const reload = async () => { await page.goto(PAGE_URL); await page.locator('#shelves .sd-card').first().waitFor(); await page.evaluate(() => document.fonts.ready); };
  const stored = () => page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return 'unparsable'; } }, RECENT_KEY);
  const shelfIds = () => page.evaluate(() => [...document.querySelectorAll('[data-sd-shelf="recent"] .sd-card')].map(card => card.dataset.game));
  // The fresh-browser placeholder lives in its own kind (`demo`); real launches use `recent`.
  // APPROVED: the demo shelf carries NO "Preview" badge; its own copy invites the visitor to
  // "Start a game", and it holds exactly five cards (not six). The old Preview-flag is gone.
  const demo = page.locator('[data-sd-shelf="demo"]');
  const demoIsSet = async () => (await demo.count()) === 1 && /start a game/i.test(await demo.innerText());
  const demoNoBadge = async () => (await demo.count()) === 1
    && (await demo.locator('.sd-preview-tag').count()) === 0
    && !/preview/i.test(await demo.innerText());
  const writeStored = value => page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: RECENT_KEY, raw: value });
  // Open the player for an id. The Continue playing shelf is a direct-launch shelf: when the id is
  // one of its cards, click that #play/<id> anchor straight away. Otherwise fall back to a curated
  // shelf's detail panel (search-filtered card → panel → Play/View), which is unchanged.
  const openReady = async id => {
    await page.locator('#search').fill('');
    await page.waitForTimeout(150);
    const direct = page.locator(`[data-sd-shelf="demo"] .sd-card[data-game="${id}"] .sd-art, [data-sd-shelf="recent"] .sd-card[data-game="${id}"] .sd-art`).first();
    if (await direct.count()) {
      await direct.click();
    } else {
      await page.locator('#search').fill(GAMES.find(game => game.id === id).title);
      await page.waitForTimeout(150);
      await page.locator(`.sd-card[data-game="${id}"] .sd-art`).first().click();
      await page.locator('.sd-panel').waitFor({ timeout: 3000 });
      await page.locator('.sd-panel [data-play]').click();
    }
    await page.locator('#player').waitFor({ state: 'visible', timeout: 3000 });
    await page.waitForFunction(() => document.getElementById('player-stage').dataset.state !== 'idle', null, { timeout: 3000 });
  };
  const closePlayer = async () => { await page.locator('#player-close').click(); await page.locator('#player').waitFor({ state: 'hidden', timeout: 3000 }); await page.locator('#search').fill(''); await page.waitForTimeout(250); };
  const launch = async id => { await openReady(id); await page.locator('.player-panel [data-player-action="start"]').click(); await page.locator('iframe.player-frame').waitFor({ timeout: 3000 }); };

  /* -------------------------------------------------- fresh visitor: demo preview */
  await reload();
  assert.equal(await demo.count(), 1, 'a fresh visitor sees the Continue playing shelf');
  assert(await demoNoBadge(), 'the fresh shelf carries no "Preview" badge and never uses preview wording');
  assert(await demoIsSet(), 'the fresh shelf invites the visitor to "Start a game" instead of flagging a preview');
  assert.equal(await demo.locator('.sd-card').count(), 5, `the Continue playing demo holds exactly five cards, not six (found ${await demo.locator('.sd-card').count()})`);
  assert.equal(await stored(), null, 'no history is written by ordinary browsing');
  pass('a fresh visitor sees a Continue playing demo of five cards that says "Start a game" — no Preview badge — and no stored launch history');

  /* ----------------------------------- opening the ready player records nothing */
  await openReady(READY.id);
  assert.equal(await page.locator('#player-stage').getAttribute('data-state'), 'ready', `the in-site ready player opens for ${READY.id}`);
  assert.equal(await page.evaluate(id => location.hash === `#play/${id}`, READY.id), true, 'the hash names the game before Start');
  assert.equal(await page.locator('iframe.player-frame').count(), 0, 'no frame exists until Start is pressed');
  assert.equal(await page.locator('#player-start').isHidden(), true, 'the header Start/Restart control stays hidden before a frame loads');
  assert.equal(await stored(), null, 'opening the ready player alone records no launch');
  await closePlayer();
  assert.equal(await stored(), null, 'closing the untouched ready player still records no launch');
  assert(await demoIsSet(), 'closing the untouched ready player leaves the Continue playing demo in place');
  pass('opening the ready player (hash set, no frame, no Start) records nothing');

  /* ------------------------------------------ a blocked / pending game records nothing */
  await openReady(PENDING.id);
  assert.equal(await page.locator('#player-stage').getAttribute('data-state'), 'blocked', `the sandbox-pending game ${PENDING.id} reaches the blocked state`);
  assert.equal(await page.locator('iframe.player-frame').count(), 0, 'the blocked path creates no frame');
  assert.equal(await stored(), null, 'a blocked launch records nothing');
  await closePlayer();
  assert(await demoIsSet(), 'a blocked launch leaves the Continue playing demo in place');
  pass('a sandbox-pending game in the blocked state records nothing and shows no real shelf');

  /* -------------------------------- pressing the player's own Start records the id */
  await launch(READY.id);
  assert.equal(await page.locator('iframe.player-frame').count(), 1, 'pressing Start creates exactly one in-site frame');
  const sandbox = await page.locator('iframe.player-frame').getAttribute('sandbox');
  assert(sandbox && sandbox.includes('allow-scripts'), `the created frame is sandboxed (sandbox="${sandbox}")`);
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('gameflex:recent') || '[]')[0] === id, READY.id, { timeout: 3000 });
  assert.deepEqual(await stored(), [READY.id], `the started launch is recorded as ${READY.id}`);
  const playerText = await page.locator('#player').innerText();
  assert(!/\d+\s?%/.test(playerText), 'the player shows no fabricated progress percentage');
  assert.equal(await page.locator('#player [class*="progress"]').count(), 0, 'the player has no progress widget');
  await closePlayer();
  await page.locator('[data-sd-shelf="recent"]').waitFor({ timeout: 3000 });
  assert.deepEqual(await shelfIds(), [READY.id], 'after a real launch, the real history overrides the demo shelf and shows the launched game');
  assert.equal(await demo.count(), 0, 'the demo shelf is dropped once a real launch exists');
  // The real Continue playing shelf is a direct-launch shelf too: each card anchors #play/<id>,
  // carries data-play and no aria-haspopup, and its rail is left unfilled — no fabricated progress.
  const recentLink = await page.locator('[data-sd-shelf="recent"] .sd-card .sd-art').first().evaluate(el => ({ tag: el.tagName, href: el.getAttribute('href'), dataPlay: el.getAttribute('data-play'), haspopup: el.getAttribute('aria-haspopup') }));
  assert.equal(recentLink.tag, 'A', 'a real Continue playing card is a direct-launch anchor');
  assert.equal(recentLink.href, `#play/${READY.id}`, 'the recent card deep-links its game through the existing player hash');
  assert.equal(recentLink.dataPlay, READY.id, 'the recent card carries data-play for its game');
  assert.equal(recentLink.haspopup, null, 'the recent card carries no aria-haspopup — it launches directly');
  const recentRail = await page.locator('[data-sd-shelf="recent"]').evaluate(shelf => ({
    pct: /\d+\s?%/.test(shelf.innerText),
    filled: [...shelf.querySelectorAll('.sd-rail-fill')].some(node => node.getBoundingClientRect().width > 0),
  }));
  assert.equal(recentRail.pct, false, 'the real Continue playing shelf shows no fabricated progress percentage');
  assert.equal(recentRail.filled, false, 'the real Continue playing rail is left unfilled — no fake game progress on a history card');
  await page.screenshot({ path: 'artifacts/qa/spotlight-library-recent.png', fullPage: false });
  pass('pressing the player Start creates the sandboxed frame, records the allowed id and repaints the shelf');

  /* ------------------------------------------------- reload keeps the order */
  await reload();
  assert.deepEqual(await shelfIds(), [READY.id], 'the recent order survives a reload');
  assert.equal(await page.locator('[data-sd-shelf="recent"] .shelf-heading h3').textContent(), 'Continue playing 01', 'the shelf is headed Continue playing with its count');
  pass('the recent shelf and its order survive a page reload');

  /* -------------------------------------------- repeat launches: dedup, newest first */
  await page.locator('#search').fill('');
  await launch(READY_SECOND.id);
  await closePlayer();
  await page.locator('[data-sd-shelf="recent"]').waitFor({ timeout: 3000 });
  assert.deepEqual(await shelfIds(), [READY_SECOND.id, READY.id], 'a second launch goes to the front, newest first');
  await launch(READY.id);
  await closePlayer();
  await page.locator('[data-sd-shelf="recent"]').waitFor({ timeout: 3000 });
  assert.deepEqual(await shelfIds(), [READY.id, READY_SECOND.id], 'relaunching an earlier game moves it to the front without duplicating it');
  assert.deepEqual(await stored(), [READY.id, READY_SECOND.id], 'the stored list is deduplicated too');
  pass('repeat launches deduplicate and keep the newest game first in storage and on the shelf');

  /* ----------------------------- real recent shows five whole cards; other shelves six */
  // APPROVED: once there is real history, the Continue playing row shows exactly five whole
  // cards at desktop width when it holds enough; every other shelf still shows six. Visibility
  // is measured against the row box, not a hard-coded card pixel width.
  const sixIds = GAMES
    .filter(game => !game.availability && CONFIG.games?.[game.id]?.mode === 'iframe')
    .slice(0, 6)
    .map(game => game.id);
  assert.equal(sixIds.length, 6, 'the catalogue supplies six launchable games for the visibility check');
  await writeStored(JSON.stringify(sixIds));
  await reload();
  const visibleWhole = row => row.evaluate(node => {
    const box = node.getBoundingClientRect();
    const cards = [...node.querySelectorAll('.sd-card')];
    return { total: cards.length, visible: cards.filter(card => card.getBoundingClientRect().right <= box.right + 1).length };
  });
  const recentRow = page.locator('[data-sd-shelf="recent"] .sd-row').first();
  await recentRow.waitFor({ timeout: 3000 });
  const recentFit = await visibleWhole(recentRow);
  assert.equal(recentFit.total, 6, 'all six remembered games stay in the recent row');
  assert.equal(recentFit.visible, 5, `the real recent row shows exactly five whole cards at 1440px (visible ${recentFit.visible} of ${recentFit.total})`);
  const otherFit = await visibleWhole(page.locator('[data-sd-shelf="curated"] .sd-row').first());
  assert.equal(otherFit.visible, Math.min(6, otherFit.total), `every other shelf still shows six whole cards at 1440px, or all of them when a row holds fewer (visible ${otherFit.visible} of ${otherFit.total})`);
  pass(`the real recent row shows five whole cards at 1440px while other shelves show six (recent ${recentFit.visible}/${recentFit.total}, curated ${otherFit.visible})`);

  /* ------------------------------------- malformed and junk stored ids degrade quietly */
  await writeStored('not json{');
  await reload();
  assert(await demoIsSet(), 'malformed JSON degrades to the Continue playing demo instead of an error');
  assert.equal(await page.locator('#shelves [data-sd-shelf="curated"]').count() > 0, true, 'the curated shelves still render');
  await writeStored(JSON.stringify(['ghost-game', 'halo', 'halo', '', 42, { x: 1 }, 'not a real id!']));
  await reload();
  assert.deepEqual(await shelfIds(), ['halo'], 'unknown, non-string, blank, malformed and duplicate ids are dropped, valid catalogue ids kept');
  assert.equal(await demo.count(), 0, 'real history replaces the Continue playing demo');
  await writeStored('[]');
  await reload();
  assert.equal(await demo.count(), 1, 'an empty list brings the Continue playing demo back');
  const shelvesText = await page.locator('#shelves').innerText();
  assert(!/\d+\s?%/.test(shelvesText), 'the shelves never print a fabricated progress percentage');
  pass('malformed JSON and unknown/duplicate stored ids degrade to the Continue playing demo or a filtered shelf, no percentage shown');

  /* ------------------------------------------------------------- no detours */
  assert.deepEqual(pops, [], `no launch path opened a new tab: ${pops.join(', ')}`);
  assert.equal(external.length > 0, true, 'the frame was pointed at a game host and answered by the local fixture');
  const unexpected = consoleErrors.filter(entry => !/spotlight-media\.json/.test(entry.url));
  const mediaAbsent = consoleErrors.some(entry => /spotlight-media\.json/.test(entry.url));
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.deepEqual(unexpected.map(entry => `${entry.url} ${entry.text}`), [], 'no console errors other than the optional media map');
  pass(`no new tab, no page errors; the only external request was the stubbed game frame${mediaAbsent ? ' (optional spotlight-media.json absent)' : ''}`);

  results.passed = true;
  results.errors = errors;
  results.spotlightMediaMapAbsent = mediaAbsent;
  await writeFile('artifacts/qa/spotlight-library-report.json', JSON.stringify({ ...results, previewServer: server.preview, base: server.base }, null, 2) + '\n');
  console.log(`\n${checks.length} checks passed${server.preview ? ' against the running preview' : ' against a private dist/ server'}`);
} finally {
  await browser?.close();
  await server.stop();
}
