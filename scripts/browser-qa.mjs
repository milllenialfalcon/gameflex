/**
 * gameflex browser QA.
 *
 * Combined-catalogue regression for the APPROVED default Spotlight page (index.html
 * carries `page-spotlight`) — 54 listings: 16 reviewed games plus 38 DOS listings
 * marked sandbox-pending — plus in-site player coverage.
 *
 * Expected counts are derived from dist/games.json, read locally, so the
 * assertions track the shipped catalogue instead of a hardcoded number.
 *
 * Catalogue selectors are the Spotlight browse layer's, not the retired homepage
 * inline-card markup: cards are `.sd-card[data-game]`, a curated card's thumbnail is a
 * `button.sd-art[data-sd-open]` that opens the floating `.sd-panel`, the Continue playing
 * row's cards are direct-launch `a.sd-art[href="#play/<id>"][data-play]` anchors, and the
 * panel reuses the shared `[data-play]` / `[data-favourite]` / `[data-details]` handlers.
 * Reachability is asserted over the rendered `[data-game]` set, and every card's
 * accessible label must name its game.
 *
 * Fixtures: every non-loopback request (artwork, fonts and game hosts are the
 * only external ones) is answered with a deterministic local fixture page, so
 * this suite never touches a real game host and never proves real gameplay.
 * The fixture marks itself, and the suite asserts the marker is what the frame
 * actually rendered.
 *
 * Server: uses GAMEFLEX_QA_URL when set, otherwise http://127.0.0.1:4176 when
 * that preview is already serving, otherwise starts its own static server for dist/
 * (with the .mjs and .png MIME types that scripts/serve.mjs does not map). The
 * retired homepage port 4173 is never used.
 *
 * Teardown runs in a finally: a failed check still closes the fixture browser and
 * the local mock relay, so a failure reports instead of hanging on an open handle.
 * (The suite body below keeps its own indentation inside that try block.)
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';

const { chromium } = await import(process.env.GAMEFLEX_PLAYWRIGHT || 'playwright');

const DIST = path.resolve('dist');
const GAMES = JSON.parse(await readFile(path.resolve('dist/games.json'), 'utf8'));
const LISTINGS = GAMES.length;
const CATALOGUE_IDS = GAMES.map(game => game.id).sort();
const DOS_LISTINGS = GAMES.filter(game => game.provider === 'dos-zone');
const PENDING_LISTINGS = GAMES.filter(game => game.availability === 'sandbox-pending');
const countFor = (predicate) => GAMES.filter(predicate).length;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const FIXTURE_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GAMEFLEX QA FIXTURE</title></head><body data-gameflex-fixture="1"><h1>Deterministic QA fixture — not real gameplay</h1><p>This local page stands in for the game host during automated checks.</p></body></html>';
// A real 1×1 JPEG, so the remote mock streams something the browser can decode.
const TINY_JPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

async function reachable(url) {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); return response.ok; } catch { return false; }
}

async function ensureServer() {
  if (process.env.GAMEFLEX_QA_URL) return { base: process.env.GAMEFLEX_QA_URL.replace(/\/$/, ''), stop: async () => {} };
  if (await reachable('http://127.0.0.1:4176')) return { base: 'http://127.0.0.1:4176', stop: async () => {} };
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

const { base, stop } = await ensureServer();
await mkdir('artifacts/qa', { recursive: true });

// Shared with the teardown below, so they are declared before the try block.
let mock = null, mockServer = null, browser = null, remotePage = null;
const shutdown = async () => {
  try { mock?.sockets.forEach(socket => socket.destroy()); } catch { /* ignore */ }
  if (mockServer) { try { mockServer.closeAllConnections?.(); mockServer.close(); } catch { /* ignore */ } }
  try { await remotePage?.close(); } catch { /* ignore */ }
  try { await browser?.close(); } catch { /* ignore */ }
  try { await stop(); } catch { /* ignore */ }
};

try {

const checks = [];
const pass = (label) => { checks.push(label); };
browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [], popups = [], dialogs = [], hosts = new Set(), interceptedUrls = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('popup', popup => popups.push(popup.url()));
page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });

const fixtureHost = 'mitchellhynes.com';
let hangHostRequests = false;
await page.route(url => ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => {
  const target = new URL(route.request().url());
  hosts.add(target.hostname);
  interceptedUrls.push(target.href);
  if (hangHostRequests) return; // leave the request pending to exercise the load timeout
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE_HTML });
});

const playerOpen = () => page.evaluate(() => document.getElementById('player').hidden === false);
const stageState = () => page.locator('#player-stage').getAttribute('data-state');
const statusText = () => page.locator('#player-status').textContent();
const panelStart = () => page.locator('.player-panel [data-player-action="start"]');
const shelfCards = () => page.locator('#shelves .sd-card');
const curatedRow = () => page.locator('[data-sd-shelf="curated"] .sd-row').first();
// Open a card's floating detail panel by clicking its thumbnail. A Continue playing card is a
// direct-launch link into the player, so panel checks always use an ordinary (curated/grid) card.
const openPanel = async (selector) => {
  await page.locator(selector).first().click();
  await page.locator('.sd-panel').waitFor({ timeout: 3000 });
};

/* ------------------------------------------------------ static source checks */
for (const file of ['dist/app.js', 'dist/player.mjs', 'dist/spotlight-discovery.mjs', 'dist/index.html']) {
  const source = await readFile(file, 'utf8');
  assert(!/window\.open\s*\(/.test(source), `${file} must not open windows`);
  assert(!/target\s*=\s*["']_blank/i.test(source), `${file} must not use target=_blank`);
  assert(!/_blank/.test(source), `${file} must not reference _blank`);
}
pass('no window.open or target=_blank anywhere in the shipped frontend source');

/* ---------------------------------------------------- catalogue regression */
await page.goto(base);
await shelfCards().first().waitFor();
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'artifacts/qa/desktop.png', fullPage: true });
const count = await shelfCards().count();
// Reachability is measured over the rendered Spotlight cards: every catalogue id must be on
// screen as a `[data-game]` card somewhere in the browse layer.
const uniqueRenderedIds = [...new Set(await page.evaluate(() => [...document.querySelectorAll('#shelves [data-game]')].map(node => node.dataset.game)))].sort();
assert.equal(LISTINGS - DOS_LISTINGS.length, 16, 'the catalogue preserves the 16 original listings');
assert(DOS_LISTINGS.length >= 21, 'the catalogue preserves the existing DOS listings');
assert.equal(PENDING_LISTINGS.length, DOS_LISTINGS.length, 'every DOS listing is still marked sandbox-pending');
assert.equal(countFor(g => !g.provider), 16, 'the catalogue keeps its 16 reviewed games');
assert(count >= LISTINGS, 'the Spotlight shelves still render cards');
assert.deepEqual(uniqueRenderedIds, CATALOGUE_IDS, 'every catalogue listing is reachable from a rendered card');
// Every rendered card is labelled with its own game: an ordinary (captionless) card keeps its
// name only in the accessible label on the artwork button.
const gamesById = new Map(GAMES.map(game => [game.id, game]));
const cardLabels = await page.evaluate(() => [...document.querySelectorAll('#shelves .sd-card')].map(card => ({
  id: card.dataset.game || '',
  label: card.querySelector('.sd-art')?.getAttribute('aria-label') || '',
})));
const unlabelled = cardLabels.filter(entry => { const game = gamesById.get(entry.id); return !game || !entry.label.includes(game.title); });
assert.equal(unlabelled.length, 0, `every rendered card is labelled with its game name (${unlabelled.map(entry => entry.id).join(', ') || 'none'})`);
assert.equal((await page.locator('.site-header .wordmark').textContent()).trim(), 'GAMEFLEX');
for (const selector of ['.shelf-subtitle', '.collection-count', '.small-print p', 'footer']) {
  assert(await page.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 12), `${selector} readable text size`);
}
const bodyCopy = await page.evaluate(() => document.body.innerText.toLowerCase());
for (const banned of ['new tab', 'opens in a new tab', 'one tab away']) {
  assert(!bodyCopy.includes(banned), `catalogue copy must not advertise "${banned}"`);
}
pass(`desktop Spotlight catalogue renders all ${LISTINGS} games (16 original + ${DOS_LISTINGS.length} DOS), every card labelled, pixel wordmark, readable supporting text, in-site copy only`);

async function checkShelfStep() {
  // Pick the first curated row wide enough to scroll, so the one-card arrow step is meaningful.
  const target = await page.evaluate(() => {
    const row = [...document.querySelectorAll('[data-sd-shelf="curated"] .sd-row')]
      .find(node => node.scrollWidth > node.clientWidth + 20 && node.querySelectorAll('.sd-card').length >= 2);
    return row ? row.id : '';
  });
  assert(target, 'a curated Spotlight row is horizontally scrollable for the arrow step');
  // The row element is `#row-<shelfId>`; the arrow buttons key off the bare shelf id.
  const scrollKey = target.replace(/^row-/, '');
  const row = page.locator(`#${target}`);
  const pitch = await row.evaluate(el => el.children[1].getBoundingClientRect().left - el.children[0].getBoundingClientRect().left);
  const right = page.locator(`[data-scroll="${scrollKey}"][data-direction="1"]`);
  const left = page.locator(`[data-scroll="${scrollKey}"][data-direction="-1"]`);
  await right.click();
  await page.waitForFunction(({ id, p }) => Math.abs(document.getElementById(id).scrollLeft - p) < 3, { id: target, p: pitch });
  // Replacement rows must update arrow state themselves; no resize or synthetic repair.
  await left.click();
  await page.waitForFunction(id => document.getElementById(id).scrollLeft < 3, target);
  const firstArt = row.locator('.sd-art').nth(0), nextArt = row.locator('.sd-art').nth(1);
  await firstArt.focus(); await page.keyboard.press('ArrowRight');
  assert(await nextArt.evaluate(el => el === document.activeElement), 'keyboard movement keeps focus on the newly shown game');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(id => document.getElementById(id).scrollLeft < 3, target);
  await page.keyboard.press('Escape');
}
await checkShelfStep();
pass('shelf arrows and ArrowLeft/ArrowRight still step one card');

// Favourites are saved through the floating panel's shared [data-favourite] control.
await openPanel('[data-sd-shelf="curated"] .sd-card[data-game="halo"] .sd-art');
await page.locator('.sd-panel [data-favourite]').click();
assert.equal(await page.locator('#favourite-count').textContent(), '1');
await page.reload(); await shelfCards().first().waitFor();
assert.equal(await page.locator('#favourite-count').textContent(), '1', 'favourites persist across reload');
await page.locator('[data-view="favourites"]').click();
assert.equal(await page.locator('#shelves .sd-card').count(), 1);
await openPanel('#shelves .sd-card[data-game="halo"] .sd-art');
await page.locator('.sd-panel [data-favourite]').click();
assert(await page.locator('#empty-state').isVisible());
await page.locator('#reset').click();
const matches = (game, needle) => `${game.title} ${game.genre} ${game.description} ${(game.tags || []).join(' ')}`.toLowerCase().includes(needle.toLowerCase());
await page.locator('#search').fill('quAke');
assert.equal(await page.locator('#shelves .sd-card').count(), countFor(g => matches(g, 'quAke')), 'case-insensitive search');
await page.locator('#search').fill('zzzz-not-a-game');
assert(await page.locator('#empty-state').isVisible());
await page.locator('#reset').click();
await page.locator('[data-category="sports"]').click();
assert.equal(await page.locator('#shelves .sd-card').count(), countFor(g => g.category === 'sports'), 'the sports filter shows exactly the catalogue sports titles');
assert(await page.locator('[data-category="strategy"]').isVisible(), 'the strategy filter is now visible because the catalogue has strategy titles');
await page.locator('[data-view="discover"]').click();
pass('favourites add/remove/persist through the panel, favourites empty state, search and filters match the catalogue, strategy filter visible');

await openPanel('[data-sd-shelf="curated"] .sd-card[data-game="halo"] .sd-art');
await page.locator('.sd-panel [data-details="halo"]').click();
assert(await page.locator('#details').isVisible());
assert((await page.locator('#details .requirements').textContent()).includes('XISO'));
assert.equal(await page.locator('#details a[target]').count(), 0, 'the details action must not open a new tab');
assert((await page.locator('#dialog-content').innerText()).includes('Play in gameflex'));
await page.keyboard.press('Escape');
assert(!(await page.locator('#details').isVisible()));
pass('details dialog keeps its requirements and now offers an in-site action only');

// The Continue playing demo is the only direct-launch row on a fresh visit: its cards are real
// #play/<id> anchors carrying data-play and no target, so the catalogue launches in-site.
const demoLinks = await page.locator('[data-sd-shelf="demo"] .sd-card .sd-art').evaluateAll(els => els.map(a => ({ tag: a.tagName, href: a.getAttribute('href'), target: a.getAttribute('target'), play: a.getAttribute('data-play') })));
assert(demoLinks.length >= 1, 'the fresh browser shows the Continue playing demo shelf');
assert(demoLinks.every(link => link.tag === 'A' && /^#play\/[a-z0-9_-]+$/.test(link.href) && link.target === null && link.href === `#play/${link.play}`), 'every direct-launch card is an internal #play/<id> anchor with a matching data-play and no target');
assert(demoLinks.every(link => CATALOGUE_IDS.includes(link.play)), 'every direct-launch id is a real catalogue game');
assert.equal(await page.locator('#shelves a[target]').count(), 0, 'no target attributes anywhere in the catalogue');
assert.equal(await page.locator('#shelves a[href^="http"]').count(), 0, 'no external anchors in the catalogue');
pass(`all ${LISTINGS} catalogue cards are reachable in-site, with no external anchors and no target attributes`);

/* ------------------------------------------------------- player: open state */
await page.evaluate(() => { window.__GAMEFLEX_PLAYER_TIMEOUT_MS = 6000; });
const firstTile = page.locator('.game-art').first();
await firstTile.scrollIntoViewIfNeeded();
const scrollBeforePlayer = await page.evaluate(() => window.scrollY);
await firstTile.click();
assert.equal(await page.evaluate(() => location.hash), '#play/halo');
assert(await playerOpen(), 'a tile click opens the in-site player');
assert.equal(await page.locator('#player').getAttribute('role'), 'dialog');
assert.equal(await page.locator('#player').getAttribute('aria-modal'), 'true');
assert.equal((await page.locator('#player-title').textContent()).trim(), 'Halo: Combat Evolved');
assert(await page.locator('#player-requirements').isHidden(), 'requirements stay in the closed Notes overlay');
assert((await page.locator('#player-requirements-copy').textContent()).includes('XISO'));
const focusSettled = await page.waitForFunction(() => Boolean(document.querySelector('#player')?.contains(document.activeElement)), null, { timeout: 2000 }).then(() => true).catch(() => false);
assert(focusSettled, 'focus moves into the player when it opens');
assert(await page.evaluate(() => document.documentElement.classList.contains('player-open')), 'page scroll is locked while the player is open');
assert.equal(await page.locator('#player-remote').isHidden(), true, 'no remote session is offered while the config disables it');
assert.equal(await page.locator('.player-panel [data-player-action="remote"]').count(), 0, 'no remote button in the ready panel while the config disables it');
assert.equal(await page.locator('#player-fullscreen').isHidden(), true, 'Fullscreen is not offered before the game starts');
assert.equal(await page.locator('#player-start').isHidden(), true, 'the header keeps one obvious primary action: the panel Start game');
assert.equal(await page.locator('#sidebar-remote-key, #player-remote-key').count(), 0, 'no owner key field while remote is disabled');
assert(!(await page.locator('body > main').isVisible()), 'the catalogue is not visible behind the player');
assert(!(await page.locator('body > footer').isVisible()), 'the footer is not visible behind the player');
assert.equal(interceptedUrls.filter(url => url.includes('/api/sessions')).length, 0, 'the shipped config makes no relay calls');
assert((await statusText()).includes('Player open for'), 'opening announces the player');
await page.locator('#player-notes-button').click();
assert(await page.locator('#player-requirements').isVisible(), 'requirements remain available on demand');
await page.keyboard.press('Escape');
assert(await playerOpen(), 'closing Notes does not close the player');
pass('tile launch opens the player with title, requirements, focus and scroll lock; catalogue chrome, remote and Fullscreen stay hidden');

/* ---------------------------------------------------------- player: iframe */
await panelStart().click();
await page.locator('iframe.player-frame').waitFor();
const frameHandle = await page.locator('iframe.player-frame').elementHandle();
const sandbox = await frameHandle.getAttribute('sandbox');
assert.equal(sandbox, 'allow-scripts allow-same-origin allow-forms allow-pointer-lock');
for (const token of ['allow-popups', 'allow-top-navigation', 'allow-modals', 'allow-downloads', 'allow-popups-to-escape-sandbox', 'allow-top-navigation-by-user-activation']) {
  assert(!sandbox.includes(token), `sandbox must not include ${token}`);
}
assert.equal(await frameHandle.getAttribute('allow'), 'fullscreen; autoplay; gamepad');
assert.equal(await frameHandle.getAttribute('allowfullscreen'), '');
assert.equal(await frameHandle.getAttribute('src'), 'https://mitchellhynes.com/halo/', 'only the catalogue URL is framed');
await page.waitForFunction(() => Boolean(document.querySelector('iframe.player-frame')?.dataset.generation) && document.getElementById('player-stage').dataset.state === 'loaded');
const generationBeforeRestart = await page.evaluate(() => document.querySelector('iframe.player-frame').dataset.generation);
const statusAfterStart = await statusText();
assert(statusAfterStart.toLowerCase().includes('game page opened'), `a load event reports a page load, plainly: got "${statusAfterStart}"`);
for (const claim of ['verified', 'gameplay verified', 'ready']) {
  assert(!(await statusText()).toLowerCase().includes(claim), `the player must not claim "${claim}"`);
}
const gameFrame = page.frames().find(frame => frame.url().includes(fixtureHost));
assert(gameFrame, 'the frame request is intercepted by the deterministic fixture');
await gameFrame.waitForLoadState();
assert.equal((await gameFrame.title()).trim(), 'GAMEFLEX QA FIXTURE', 'the frame rendered the local fixture, not a real game host');
assert.equal(await page.locator('.player-stage-label').count(), 0, 'the loading label clears once the page loads');
pass('start loads one sandboxed cross-origin frame with no popup or top-navigation tokens, and reports a page load only');

/* --------------------------------------------------------- player: restart */
await page.evaluate(() => { document.querySelector('iframe.player-frame').dataset.qaOld = '1'; });
await page.locator('#player-start').click();
await page.waitForFunction(() => Boolean(document.querySelector('iframe.player-frame')) && document.querySelector('iframe.player-frame').dataset.qaOld === undefined && document.querySelectorAll('iframe.player-frame').length === 1);
assert.notEqual(await page.evaluate(() => document.querySelector('iframe.player-frame').dataset.generation), generationBeforeRestart, 'restart is guarded by a new launch generation');
assert(await page.evaluate(() => document.querySelectorAll('iframe.player-frame, canvas.player-canvas').length === 1), 'restart leaves exactly one live surface');
pass('restart destroys the previous frame and creates exactly one new one under a new generation');

/* --------------------------------------------------------- player: timeout */
hangHostRequests = true;
await page.evaluate(() => { window.__GAMEFLEX_PLAYER_TIMEOUT_MS = 700; });
await page.locator('#player-start').click();
await page.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'timeout', null, { timeout: 8000 });
assert((await statusText()).includes('did not finish loading'));
assert((await page.locator('.player-panel').innerText()).includes('did not finish loading'));
assert.equal(await page.locator('.player-panel [data-player-action="start"]').count(), 1, 'the timeout offers a retry');
assert.equal(await page.locator('.player-panel [data-player-action="back"]').count(), 1, 'the timeout offers in-site back');
assert.equal(await page.locator('#player a[href^="http"]').count(), 0, 'the timeout offers no new-tab link');
hangHostRequests = false;
await page.locator('.player-panel [data-player-action="start"]').click();
await page.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'loaded');
pass('a load timeout shows a retry plus in-site back, and retry loads the frame again');

/* ---------------------------------------------------- player: exit cleanup */
const framesWithPlayer = (await page.frames()).length;
await page.locator('#player-close').click();
assert(!(await playerOpen()), 'Back closes the player');
assert.equal(await page.evaluate(() => location.hash), '');
assert.equal(await page.locator('iframe.player-frame').count(), 0, 'closing destroys the frame');
assert.equal((await page.frames()).length, framesWithPlayer - 1, 'the game frame is gone from the page');
assert.equal(await page.evaluate(() => document.documentElement.classList.contains('player-open')), false, 'the scroll lock is released');
const scrollRestored = await page.waitForFunction(sy => Math.abs(window.scrollY - sy) < 2, scrollBeforePlayer, { timeout: 2000 }).then(() => true).catch(() => false);
assert(scrollRestored, 'the scroll position is restored on close');
assert(await page.evaluate(() => Boolean(document.activeElement?.classList?.contains('game-art'))), 'focus returns to the tile that launched the game');
assert((await statusText()).includes('Player closed'));
pass('closing the player destroys the frame, clears the hash, releases the lock and restores scroll and focus');

/* --------------------------------------------- browser back/forward routing */
await page.locator('.game-art').first().click();
assert.equal(await page.evaluate(() => location.hash), '#play/halo');
await page.goBack();
assert(!(await playerOpen()), 'browser back leaves the player');
assert.equal(await page.evaluate(() => location.hash), '');
await page.goForward();
assert(await playerOpen(), 'browser forward returns to the player');
assert.equal((await page.locator('#player-title').textContent()).trim(), 'Halo: Combat Evolved');
await page.keyboard.press('Escape');
assert(!(await playerOpen()), 'Escape closes the player');
pass('browser back, browser forward and Escape all route through the #play hash');

/* ------------------------------------------- deep link, invalid, unavailable */
await page.goto(`${base}#play/quake3`);
assert(await playerOpen(), 'a fresh load of #play/quake3 opens the player');
assert.equal((await page.locator('#player-title').textContent()).trim(), 'Quake III Arena');
await page.reload();
await page.locator('#player-title').waitFor();
assert(await playerOpen(), 'a deep reload keeps the player route');
pass('deep link and deep reload open the routed player');

await page.goto(`${base}#play/not-a-real-game`);
assert(await playerOpen());
assert.equal(await stageState(), 'blocked');
assert((await page.locator('.player-panel').innerText()).includes('not in the collection'));
assert.equal(await page.locator('#player a[href^="http"]').count(), 0, 'the recoverable empty state has no external link');
await page.locator('.player-panel [data-player-action="back"]').click();
assert(!(await playerOpen()));
assert.equal(await page.evaluate(() => location.hash), '');
assert(await page.locator('.game-card').first().isVisible(), 'the catalogue is usable again after an invalid route');
pass('invalid game IDs show a recoverable in-site empty state');

await page.goto(`${base}#play/halo%3Cimg%20src=x%20onerror=alert(1)%3E`);
assert(await playerOpen());
const injectedMarkup = await page.locator('#player').innerHTML();
assert(!injectedMarkup.includes('<img'), 'URL-controlled markup is never injected into the player');
assert(!/onerror/i.test(injectedMarkup), 'URL-controlled attributes are never injected into the player');
assert.equal(await page.locator('#player iframe, #player canvas').count(), 0, 'a hostile ID never reaches a frame');
assert((await page.locator('.player-panel').innerText()).length > 0, 'the hostile ID still gets the recoverable panel');
await page.locator('.player-panel [data-player-action="back"]').click();
await page.locator('.game-card').first().waitFor();
pass('URL-controlled hash content is rejected and never rendered as HTML');

await page.goto(`${base}#play/wasmarcade`);
assert(await playerOpen());
assert.equal(await stageState(), 'blocked');
const blockedCopy = await page.locator('.player-panel').innerText();
assert(blockedCopy.includes('WASM Arcade'));
assert(/prohibit embed|not allow embed/i.test(blockedCopy), 'the blocked panel explains the embedding restriction');
assert.equal(await page.locator('#player a[href^="http"]').count(), 0, 'unavailable games are not redirected off-site');
await page.locator('.player-panel [data-player-action="back"]').click();
pass('WASM Arcade is unavailable in-site with an accurate message and no external fallback');

/* ------------------------------ paused catalogue shortcuts, shared favourites */
await page.goto(base);
await page.locator('.game-card').first().waitFor();
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('.game-art').first().click();
await page.keyboard.press('/');
assert(!(await page.locator('#search').evaluate(el => el === document.activeElement)), 'the search shortcut is paused while the player is open');
const pauseRowId = await curatedRow().getAttribute('id');
const shelfScroll = await page.locator(`#${pauseRowId}`).evaluate(el => el.scrollLeft);
await page.keyboard.press('ArrowRight');
assert.equal(await page.locator(`#${pauseRowId}`).evaluate(el => el.scrollLeft), shelfScroll, 'catalogue shelf shortcuts are paused while the player is open');
await page.locator('#player-favourite').click();
assert.equal(await page.locator('#player-favourite').getAttribute('aria-pressed'), 'true');
assert.equal(await page.locator('#favourite-count').textContent(), '1', 'the player heart feeds the same favourites store');
await page.locator('#player-close').click();
await page.reload();
await page.locator('.game-card').first().waitFor();
assert.equal(await page.locator('#favourite-count').textContent(), '1', 'a favourite saved from the player survives reload');
await page.goto(`${base}#play/halo`);
assert(await playerOpen());
assert.equal(await page.locator('#player-favourite').getAttribute('aria-pressed'), 'true', 'the player heart reflects saved state on open');
await page.locator('#player-favourite').click();
assert.equal(await page.locator('#player-favourite').getAttribute('aria-pressed'), 'false');
await page.locator('#player-close').click();
pass('catalogue shortcuts pause while the player is open, and the player heart shares the favourites store both ways');

/* ------------------------------------------------------------ mobile player */
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('#search').blur();
await page.evaluate(() => scrollTo(0, 0));
await page.screenshot({ path: 'artifacts/qa/mobile.png', fullPage: true });
assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the catalogue has no mobile horizontal overflow');
await page.locator('.game-art').first().click();
assert(await playerOpen());
await panelStart().click();
await page.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'loaded');
assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the open player has no mobile horizontal overflow');
await page.screenshot({ path: 'artifacts/qa/mobile-player.png', fullPage: true });
for (const selector of ['#player-start', '#player-close', '#player-favourite', '#player-notes-button']) {
  assert(await page.locator(selector).isVisible(), `${selector} is usable on mobile`);
  assert(await page.locator(selector).evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 12), `${selector} readable on mobile`);
}
await page.locator('#player-notes-button').click();
for (const selector of ['#player-note', '#player-notes dl']) {
  assert(await page.locator(selector).isVisible(), `${selector} is readable inside mobile Notes`);
}
await page.keyboard.press('Escape');
const startBox = await page.locator('#player-start').boundingBox();
assert(startBox.x >= 0 && startBox.x + startBox.width <= 391, 'player actions stay inside the mobile viewport');
assert(startBox.height >= 44, 'the primary player action keeps a 44px touch target');
await page.locator('#player-close').click();
pass('mobile: the player stays readable, tappable and inside the viewport');

/* -------------------------------------------- switching two game hashes */
await page.goto(base);
await page.locator('.game-card').first().waitFor();
await page.locator('.game-art').first().click();
assert.equal((await page.locator('#player-title').textContent()).trim(), 'Halo: Combat Evolved');
await page.goto(`${base}#play/quake2`);
assert.equal((await page.locator('#player-title').textContent()).trim(), 'Quake II', 'a new hash switches the open player');
await page.locator('#player-close').click();
assert(!(await playerOpen()));
assert.equal(await page.evaluate(() => location.hash), '', 'closing after a hash switch returns to the catalogue, not to the previous game');
assert(await page.locator('.game-card').first().isVisible());
await page.goBack();
assert.equal((await page.locator('#player-title').textContent()).trim(), 'Halo: Combat Evolved', 'back after a switch still walks the hash history');
assert(await playerOpen(), 'back reopens the earlier game route');
await page.goForward();
assert(!(await playerOpen()), 'forward after closing lands on the catalogue, not on a stale player');
assert.equal(await page.evaluate(() => location.hash), '');
await page.keyboard.press('Escape');
assert(!(await playerOpen()));
pass('switching between two game hashes keeps close, back and forward landing on the catalogue');

/* --------------------------------- malformed hashes, no frame, no injection */
const hostsBeforeMalformed = hosts.size;
for (const bad of ['#play/', '#play/%3Cscript%3E', '#play/' + 'x'.repeat(80)]) {
  await page.goto(base + bad);
  assert(await playerOpen(), `${bad} opens the recoverable player`);
  assert.equal(await stageState(), 'blocked', `${bad} shows the blocked state`);
  assert.equal(await page.locator('#player iframe, #player canvas').count(), 0, `${bad} requests no frame`);
  await page.locator('.player-panel [data-player-action="back"]').click();
  assert(!(await playerOpen()));
}
assert.equal(hosts.size, hostsBeforeMalformed, 'malformed hashes contact no game host');
pass('malformed and hostile #play hashes show the recoverable unknown-game state and request no frame');

/* -------------------------------------- fullscreen exit cleans up the view */
await page.goto(base);
await page.locator('.game-card').first().waitFor();
await page.locator('.game-art').first().click();
await panelStart().click();
await page.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'loaded');
assert(await page.locator('#player-fullscreen').isVisible(), 'Fullscreen is offered once the game is loaded');
await page.locator('#player-fullscreen').click();
const enteredFullscreen = await page.waitForFunction(() => document.fullscreenElement !== null, null, { timeout: 2000 }).then(() => true).catch(() => false);
if (enteredFullscreen) {
  const pressed = await page.waitForFunction(() => document.getElementById('player-fullscreen').getAttribute('aria-pressed') === 'true', null, { timeout: 2000 }).then(() => true).catch(() => false);
  assert(pressed, 'Fullscreen state is reflected on the control');
  await page.locator('#player-close').click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.fullscreenElement === null), true, 'exiting the player also leaves fullscreen');
  assert(!(await playerOpen()));
} else {
  await page.locator('#player-close').click();
}
pass(`fullscreen exit is cleaned up on close (exercised: ${enteredFullscreen})`);

/* -------------------------------------------------- favourite toggles once */
await page.locator('.game-art').first().click();
await page.locator('#player-favourite').click();
assert.equal(await page.locator('#favourite-count').textContent(), '1');
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('gameflex:favourites'))), ['halo'], 'one click on the player heart adds exactly one favourite');
await page.locator('#player-favourite').click();
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('gameflex:favourites'))), [], 'a second click removes it once');
await page.locator('#player-close').click();
await page.evaluate(() => localStorage.removeItem('gameflex:favourites'));
pass('the player heart toggles exactly once per click (no double toggle with the catalogue handler)');

/* ------------------------------------ remote mock: auth, frames, lifecycle */
mock = { requests: [], preflights: [], all: [], inputFrames: [], sessionId: 'qa-session-1', hangCreate: false, delayCreate: 0, sockets: [], droppedCreates: [] };
let mockPort = 0;
const wsAccept = (key) => crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
const wsText = (payload) => {
  const data = Buffer.from(payload);
  const header = data.length < 126 ? Buffer.from([0x81, data.length]) : Buffer.from([0x81, 126, data.length >> 8, data.length & 0xff]);
  return Buffer.concat([header, data]);
};
// The browser QA page is served from its own loopback origin, so the mock relay has
// to answer exactly like the real gateway: exact-match CORS (never `*`), a preflight
// for the JSON create, and an origin-gated WebSocket upgrade. Without that the
// cross-origin calls are blocked by the browser and the mock is never reached.
const mockPageOrigin = new URL(base).origin;
const mockCors = (origin) => (origin === mockPageOrigin
  ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'content-type,x-gameflex-key,authorization',
      'Access-Control-Max-Age': '60',
      Vary: 'Origin',
    }
  : null);

const createMockServer = () => http.createServer(async (request, response) => {
  mock.all.push(`${request.method} ${request.url} ct=${request.headers['content-type'] || '-'} origin=${request.headers.origin || '-'}`);
  const cors = mockCors(request.headers.origin);
  if (request.method !== 'OPTIONS') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    mock.requests.push({ method: request.method, url: request.url, key: request.headers['x-gameflex-key'] || '', auth: request.headers.authorization || '', origin: request.headers.origin || '', body: Buffer.concat(chunks).toString('utf8') });
  } else {
    mock.preflights.push({ url: request.url, origin: request.headers.origin || '' });
  }
  if (request.method === 'OPTIONS') {
    if (!cors) { response.writeHead(403, { 'Content-Type': 'application/json' }); response.end('{"error":{"code":"origin_not_allowed"}}'); return; }
    response.writeHead(204, cors); response.end(); return;
  }
  if (request.method === 'POST' && request.url === '/api/sessions') {
    // A client that gives up before the response ends closes the socket without
    // finishing it, which is how this mock observes an aborted create.
    response.on('close', () => { if (!response.writableEnded) mock.droppedCreates.push(request.url); });
    if (mock.hangCreate) return;
    if (!cors) { response.writeHead(403, { 'Content-Type': 'application/json' }); response.end('{"error":{"code":"origin_not_allowed"}}'); return; }
    if (request.headers['x-gameflex-key'] !== 'qa-owner-key') { response.writeHead(401, { 'Content-Type': 'application/json', ...cors }); response.end('{"error":{"code":"invalid_gateway_key"}}'); return; }
    const send = () => {
      response.writeHead(201, { 'Content-Type': 'application/json', ...cors });
      response.end(JSON.stringify({ id: mock.sessionId, token: 'qa-token', wsUrl: `ws://127.0.0.1:${mockPort}/ws/${mock.sessionId}?token=qa-token`, expiresAt: new Date(Date.now() + 60000).toISOString() }));
    };
    if (mock.delayCreate) setTimeout(send, mock.delayCreate); else send();
    return;
  }
  if (request.method === 'DELETE' && request.url.startsWith('/api/sessions/')) {
    if (!cors && request.headers.origin) { response.writeHead(403, { 'Content-Type': 'application/json' }); response.end('{"error":{"code":"origin_not_allowed"}}'); return; }
    response.writeHead(204, cors || {}); response.end(); return;
  }
  response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{"error":{"code":"not_found"}}');
});
mockServer = createMockServer();
mockServer.on('upgrade', (request, socket) => {
  if (request.headers.origin !== mockPageOrigin) { socket.destroy(); return; }
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${wsAccept(request.headers['sec-websocket-key'])}\r\n\r\n`);
  mock.sockets.push(socket);
  socket.write(wsText(JSON.stringify({ type: 'hello' })));
  socket.write(wsText(JSON.stringify({ type: 'frame', data: TINY_JPEG, width: 1280, height: 720 })));
  socket.write(wsText(JSON.stringify({ type: 'frame', data: 'not base64 !!', width: 10, height: 10 })));
  socket.write(wsText(JSON.stringify({ type: 'frame', data: TINY_JPEG, width: 9000, height: 9000 })));
  let buffer = Buffer.alloc(0);
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 6) {
      const length = buffer[1] & 0x7f;
      if (buffer.length < 6 + length) break;
      const mask = buffer.slice(2, 6);
      const payload = Buffer.alloc(length);
      for (let i = 0; i < length; i += 1) payload[i] = buffer[6 + i] ^ mask[i % 4];
      buffer = buffer.slice(6 + length);
      try { mock.inputFrames.push(JSON.parse(payload.toString('utf8'))); } catch { /* ignore */ }
    }
  });
  socket.on('error', () => {});
});
await new Promise(resolve => mockServer.listen(0, '127.0.0.1', () => { mockPort = mockServer.address().port; resolve(); }));
const mockBase = `http://127.0.0.1:${mockPort}`;

remotePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const remoteErrors = []; const expectedAuthErrors = [];
remotePage.on('pageerror', error => remoteErrors.push(error.message));
remotePage.on('console', message => { if (message.type() !== 'error') return; if (/Failed to load resource: the server responded with a status of 401/.test(message.text())) expectedAuthErrors.push(message.text()); else remoteErrors.push(`console: ${message.text()}`); });
// Two configs are exercised: the loopback mock relay, then a non-loopback HTTPS
// broker. Neither request leaves the machine — the route below answers both.
const remoteConfig = { version: 1, remote: { enabled: true, apiBase: mockBase }, games: { halo: { mode: 'iframe' } } };
await remotePage.route('**/player-config.json', route => route.fulfill({
  status: 200,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(remoteConfig),
}));
const brokerRequests = [];
await remotePage.route(url => ['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1', (route) => {
  brokerRequests.push({ url: route.request().url(), key: route.request().headers()['x-gameflex-key'] || '' });
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE_HTML });
});

// 1. missing owner key is refused, recoverably, in-site
await remotePage.goto(`${base}#play/halo`); await remotePage.reload();
await remotePage.waitForSelector('.player-panel');
await remotePage.locator('.player-panel [data-player-action="remote"]').click();
await remotePage.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'remote-error');
assert((await remotePage.locator('.player-panel').innerText()).includes('owner key'), 'a refused owner key is reported plainly');
assert.equal(await mock.requests.filter(r => r.method === 'POST').length, 1);
assert(mock.preflights.length === 0 || mock.preflights.every(entry => entry.origin === mockPageOrigin), 'any preflight the harness does send comes from the page origin');
assert.equal(await remotePage.locator('#player a[href^="http"]').count(), 0, 'the remote error state stays in-site');
assert((await remotePage.locator('.player-panel [data-player-action="start"]').count()) === 1, 'the remote error state offers the frame player');

// 2. correct key: frames render, dimensions are clamped, input is forwarded
await remotePage.goto(`${base}#play/halo`); await remotePage.reload();
await remotePage.waitForSelector('.player-panel');
await remotePage.fill('#player-remote-key', 'qa-owner-key');
mock.requests.length = 0;
await remotePage.locator('.player-panel [data-player-action="remote"]').click();
await remotePage.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'streaming');
await remotePage.waitForTimeout(400);
const postRequest = mock.requests.find(r => r.method === 'POST');
assert(postRequest, 'the create request reached the relay');
assert.equal(postRequest.key, 'qa-owner-key', 'the owner key is sent as a header to the configured apiBase only');
assert.equal(postRequest.origin, mockPageOrigin, 'the create carries the page origin the relay allowlists');
assert.equal(JSON.parse(postRequest.body).gameId, 'halo');
const canvasSize = await remotePage.evaluate(() => { const canvas = document.querySelector('canvas.player-canvas'); return { w: canvas.width, h: canvas.height }; });
assert.equal(canvasSize.w, 4096, 'oversized stream dimensions are clamped');
assert.equal(canvasSize.h, 4096);
assert((await remotePage.locator('#player-status').textContent()).includes('Remote session connected'));
assert.equal(await remotePage.locator('.player-stream-note').count(), 1, 'one remote note, not one per restart');
const canvasBox = await remotePage.locator('canvas.player-canvas').boundingBox();
await remotePage.mouse.move(canvasBox.x + 40, canvasBox.y + 30);
await remotePage.mouse.down(); await remotePage.mouse.up();
await remotePage.waitForTimeout(200);
assert(mock.inputFrames.some(frame => frame.event?.kind === 'mouse' && frame.event.eventType === 'mouseMoved'), 'mouse movement is forwarded to the relay');
const moved = mock.inputFrames.find(frame => frame.event?.eventType === 'mouseMoved').event;
assert(moved.x >= 0 && moved.x <= 4096 && moved.y >= 0 && moved.y <= 4096, 'forwarded coordinates stay inside the stream bounds');

// 3. exiting deletes the session with the bearer token and drops the socket
const deletesBefore = mock.requests.filter(r => r.method === 'DELETE').length;
await remotePage.locator('#player-close').click();
await remotePage.waitForTimeout(300);
const deletesAfter = mock.requests.filter(r => r.method === 'DELETE');
assert.equal(deletesAfter.length, deletesBefore + 1, 'exiting deletes the relay session');
assert.equal(deletesAfter[deletesAfter.length - 1].auth, 'Bearer qa-token', 'the delete carries the session token');
assert.equal(await remotePage.locator('canvas.player-canvas').count(), 0, 'the canvas is destroyed on exit');
assert.equal(await remotePage.evaluate(() => document.getElementById('player').hidden), true);

// 4. exiting while the create is still pending: stopRemote must not abort it (that
// would throw away the id), so the response is left to resolve under its own create
// timeout and the generation guard deletes the late session instead of drawing it
mock.requests.length = 0;
mock.sessionId = 'qa-session-late';
mock.delayCreate = 600;
const dropsBeforeLate = mock.droppedCreates.length;
const socketsBeforeLate = mock.sockets.length;
await remotePage.goto(`${base}#play/halo`); await remotePage.reload();
await remotePage.waitForSelector('#player-remote-key');
await remotePage.fill('#player-remote-key', 'qa-owner-key');
await remotePage.locator('.player-panel [data-player-action="remote"]').click();
assert.equal(await remotePage.locator('#player-stage').getAttribute('data-state'), 'loading', 'the create is still pending when the player is exited');
await remotePage.locator('#player-close').click();
assert.equal(await remotePage.evaluate(() => document.getElementById('player').hidden), true);
await remotePage.waitForTimeout(900);
const lateDelete = mock.requests.find(r => r.method === 'DELETE' && r.url.includes('qa-session-late'));
assert(lateDelete, 'a late session is deleted instead of displayed');
assert.equal(lateDelete.auth, 'Bearer qa-token', 'the late cleanup still carries the session token');
assert.equal(lateDelete.key, 'qa-owner-key', 'the late cleanup still carries the key the session was created with');
assert.equal(mock.droppedCreates.length, dropsBeforeLate, 'exiting does not abort a create that has not returned an id');
assert.equal(mock.sockets.length, socketsBeforeLate, 'the late session never opens a stream');
assert.equal(await remotePage.locator('canvas.player-canvas').count(), 0, 'the late session is never drawn');
assert.equal(await remotePage.evaluate(() => document.getElementById('player').hidden), true, 'the late session does not reopen the player');
mock.delayCreate = 0;

// 5. an unresponsive relay is bounded by the client's own create timeout
mock.hangCreate = true;
const dropsBeforeHang = mock.droppedCreates.length;
await remotePage.goto(`${base}#play/halo`); await remotePage.reload();
await remotePage.waitForSelector('#player-remote-key');
await remotePage.evaluate(() => { window.__GAMEFLEX_REMOTE_CREATE_TIMEOUT_MS = 500; });
await remotePage.locator('.player-panel [data-player-action="remote"]').click();
await remotePage.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'remote-error', null, { timeout: 6000 });
assert((await remotePage.locator('.player-panel').innerText()).includes('did not answer'));
assert.equal(mock.droppedCreates.length, dropsBeforeHang + 1, 'the hanging create is dropped after the client timeout, not left open');
mock.hangCreate = false;
await remotePage.locator('.player-panel [data-player-action="back"]').click();
await remotePage.waitForFunction(() => document.getElementById('player').hidden === true, null, { timeout: 4000 });

// 6. a non-loopback broker gets the remote path but never the owner key
remoteConfig.remote.apiBase = 'https://relay.gameflex.invalid';
brokerRequests.length = 0;
mock.requests.length = 0;
await remotePage.goto(`${base}#play/halo`); await remotePage.reload();
await remotePage.waitForSelector('.player-panel');
assert.equal(await remotePage.locator('#player-remote-key').count(), 0, 'no owner key field for a non-loopback apiBase');
assert.equal(await remotePage.locator('#player-remote').isVisible(), true, 'the remote path itself is still offered');
assert((await remotePage.locator('.player-panel-note').textContent()).includes('only offered for a relay on this machine'), 'the ready panel says where the key is offered');
await remotePage.locator('.player-panel [data-player-action="remote"]').click();
await remotePage.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'remote-error', null, { timeout: 6000 });
const brokerPost = brokerRequests.find(entry => entry.url.endsWith('/api/sessions'));
assert(brokerPost, 'the non-loopback broker is contacted in-site');
assert.equal(brokerPost.key, '', 'the owner key header is not sent to a non-loopback broker');
assert.equal(brokerRequests.filter(entry => entry.key).length, 0, 'no request leaves the page carrying an owner key');
assert.equal(mock.requests.length, 0, 'a non-loopback apiBase is never answered by the loopback mock');
assert((await remotePage.locator('.player-panel').innerText()).includes('usable session'), 'an unusable broker answer is reported plainly');
remoteConfig.remote.apiBase = mockBase;

assert.equal(expectedAuthErrors.length, 1, 'only the deliberately refused owner key generates an HTTP auth error');
assert.equal(remoteErrors.length, 0, remoteErrors.join('\n'));
pass('remote mock: loopback-only owner-key header, clamped frames, forwarded input, session delete on exit, bounded late-create cleanup and create timeout — all against local fixtures, no real backend');

/* -------------------------------------------------------------- assertions */
assert.equal(popups.length, 0, `no popups or new tabs were opened: ${popups.join(', ')}`);
assert.equal(dialogs.length, 0, `no alert/confirm dialogs appeared: ${dialogs.join(', ')}`);
assert.equal(errors.length, 0, errors.join('\n'));
pass('no popups, no dialogs and no console errors across the whole run');

const report = {
  passed: true,
  base,
  view: 'spotlight (index.html page-spotlight)',
  catalogue: {
    listings: LISTINGS,
    reviewed: countFor(g => !g.provider),
    dos: DOS_LISTINGS.length,
    sandboxPending: PENDING_LISTINGS.length,
    source: 'dist/games.json (read locally)',
  },
  fixtures: {
    mode: 'deterministic local fixture page for every non-loopback request',
    fixtureTitle: 'GAMEFLEX QA FIXTURE',
    interceptedHosts: [...hosts],
    realGameplayTested: false,
    note: 'Game hosts are replaced by local fixtures, so this suite proves routing, sandboxing, status wording and cleanup — not that any game plays.',
  },
  sandbox,
  checks,
  consoleErrors: errors,
  renderedCards: count,
  remoteMock: {
    harness: 'local HTTP + WebSocket mock relay, loopback only',
    realBackendTested: false,
    ownerKeySentAsHeader: true,
    ownerKeyLoopbackOnly: 'offered and sent only when location.hostname and apiBase are both loopback; a non-loopback https apiBase is exercised against a local fixture, so no request leaves the machine',
    pendingCreateOnExit: 'left to resolve under its own create timeout, then deleted through the generation guard',
  },
  fullscreenExercised: enteredFullscreen,
};
await writeFile('artifacts/qa/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

} finally {
  await shutdown();
}
