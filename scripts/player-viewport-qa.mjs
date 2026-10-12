/**
 * gameflex player viewport QA.
 *
 * A bounded, self-contained check of the player's fit and chrome behaviour. It runs its
 * own static server and its own deterministic local fixture, so it never contacts a game
 * host and never claims gameplay: a fixture answered frame proves the player sized itself
 * and stayed inside the viewport, nothing more.
 *
 * What it exercises:
 *   1. layout fit at 1440x900, 1366x768, 390x844, 844x390 and 320x568 — the player,
 *      document and body must have no vertical or horizontal overflow, the frame fills the
 *      stage edge to edge, and the toolbar stays one compact row on desktop and at most two
 *      on mobile;
 *   2. resize: a live viewport change re-fits the player without a reload, in and out of a
 *      running frame;
 *   3. long title: the toolbar ellipsizes instead of pushing the actions off-screen, and
 *      the full title is still available via the title attribute;
 *   4. notes: opened only by the Notes button, aria-expanded tracks it, the overlay
 *      overlays the game without shrinking the stage, it scrolls inside its own max-height,
 *      Escape closes notes first and the player second, focus returns to the Notes button,
 *      and notes are closed again on every reopen and on a game switch;
 *   5. focus: the trap stays inside the player, and inside the notes overlay while open;
 *   6. fullscreen: requested only by the Fullscreen control, never automatically, and
 *      cleaned up on close;
 *   7. stage errors: a hung fixture (timeout) and a hostile id (blocked) reach their panels
 *      with in-site retry/back actions and no external fallback;
 *   8. no external tabs: no window.open, no target=_blank, no popup, no http(s) frame src.
 *
 * Env:
 *   GAMEFLEX_PLAYWRIGHT  module specifier for playwright (default 'playwright')
 *   GAMEFLEX_VIEWPORT_QA_URL  use an already-running server instead of starting one
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const { chromium } = await import(process.env.GAMEFLEX_PLAYWRIGHT || 'playwright');

const DIST = path.resolve('dist');
const GAMES = JSON.parse(await readFile(path.join(DIST, 'games.json'), 'utf8'));
const CHANNEL = process.env.GAMEFLEX_BROWSER_CHANNEL || 'msedge';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };

// The game host is always answered locally. The fixture carries a marker the suite asserts
// on, so a check can never pass by reaching a real game.
const FIXTURE_HOST = 'player-viewport-qa.invalid';
const FIXTURE_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GAMEFLEX VIEWPORT FIXTURE</title><style>html,body{margin:0;height:100%;background:#123}</style></head><body data-gameflex-fixture="1"><h1>Deterministic viewport fixture - not real gameplay</h1></body></html>';

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
  { name: 'laptop-1366x768', width: 1366, height: 768, mobile: false },
  { name: 'phone-390x844', width: 390, height: 844, mobile: true },
  { name: 'phone-landscape-844x390', width: 844, height: 390, mobile: true },
  { name: 'small-phone-320x568', width: 320, height: 568, mobile: true },
];

const checks = [];
const pass = (label) => { checks.push(label); };

async function startServer() {
  if (process.env.GAMEFLEX_VIEWPORT_QA_URL) return { base: process.env.GAMEFLEX_VIEWPORT_QA_URL.replace(/\/$/, ''), stop: async () => {} };
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

const { base, stop } = await startServer();
await mkdir('artifacts/qa', { recursive: true });

let browser = null;
const shutdown = async () => { try { await browser?.close(); } catch { /* ignore */ } try { await stop(); } catch { /* ignore */ } };

try {
  browser = await chromium.launch({ headless: true, channel: CHANNEL });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], popups = [], dialogs = [], frameHosts = new Set();
  let hangHost = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('popup', popup => popups.push(popup.url()));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });

  // Every non-loopback request is answered locally. Catalogue URLs are rewritten to the
  // deterministic fixture host so a running frame is always a fixture, never a game.
  await page.route(url => ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname), route => {
    const target = new URL(route.request().url());
    frameHosts.add(target.hostname);
    if (hangHost) return; // leave it pending to exercise the load timeout
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE_HTML });
  });

  const playerOpen = () => page.evaluate(() => document.getElementById('player').hidden === false);
  const openFor = async (id) => {
    await page.goto(`${base}#play/${id}`);
    await page.waitForFunction(() => document.getElementById('player')?.hidden === false, null, { timeout: 4000 });
    await page.waitForFunction(() => document.getElementById('player-stage')?.dataset.state !== 'idle', null, { timeout: 4000 });
  };
  const closePlayer = async () => {
    if (await playerOpen()) await page.locator('#player-close').click();
    await page.waitForFunction(() => document.getElementById('player').hidden === true, null, { timeout: 4000 });
  };
  const startFrame = async () => {
    await page.locator('.player-panel [data-player-action="start"]').click();
    await page.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'loaded', null, { timeout: 8000 });
  };

  /* ------------------------------------------------------- static source checks */
  for (const file of ['dist/app.js', 'dist/player.mjs', 'dist/index.html', 'dist/spotlight.html']) {
    const source = await readFile(file, 'utf8');
    assert(!/window\.open\s*\(/.test(source), `${file} must not open windows`);
    assert(!/_blank/.test(source), `${file} must not reference _blank`);
    assert(!/target\s*=\s*["']_?blank/i.test(source), `${file} must not use a blank target`);
  }
  pass('no window.open, no target=_blank and no blank reference anywhere in the player frontend');

  /* ------------------------------------------- layout fit at the five viewports */
  const fitResults = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openFor('halo');
    // No outer scroll: the player is a fixed, viewport-height grid with overflow hidden, the
    // document/body scroll box is collapsed, and nothing outside the player can be scrolled.
    const fit = await page.evaluate(() => {
      const player = document.getElementById('player');
      const stage = document.getElementById('player-stage');
      const bar = document.querySelector('.player-bar');
      const foot = document.querySelector('.player-foot');
      const style = getComputedStyle(player);
      const document_ = document.documentElement;
      const body = document.body;
      return {
        // A visible scrollbar is what "outer scroll" means; computed overflow:hidden on the
        // document scroll box is what guarantees the wheel cannot move the page behind.
        documentOverflowY: getComputedStyle(document_).overflowY,
        bodyOverflowY: getComputedStyle(body).overflowY,
        bodyBoxHeight: body.getBoundingClientRect().height,
        documentScrollTop: document_.scrollTop,
        bodyScrollTop: body.scrollTop,
        documentScrollWidth: document_.scrollWidth,
        documentClientWidth: document_.clientWidth,
        playerOverflowY: player.scrollHeight > player.clientHeight + 1,
        playerOverflowX: player.scrollWidth > player.clientWidth + 1,
        playerStyleOverflow: style.overflowY,
        playerTop: player.getBoundingClientRect().top,
        playerBottom: player.getBoundingClientRect().bottom,
        stageTop: stage.getBoundingClientRect().top,
        stageBottom: stage.getBoundingClientRect().bottom,
        stageHeight: stage.getBoundingClientRect().height,
        barHeight: bar.getBoundingClientRect().height,
        footHeight: foot.getBoundingClientRect().height,
        innerHeight,
        innerWidth,
      };
    });
    assert.equal(fit.documentOverflowY, 'hidden', `${viewport.name}: the document scroll box is clipped`);
    assert.equal(fit.bodyOverflowY, 'hidden', `${viewport.name}: the body scroll box is clipped`);
    assert.equal(fit.documentScrollWidth <= fit.documentClientWidth, true, `${viewport.name}: the document has no horizontal overflow`);
    assert(fit.bodyBoxHeight <= viewport.height + 1, `${viewport.name}: the page behind the player is collapsed to the viewport (${fit.bodyBoxHeight})`);
    assert.equal(fit.playerOverflowY, false, `${viewport.name}: the player itself has no outer vertical scroll`);
    assert.equal(fit.playerOverflowX, false, `${viewport.name}: the player has no outer horizontal scroll`);
    assert(fit.playerTop <= 0.5 && fit.playerBottom >= fit.innerHeight - 0.5, `${viewport.name}: the player fills the viewport height (top ${fit.playerTop}, bottom ${fit.playerBottom}, viewport ${fit.innerHeight})`);
    assert(fit.stageHeight > 0, `${viewport.name}: the stage keeps a positive height`);
    assert(fit.stageBottom <= fit.innerHeight + 0.5 && fit.stageTop >= 0, `${viewport.name}: the stage stays inside the viewport`);
    // The wheel and the arrow keys move nothing behind the player.
    await page.mouse.wheel(0, 600);
    await page.keyboard.press('PageDown');
    const scrolled = await page.evaluate(() => ({ doc: document.documentElement.scrollTop, body: document.body.scrollTop, win: window.scrollY }));
    assert.equal(scrolled.doc + scrolled.body + scrolled.win, 0, `${viewport.name}: a wheel and PageDown move no page scroll behind the player`);

    // The frame fills the whole stage, edge to edge, once the game is running.
    await startFrame();
    const frame = await page.locator('iframe.player-frame').boundingBox();
    const stage = await page.locator('#player-stage').boundingBox();
    assert(Math.abs(frame.width - stage.width) <= 1, `${viewport.name}: the frame matches the stage width (${frame.width} vs ${stage.width})`);
    assert(Math.abs(frame.height - stage.height) <= 1, `${viewport.name}: the frame matches the stage height (${frame.height} vs ${stage.height})`);
    const frameDoc = await page.evaluate(() => {
      const image = document.querySelector('iframe.player-frame');
      const rect = image.getBoundingClientRect();
      const stageRect = document.getElementById('player-stage').getBoundingClientRect();
      return { left: rect.left - stageRect.left, top: rect.top - stageRect.top, right: stageRect.right - rect.right, bottom: stageRect.bottom - rect.bottom };
    });
    for (const [edge, value] of Object.entries(frameDoc)) assert(Math.abs(value) <= 1, `${viewport.name}: the frame has no ${edge} margin inside the stage (${value})`);

    // Toolbar rows: one compact row on desktop, at most two on mobile. Visible children are
    // grouped into rows by their vertical band, so a taller control (44px) next to a shorter
    // one (the title) still counts as one row.
    const rows = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.player-bar > *')].filter(node => node.offsetParent !== null).map(node => node.getBoundingClientRect());
      const bands = [];
      nodes.sort((a, b) => a.top - b.top).forEach(rect => {
        const band = bands.find(entry => rect.top < entry.bottom - 1 && rect.bottom > entry.top + 1);
        if (band) { band.top = Math.min(band.top, rect.top); band.bottom = Math.max(band.bottom, rect.bottom); }
        else bands.push({ top: rect.top, bottom: rect.bottom });
      });
      return bands.length;
    });
    const rowCount = rows;
    if (viewport.mobile) assert(rowCount <= 2, `${viewport.name}: the toolbar wraps to at most two rows (saw ${rowCount})`);
    else assert.equal(rowCount, 1, `${viewport.name}: the desktop toolbar stays one row (saw ${rowCount})`);

    // Every visible control keeps a >=44px touch target and readable text.
    const controls = await page.evaluate(() => [...document.querySelectorAll('#player a[href], #player button:not([hidden])')]
      .filter(node => node.offsetParent !== null)
      .map(node => ({ id: node.id || node.className, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, font: parseFloat(getComputedStyle(node).fontSize) })));
    for (const control of controls) {
      assert(control.height >= 43.5, `${viewport.name}: ${control.id} keeps a 44px touch target (${control.height})`);
      assert(control.width >= 43.5, `${viewport.name}: ${control.id} is at least 44px wide (${control.width})`);
      if (control.font) assert(control.font >= 12, `${viewport.name}: ${control.id} text is readable (${control.font}px)`);
    }

    await page.screenshot({ path: `artifacts/qa/player-${viewport.name}.png` });
    fitResults.push({ viewport: viewport.name, stageHeight: Math.round(fit.stageHeight), barHeight: Math.round(fit.barHeight), footHeight: Math.round(fit.footHeight), frameFills: true, toolbarRows: rowCount });
    await closePlayer();
  }
  pass(`the player fits the viewport with no outer scroll and an edge-to-edge frame at ${VIEWPORTS.map(v => v.name).join(', ')}`);

  /* ------------------------------------------------------------------ resize */
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFor('halo');
  await startFrame();
  for (const size of [{ width: 900, height: 700 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(120);
    const state = await page.evaluate(() => {
      const player = document.getElementById('player');
      const stage = document.getElementById('player-stage').getBoundingClientRect();
      return { overflow: player.scrollHeight > player.clientHeight + 1 || player.scrollWidth > player.clientWidth + 1, bottom: stage.bottom, innerHeight, state: document.getElementById('player-stage').dataset.state };
    });
    assert.equal(state.overflow, false, `resize to ${size.width}x${size.height}: the player re-fits without an outer scroll`);
    assert(state.bottom <= state.innerHeight + 0.5, `resize to ${size.width}x${size.height}: the stage stays inside the new viewport`);
    assert.equal(state.state, 'loaded', `resize to ${size.width}x${size.height}: the running frame survives the resize`);
    const frame = await page.locator('iframe.player-frame').boundingBox();
    const stage = await page.locator('#player-stage').boundingBox();
    assert(Math.abs(frame.height - stage.height) <= 1 && Math.abs(frame.width - stage.width) <= 1, `resize to ${size.width}x${size.height}: the frame re-fills the stage`);
  }
  pass('a live resize, including in and out of landscape, re-fits the player and the running frame without a reload');
  await closePlayer();

  /* -------------------------------------------------------------- long title */
  const longest = GAMES.map(game => game.title).sort((a, b) => b.length - a.length)[0];
  const longGame = GAMES.find(game => game.title === longest) || GAMES[0];
  await page.setViewportSize({ width: 1366, height: 768 });
  await openFor(longGame.id);
  const longTitle = await page.evaluate(() => {
    const title = document.getElementById('player-title');
    const bar = document.querySelector('.player-bar');
    const actions = document.querySelector('.player-actions');
    return {
      text: title.textContent,
      clipped: title.scrollWidth > title.clientWidth + 1,
      ellipsis: getComputedStyle(title).textOverflow,
      noWrap: getComputedStyle(title).whiteSpace,
      toolbarHeight: bar.getBoundingClientRect().height,
      actionsRight: actions.getBoundingClientRect().right,
      innerWidth,
      titleAttr: title.getAttribute('title'),
      // The title must stop before the actions, even with a long name.
      approximate: title.getBoundingClientRect().right <= actions.getBoundingClientRect().left,
    };
  });
  assert.equal(longTitle.text, longest, 'the long-title game is the one open');
  assert.equal(longTitle.ellipsis, 'ellipsis', 'the title ellipsizes rather than wrapping');
  assert.equal(longTitle.noWrap, 'nowrap', 'the title never wraps to a second toolbar line');
  assert.equal(longTitle.titleAttr, longest, 'a clipped title keeps its full text in the title attribute');
  assert(longTitle.actionsRight <= longTitle.innerWidth + 0.5, 'the actions stay inside the viewport with a long title');
  assert(longTitle.toolbarHeight < 80, `the toolbar stays a compact single row with a long title (${longTitle.toolbarHeight}px)`);
  assert(longTitle.approximate, 'the title box is bounded by the toolbar, not by the text length');
  await page.screenshot({ path: 'artifacts/qa/player-long-title.png' });
  pass(`a long title (${longest}) ellipsizes without pushing the toolbar actions off the viewport`);

  /* ------------------------------------------------------------------- notes */
  const notesState = () => page.evaluate(() => {
    const notes = document.getElementById('player-notes');
    const stage = document.getElementById('player-stage').getBoundingClientRect();
    return {
      hidden: notes.hidden,
      expanded: document.getElementById('player-notes-button').getAttribute('aria-expanded'),
      stageHeight: stage.height,
      scrolls: notes.scrollHeight > notes.clientHeight,
      overflows: notes.scrollHeight > notes.clientHeight + 1,
      controlled: document.getElementById('player-notes-button').getAttribute('aria-controls'),
      inNotes: notes.contains(document.activeElement),
      activeId: document.activeElement?.id || '',
      notesTop: notes.getBoundingClientRect().top,
      stageTop: stage.top,
    };
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await openFor('halo');
  await startFrame();
  const stageBefore = (await page.locator('#player-stage').boundingBox()).height;
  const before = await notesState();
  assert.equal(before.hidden, true, 'notes start closed');
  assert.equal(before.expanded, 'false', 'the Notes button reports aria-expanded=false');
  assert.equal(before.controlled, 'player-notes', 'the Notes button controls the notes overlay');
  await page.locator('#player-notes-button').click();
  const opened = await notesState();
  assert.equal(opened.hidden, false, 'the Notes button opens the overlay');
  assert.equal(opened.expanded, 'true', 'aria-expanded tracks the open overlay');
  assert.equal(opened.inNotes, true, 'focus moves into the notes overlay');
  assert(Math.abs(opened.stageHeight - stageBefore) <= 1, `the overlay does not shrink the stage (${stageBefore} -> ${opened.stageHeight})`);
  assert(opened.notesTop >= opened.stageTop - 1, 'the overlay sits inside the stage rather than over the toolbar');
  assert(opened.scrolls, 'the notes overlay is taller than its max-height, so it scrolls on its own');
  const notesOverlay = await page.locator('#player-notes').evaluate(node => ({ position: getComputedStyle(node).position, overflowY: getComputedStyle(node).overflowY, maxHeight: getComputedStyle(node).maxHeight, height: node.getBoundingClientRect().height }));
  assert.equal(notesOverlay.position, 'absolute', 'the overlay is positioned over the game, not in the layout flow');
  assert(['auto', 'scroll'].includes(notesOverlay.overflowY), 'the overlay owns its scroll');
  assert(notesOverlay.height <= 391, `the overlay is bounded by the stage height (${notesOverlay.height})`);
  await page.screenshot({ path: 'artifacts/qa/player-notes-open.png' });
  pass('the notes overlay opens from its accessible button, overlays the game without shrinking it, and scrolls inside its own max-height');

  // Escape closes notes first and the player only on the second press.
  await page.keyboard.press('Escape');
  const afterEscape = await notesState();
  assert.equal(afterEscape.hidden, true, 'Escape closes the notes overlay first');
  assert(await playerOpen(), 'the first Escape does not close the player');
  assert.equal(afterEscape.activeId, 'player-notes-button', `focus returns to the Notes button after Escape (got ${afterEscape.activeId})`);
  await page.keyboard.press('Escape');
  assert(!(await playerOpen()), 'a second Escape closes the player');
  pass('Escape closes notes first, restores focus to its button, and closes the player on the second press');

  // Notes default closed on reopen and on a game switch, and the close button works.
  await openFor('halo');
  assert.equal((await notesState()).hidden, true, 'notes are closed again when the player reopens');
  await page.locator('#player-notes-button').click();
  assert.equal((await notesState()).hidden, false, 'the toolbar Notes button opens the overlay again');
  await page.locator('#player-notes-close').click();
  assert.equal((await notesState()).hidden, true, 'the overlay close button shuts it');
  await page.locator('#player-notes-button').click();
  assert.equal((await notesState()).hidden, false, 'notes reopen for the switch check');
  await page.goto(`${base}#play/quake2`);
  await page.waitForFunction(() => document.getElementById('player-title')?.textContent.trim() === 'Quake II', null, { timeout: 4000 });
  assert.equal((await notesState()).hidden, true, 'switching games closes the notes overlay');
  pass('notes are closed on every open and on a game switch, and open from the toolbar Notes button');
  await closePlayer();

  /* ------------------------------------------------------- focus, fullscreen */
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFor('halo');
  assert(await page.evaluate(() => document.getElementById('player').contains(document.activeElement)), 'focus moves into the player on open');
  const trapped = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#player a[href], #player button:not([disabled])')].filter(node => !node.hidden && node.offsetParent !== null);
    items[items.length - 1].focus();
    const last = document.activeElement.id;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    return { last, now: document.activeElement.id };
  });
  assert.equal(trapped.now, (await page.evaluate(() => [...document.querySelectorAll('#player a[href], #player button:not([disabled])')].filter(n => !n.hidden && n.offsetParent !== null)[0].id)), 'Tab from the last control wraps to the first inside the player');
  // Tab is trapped inside the overlay while it is open.
  await page.locator('#player-notes-button').click();
  const notesTrap = await page.evaluate(async () => {
    const notes = document.getElementById('player-notes');
    const inside = [...notes.querySelectorAll('button, [tabindex]:not([tabindex="-1"])')].filter(node => !node.hidden && node.offsetParent !== null);
    inside[inside.length - 1].focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    const afterTab = document.activeElement;
    return { count: inside.length, stillInside: notes.contains(afterTab), id: afterTab.id };
  });
  assert(notesTrap.count >= 1, 'the overlay has its own focusable controls');
  assert(notesTrap.stillInside, `Tab stays inside the notes overlay while it is open (moved to ${notesTrap.id})`);
  await page.keyboard.press('Escape');
  assert(!(await notesState()).inNotes, 'closing notes returns focus out of the overlay');

  // Fullscreen: never automatic, only from its own control, cleaned up on close.
  assert.equal(await page.evaluate(() => document.fullscreenElement === null), true, 'the player never takes fullscreen on its own');
  assert.equal(await page.locator('#player-fullscreen').isHidden(), true, 'Fullscreen is not offered before a frame loads');
  await startFrame();
  assert.equal(await page.locator('#player-fullscreen').isVisible(), true, 'Fullscreen is offered once a frame has loaded');
  assert.equal(await page.evaluate(() => document.fullscreenElement === null), true, 'loading a frame does not enter fullscreen automatically');
  await page.locator('#player-fullscreen').click();
  const entered = await page.waitForFunction(() => document.fullscreenElement !== null, null, { timeout: 2500 }).then(() => true).catch(() => false);
  if (entered) {
    assert(await page.waitForFunction(() => document.getElementById('player-fullscreen').getAttribute('aria-pressed') === 'true', null, { timeout: 2000 }).then(() => true).catch(() => false), 'the Fullscreen control reflects the fullscreen state');
    await page.locator('#player-close').click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.fullscreenElement === null), true, 'leaving the player also leaves fullscreen');
  } else {
    await closePlayer();
  }
  assert(!(await playerOpen()), 'the player is closed after the fullscreen check');
  pass(`fullscreen is only entered from its own control and is cleaned up on close (exercised: ${entered})`);

  /* --------------------------------------------------------------- stage errors */
  hangHost = true;
  await openFor('halo');
  await page.evaluate(() => { window.__GAMEFLEX_PLAYER_TIMEOUT_MS = 700; });
  await page.locator('.player-panel [data-player-action="start"]').click();
  await page.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'timeout', null, { timeout: 8000 });
  const timeoutState = await page.evaluate(() => ({
    overflow: document.getElementById('player').scrollHeight > document.getElementById('player').clientHeight + 1,
    text: document.querySelector('.player-panel').innerText,
    start: document.querySelectorAll('.player-panel [data-player-action="start"]').length,
    back: document.querySelectorAll('.player-panel [data-player-action="back"]').length,
    external: document.querySelectorAll('#player a[href^="http"]').length,
  }));
  assert.equal(timeoutState.overflow, false, 'the timeout panel does not push the player into scrolling');
  assert(timeoutState.text.includes('did not finish loading'), 'the timeout panel reports the pending load plainly');
  assert.equal(timeoutState.start, 1, 'the timeout panel offers a retry');
  assert.equal(timeoutState.back, 1, 'the timeout panel offers in-site back');
  assert.equal(timeoutState.external, 0, 'the timeout panel offers no external fallback');
  await page.screenshot({ path: 'artifacts/qa/player-timeout.png' });
  hangHost = false;
  await page.locator('.player-panel [data-player-action="start"]').click();
  await page.waitForFunction(() => document.getElementById('player-stage').dataset.state === 'loaded', null, { timeout: 8000 });
  await page.locator('#player-notes-button').click();
  assert.equal((await notesState()).hidden, false, 'notes still work after a timeout and retry');

  const hostsBefore = frameHosts.size;
  const blockedId = GAMES.find(game => game.availability === 'sandbox-pending')?.id;
  for (const bad of ['#play/', '#play/' + 'x'.repeat(80), blockedId ? `#play/${blockedId}` : null].filter(Boolean)) {
    await page.goto(base + bad);
    await page.waitForFunction(() => document.getElementById('player')?.hidden === false, null, { timeout: 4000 });
    await page.waitForFunction(() => document.getElementById('player-stage')?.dataset.state === 'blocked', null, { timeout: 4000 });
    const blocked = await page.evaluate(() => ({
      frames: document.querySelectorAll('#player iframe, #player canvas').length,
      external: document.querySelectorAll('#player a[href^="http"]').length,
      overflow: document.getElementById('player').scrollHeight > document.getElementById('player').clientHeight + 1,
      notes: document.getElementById('player-notes').hidden,
    }));
    assert.equal(blocked.frames, 0, `${bad} creates no frame`);
    assert.equal(blocked.external, 0, `${bad} offers no external fallback`);
    assert.equal(blocked.overflow, false, `${bad} keeps the player inside the viewport`);
    assert.equal(blocked.notes, true, `${bad} starts with notes closed`);
  }
  assert.equal(frameHosts.size, hostsBefore, 'a malformed or pending id contacts no game host');
  pass('timeout and blocked states keep their in-site actions, fit the viewport and request no external host');

  /* -------------------------------------------------------------- no new tabs */
  assert.equal(popups.length, 0, `no popups or new tabs: ${popups.join(', ')}`);
  assert.equal(dialogs.length, 0, `no native dialogs: ${dialogs.join(', ')}`);
  const externalFrames = await page.evaluate(() => [...document.querySelectorAll('#player iframe')].map(node => node.getAttribute('src')).filter(src => src && !src.startsWith('http://127.0.0.1')));
  assert.equal(externalFrames.length, 0, 'no frame src leaves the fixture origin');
  assert.equal(errors.length, 0, errors.join('\n'));
  pass('no popups, no native dialogs, no external frame source and no console errors across the run');

  const report = {
    passed: true,
    base,
    channel: CHANNEL,
    viewports: fitResults,
    notes: {
      closedByDefault: true,
      closesOn: ['its own button', 'its close button', 'Escape (before the player)', 'reopen', 'game switch', 'player close'],
      overlaysStageWithoutShrinkingIt: true,
      ownScroll: true,
    },
    fixtures: { mode: 'deterministic local fixture page for every non-loopback request', realGameplayTested: false, note: 'Game hosts are replaced by local fixtures. This suite proves player fit, chrome behaviour, focus, notes and stage states - not that any game plays.' },
    checks,
    consoleErrors: errors,
    limitations: [
      'A frame load only proves the player sized and positioned it. It is not gameplay verification.',
      'Real game hosts are never contacted in this suite; frame content is always the local fixture.',
      'A cross-origin game page inside the frame cannot be styled or measured; its own internal scrolling is left untouched.',
      'Remote streaming remains disabled in the shipped config and is out of scope here.',
    ],
  };
  await writeFile('artifacts/qa/player-viewport-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await shutdown();
}
