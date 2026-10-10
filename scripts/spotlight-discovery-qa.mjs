/**
 * gameflex spotlight-discovery QA — the browse layer of the Spotlight page.
 *
 * Runs the bundled Edge build through the same Playwright rig the other suites use
 * (channel: msedge, no browser download). Playwright is resolved from GAMEFLEX_PLAYWRIGHT,
 * then a normal node_modules lookup, then this repo's node_modules from root or worktree.
 * The page is served by GAMEFLEX_PREVIEW (or http://127.0.0.1:4176) when a preview is
 * already running, otherwise by a private static server over dist/.
 *
 * What it checks (all against the real DOM, no source inspection):
 *   - default browse: a Continue playing preview shelf on a fresh browser (clearly flagged
 *     Preview, writing no launch history), a ranked Top games of exactly ten unique games
 *     (1..10, editorial subtitle) shown as portrait 2:3 covers — ALL TEN carrying a decoded
 *     portrait poster — with a tall lime rank numeral. The lime requirement is the rank GLYPH
 *     only; the shelf heading and subtitle colour is merely reported. Curated rows hold all 54
 *     catalogue ids uniquely at most 8 per row. Resting cards put the game name below the
 *     artwork, every shelf carries a subtitle and a zero-padded count, scrollbars stay hidden
 *     and the first rows decode real images;
 *   - at 1440px exactly six whole cards fit a row (the sixth ends inside the row, the seventh
 *     does not) and the card width matches the computed (100% − 5·gap) ⁄ 6 formula;
 *   - the floating detail panel: opens on hover with title, description, availability and
 *     an action, survives a pointer move into the panel, stays inside the viewport for an
 *     edge card, opens on keyboard focus, closes on Escape (focus returns to the card) and
 *     on an outside click;
 *   - favourites still route through the existing localStorage store and survive a reload;
 *   - a playable card's action opens the ready player with no frame until Start; a
 *     sandbox-pending card's action reaches the blocked player state with no frame and no
 *     new tab;
 *   - search, filter and favourites views all render one responsive grid holding every
 *     match, never a single overflow row;
 *   - touch: the first tap opens the info panel, only the panel's own action plays;
 *   - reduced motion drops the panel animation; a 390px viewport has no horizontal overflow.
 *
 * Fixture: every non-loopback request is answered locally and the suite asserts none were
 * attempted, so no game host is contacted. No gameplay is claimed or verified.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');
const GAMES = JSON.parse(await readFile(path.join(DIST, 'games.json'), 'utf8'));
const VIEWPORT = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
// app.js filter predicate, duplicated so the expected counts are computed the same way.
const matches = (game, search) => `${game.title} ${game.genre} ${game.description} ${game.tags?.join(' ') || ''}`.toLowerCase().includes(search.toLowerCase());

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
const pops = [];
const blockExternal = page => page.route(url => ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname), route => {
  external.push(route.request().url());
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GAMEFLEX QA FIXTURE</title></head><body data-gameflex-fixture="1"><h1>Deterministic QA fixture — not real gameplay</h1></body></html>' });
});

const checks = [];
const pass = label => { checks.push(label); console.log(`ok — ${label}`); };
let browser = null;
const results = { passed: false, games: GAMES.length, shelves: 0, checks, externalRequests: external, errors: [] };

try {
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors = [], consoleErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The optional media map (spotlight-media.json) is absent in this tree, so its fetch 404s;
  // app.js already treats that as "no override". Other console errors are real failures.
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location()?.url || '' }); });
  page.on('popup', popup => pops.push(popup.url()));
  await blockExternal(page);
  const reload = async () => { await page.goto(PAGE_URL); await page.locator('#shelves .sd-card').first().waitFor(); await page.evaluate(() => document.fonts.ready); };
  const panel = () => page.locator('.sd-panel');
  const panelInfo = () => page.evaluate(() => {
    const node = document.querySelector('.sd-panel');
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return {
      title: node.querySelector('.sd-panel-title')?.textContent?.trim() || '',
      copy: node.querySelector('.sd-panel-copy')?.textContent?.trim() || '',
      avail: node.querySelector('.sd-panel-avail')?.textContent?.trim() || '',
      actions: [...node.querySelectorAll('.sd-action')].map(action => ({ tag: action.tagName, play: action.dataset.play || '', details: action.dataset.details || '', favourite: action.dataset.favourite || '', text: action.textContent.trim() })),
      fixed: getComputedStyle(node).position === 'fixed',
      clipped: Boolean(node.closest('.game-row, .sd-shelf, .sd-results')),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
  const cardBox = async locator => locator.evaluate(el => { const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });

  /* -------------------------------------------------------------- default browse */
  await reload();
  const browse = await page.evaluate(() => {
    const shelves = [...document.querySelectorAll('#shelves .sd-shelf')].map(shelf => ({
      kind: shelf.dataset.sdShelf || '',
      id: shelf.querySelector('.game-row')?.id || '',
      cards: shelf.querySelectorAll('.sd-card').length,
      count: shelf.querySelector('h3 small')?.textContent?.trim() || '',
      subtitle: shelf.querySelector('.shelf-subtitle')?.textContent?.trim() || '',
      ranks: [...shelf.querySelectorAll('.sd-rank')].map(node => node.textContent.trim()),
    }));
    return {
      shelves,
      curatedIds: [...document.querySelectorAll('[data-sd-shelf="curated"] [data-game]')].map(node => node.dataset.game),
      topIds: [...document.querySelectorAll('[data-sd-shelf="top"] [data-game]')].map(node => node.dataset.game),
      nameCount: document.querySelectorAll('#shelves .sd-card .sd-name').length,
      namesInsideArt: [...document.querySelectorAll('#shelves .sd-card')].filter(card => card.querySelector('.sd-art')?.contains(card.querySelector('.sd-name'))).length,
      namesBelowArt: [...document.querySelectorAll('#shelves .sd-card')].filter(card => {
        const art = card.querySelector('.sd-art'), name = card.querySelector('.sd-name');
        if (!art || !name) return false;
        return name.getBoundingClientRect().top >= art.getBoundingClientRect().bottom - 2;
      }).length,
      captions: [...document.querySelectorAll('#shelves .sd-card')].reduce((total, card) => total + (card.querySelector('.sd-art') ? [...card.querySelectorAll('.card-title-row, .card-meta, .card-tag, .heart, .info-button, .pending-label, figcaption')].filter(node => !card.querySelector('.sd-art').contains(node)).length : 0), 0),
      scrollbar: [...document.querySelectorAll('#shelves .sd-row')].map(row => getComputedStyle(row).scrollbarWidth),
      rows: document.querySelectorAll('#shelves .game-row').length,
    };
  });
  results.shelves = browse.shelves.length;
  const curatedShelves = browse.shelves.filter(shelf => shelf.kind === 'curated');
  const topShelf = browse.shelves.find(shelf => shelf.kind === 'top');
  const previewShelf = page.locator('[data-sd-shelf="demo"]');
  assert.equal(await previewShelf.count(), 1, 'a fresh visitor sees the Continue playing preview shelf');
  assert(/preview/i.test(await previewShelf.innerText()), 'the fresh Continue playing shelf is clearly flagged as a preview');
  assert.equal(await page.evaluate(() => localStorage.getItem('gameflex:recent')), null, 'the preview shelf writes no launch history to localStorage');
  assert.equal(browse.curatedIds.length, GAMES.length, `every one of the ${GAMES.length} catalogue games sits in the curated rows (found ${browse.curatedIds.length})`);
  assert.equal(new Set(browse.curatedIds).size, GAMES.length, 'every game id is unique across the curated rows — no duplicate or missing game');
  assert(curatedShelves.length >= 4, `the browse layer is split into curated rows (${curatedShelves.length}), not one mega-row`);
  assert(curatedShelves.every(shelf => shelf.cards >= 1 && shelf.cards <= 8), `every curated shelf holds at most 8 cards (largest ${Math.max(...curatedShelves.map(shelf => shelf.cards))})`);
  assert(topShelf && topShelf.cards === 10, `Top games holds exactly ten games (found ${topShelf?.cards})`);
  assert.equal(new Set(browse.topIds).size, 10, 'the ten Top games are distinct');
  assert.deepEqual(topShelf.ranks, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], 'Top games are ranked 1..10 in order');
  assert(/editorial/i.test(topShelf.subtitle) && !/play count|popular|most played/i.test(topShelf.subtitle), `the Top games subtitle is editorial and makes no popularity claim ("${topShelf.subtitle}")`);
  assert(browse.shelves.every(shelf => shelf.subtitle.length > 10 && shelf.count === String(shelf.cards).padStart(2, '0')), 'every shelf carries a subtitle and a zero-padded count matching its cards');
  assert.equal(browse.nameCount, browse.shelves.reduce((n, shelf) => n + shelf.cards, 0), 'every resting card has a name');
  assert.equal(browse.namesInsideArt, 0, 'the game name sits below the artwork, not inside it');
  assert.equal(browse.namesBelowArt, browse.nameCount, 'every resting card paints its name below the artwork');
  assert.equal(browse.captions, 0, 'no meta, tag chip or heart control sits beneath a resting card');
  assert(browse.scrollbar.every(value => value === 'none'), 'every shelf row hides its scrollbar (scrollbar-width: none)');
  assert.equal(browse.rows, browse.shelves.length, 'each shelf renders exactly one row (no nested scroller)');
  const decoded = await page.locator('#catalogue').scrollIntoViewIfNeeded().then(async () => {
    await page.evaluate(() => [...document.querySelectorAll('#shelves .sd-shelf')].slice(0, 2).forEach(shelf => shelf.querySelectorAll('img').forEach(image => image.loading = 'eager')));
    await page.waitForFunction(() => [...document.querySelectorAll('#shelves .sd-shelf')].slice(0, 2).every(shelf => [...shelf.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0)), { timeout: 10000 });
    return page.evaluate(() => {
      const images = [...document.querySelectorAll('#shelves .sd-shelf')].slice(0, 2).flatMap(shelf => [...shelf.querySelectorAll('.sd-art img')]);
      return { total: images.length, decoded: images.filter(image => image.complete && image.naturalWidth > 0).length };
    });
  });
  assert(decoded.total >= 10 && decoded.decoded === decoded.total, `the visible shelves decode real artwork, not placeholders (${decoded.decoded}/${decoded.total} decoded)`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/qa/spotlight-discovery-desktop.png', fullPage: true });
  await page.locator('[data-sd-shelf="top"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.locator('[data-sd-shelf="top"]').screenshot({ path: 'artifacts/qa/spotlight-library-top10.png' });

  /* ---------------------------------------------- Top games: portrait covers, lime rank */
  const top = await page.evaluate(() => {
    const shelf = document.querySelector('[data-sd-shelf="top"]');
    const card = shelf.querySelector('.sd-card');
    const artBox = card.querySelector('.sd-art').getBoundingClientRect();
    const rankNode = card.querySelector('.sd-rank');
    const rankBox = rankNode ? rankNode.getBoundingClientRect() : null;
    const rankStyle = rankNode ? getComputedStyle(rankNode) : null;
    const heading = shelf.querySelector('.shelf-heading h3');
    const count = shelf.querySelector('.shelf-heading h3 small');
    const subtitle = shelf.querySelector('.shelf-subtitle');
    return {
      artW: artBox.width, artH: artBox.height,
      rankH: rankBox ? rankBox.height : 0, rankFont: rankStyle ? parseFloat(rankStyle.fontSize) : 0,
      rankColor: rankStyle ? (rankStyle.webkitTextStrokeColor && rankStyle.webkitTextStrokeColor !== 'rgb(0, 0, 0)' ? rankStyle.webkitTextStrokeColor : rankStyle.color) : '',
      // The user's approved colour change is the glyph itself. The heading/subtitle colour is
      // reported for diagnosis but NOT required to be lime (the earlier requirement over-reached).
      titleColor: heading ? getComputedStyle(heading).color : '',
      countColor: count ? getComputedStyle(count).color : '',
      subColor: subtitle ? getComputedStyle(subtitle).color : '',
      // Every Top card must present a real portrait poster, not a conditional swap-in.
      cards: [...shelf.querySelectorAll('.sd-card')].map(node => {
        const art = node.querySelector('.sd-art'), image = node.querySelector('.sd-art img');
        const box = art.getBoundingClientRect();
        return {
          id: node.dataset.game,
          img: image?.getAttribute('src') || '',
          ratio: box.height ? box.width / box.height : 0,
          portrait: image ? node.querySelector('.sd-art').getAttribute('data-portrait') : '',
          complete: image ? image.complete : false,
          naturalW: image ? image.naturalWidth : 0,
        };
      }),
    };
  });
  const LIME = /196,\s*250,\s*83/;
  assert(Math.abs(top.artW / top.artH - 2 / 3) <= 0.04, `Top games covers are portrait 2:3 (${top.artW.toFixed(0)}×${top.artH.toFixed(0)})`);
  assert(top.rankFont >= 56 && top.rankH >= top.artH * 0.6, `the Top games rank numeral is tall (${top.rankFont}px font, ${Math.round(top.rankH)}px vs cover ${Math.round(top.artH)}px)`);
  assert(LIME.test(top.rankColor), `the rank glyph is lime (${top.rankColor})`);
  // The approved colour change is the glyph only; the heading/subtitle colour is reported, not required.
  console.log(`   note — Top games heading/count/subtitle colours: ${top.titleColor} / ${top.countColor} / ${top.subColor}`);
  // Every Top card shows a real portrait poster: an image src, a 2:3 box, decoded pixels.
  assert.equal(top.cards.length, 10, 'all ten Top cards are present');
  assert.equal(top.cards.every(card => card.img.length > 0), true, `every Top card paints an image, not the fallback swatch (missing: ${top.cards.filter(card => !card.img).map(card => card.id).join(', ') || 'none'})`);
  assert.equal(top.cards.every(card => Math.abs(card.ratio - 2 / 3) <= 0.04), true, `every Top card is portrait 2:3, not conditional (${top.cards.map(card => card.ratio.toFixed(2)).join(', ')})`);
  const topDecoded = await page.evaluate(async () => {
    const images = [...document.querySelectorAll('[data-sd-shelf="top"] .sd-art img')];
    await Promise.all(images.map(image => image.decode().catch(() => {})));
    return images.map(image => ({ src: image.getAttribute('src') || '', complete: image.complete, width: image.naturalWidth }));
  });
  assert.equal(topDecoded.length, 10, 'ten Top card images are present');
  assert.equal(topDecoded.every(entry => entry.src && entry.complete && entry.width > 0), true, `every Top card poster decodes from a real file (${topDecoded.map(entry => entry.width).join(', ')})`);
  // Approved Netflix-style top posters: the poster fills the card width less only the rank gutter,
  // the rank numeral overlaps the poster's left edge (never asserted to stay outside it), every rank
  // 1..10 stays readable, and no card's rank spills into the NEXT card. Rank/art overlap is expected.
  const rankedGeom = await page.evaluate(() => {
    const shelf = document.querySelector('[data-sd-shelf="top"]');
    const cards = [...shelf.querySelectorAll('.sd-card')].slice(0, 10);
    return cards.map((node, index) => {
      const card = node.getBoundingClientRect();
      const art = node.querySelector('.sd-art').getBoundingClientRect();
      const rankNode = node.querySelector('.sd-rank');
      const rank = rankNode ? rankNode.getBoundingClientRect() : null;
      const style = rankNode ? getComputedStyle(rankNode) : null;
      const next = cards[index + 1] ? cards[index + 1].getBoundingClientRect() : null;
      return {
        text: rankNode?.textContent?.trim() || '',
        cardLeft: card.left, cardRight: card.right,
        artLeft: art.left, artRight: art.right,
        // The card is inset a small gutter so the numeral can overlap the poster's left edge.
        artInset: art.left - card.left,
        artRatio: art.height ? art.width / art.height : 0,
        rankRight: rank ? rank.right : 0,
        rankHeight: rank ? rank.height : 0,
        rankFont: style ? parseFloat(style.fontSize) : 0,
        nextLeft: next ? next.left : Infinity,
      };
    });
  });
  assert.equal(rankedGeom.length, 10, 'the ranked row holds ten cards for the overlap check');
  assert(rankedGeom.every(card => card.text === String(rankedGeom.indexOf(card) + 1)), `every card carries its own rank 1..10 (${rankedGeom.map(card => card.text).join(', ')})`);
  assert(rankedGeom.every(card => card.artInset >= 0 && card.artInset <= 40 && card.artRight >= card.cardRight - 40), `each top poster spans the card width bar the rank gutter (inset ${rankedGeom.map(card => Math.round(card.artInset)).join(', ')}px)`);
  assert(rankedGeom.every(card => card.rankFont >= 56 && card.rankHeight >= card.rankFont * 0.7), `every rank 1..10 is readable (fonts ${rankedGeom.map(card => Math.round(card.rankFont)).join(', ')}px, glyph heights ${rankedGeom.map(card => Math.round(card.rankHeight)).join(', ')}px)`);
  // No adjacent-card clip: each rank ends before the next card begins, and inside its own card.
  assert(rankedGeom.every(card => card.rankRight <= card.cardRight + 1 && card.rankRight <= card.nextLeft + 1), `no card's rank numeral clips into the next card (${rankedGeom.map(card => `${card.text}@${Math.round(card.rankRight)}`).join(' ')} / next card starts ${Math.round(rankedGeom[1]?.nextLeft ?? 0)})`);
  pass(`default browse: ${GAMES.length} curated games, unique ids, a ranked Top games of ten as portrait 2:3 covers (all ten with decoded posters) and a tall lime rank glyph, ${curatedShelves.length} curated rows of at most 8, names below the artwork, hidden scrollbars, decoded images`);

  /* --------------------------------------- six whole cards per row at 1440px */
  const fit = await page.evaluate(() => {
    const row = document.querySelector('[data-sd-shelf="top"] .sd-row');
    const style = getComputedStyle(row);
    const cards = [...row.querySelectorAll('.sd-card')];
    const box = row.getBoundingClientRect();
    const gap = parseFloat(style.columnGap) || 0;
    const width = cards[0].getBoundingClientRect().width;
    const inside = index => cards[index].getBoundingClientRect().right <= box.right + 1;
    const content = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { gap, width, cards: cards.length, content, sixInside: inside(5), seventhInside: inside(6), span: 6 * width + 5 * gap, formula: (content - 5 * gap) / 6 };
  });
  assert.equal(fit.sixInside, true, `at 1440px the sixth card still ends inside its row (span ${Math.round(fit.span)}px of ${Math.round(fit.content)}px)`);
  assert.equal(fit.seventhInside, false, 'the seventh card does not fit, so a row of seven keeps its last card one arrow-step away');
  assert(Math.abs(fit.width - fit.formula) <= 1, `card width follows the computed (100% − 5·gap) ⁄ 6 formula (${fit.width.toFixed(1)}px vs ${fit.formula.toFixed(1)}px)`);
  assert(Math.abs(fit.span - fit.content) <= 2, 'six cards plus five gaps fill the row width exactly');
  pass('at 1440px exactly six whole cards fit a row and the seventh overflows, matching the computed width formula');


  /* ------------------------------------------------------- floating detail panel */
  const midCard = page.locator('#shelves .sd-card').nth(1);
  await midCard.locator('.sd-art').hover();
  await panel().waitFor({ timeout: 2000 });
  const shown = await panelInfo();
  assert(shown && shown.fixed && !shown.clipped, 'the panel floats, fixed-positioned and outside the row markup so a row overflow cannot clip it');
  assert(shown.title.length > 1 && shown.copy.length > 20 && shown.avail.length > 10, `the panel carries a title, a description and an availability note ("${shown.avail.slice(0, 40)}…")`);
  assert(shown.actions.some(action => action.play || action.details), 'the panel offers a launch or details action');
  assert(Math.abs(shown.box.width - 301) <= 10, `the floating panel is a compact ~301px wide (measured ${Math.round(shown.box.width)}px)`);
  const actionFont = await page.locator('.sd-panel .sd-action').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  assert(actionFont >= 13, `the panel actions stay readable at a compact size (${actionFont}px)`);
  assert(await page.locator('.sd-panel .sd-action').first().evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'the compact panel action label is not clipped');
  await page.mouse.move(shown.box.x + shown.box.width / 2, shown.box.y + shown.box.height / 2);
  await page.waitForTimeout(500);
  const afterMove = await panelInfo();
  assert(afterMove && afterMove.title === shown.title, 'moving the pointer from the card into the panel keeps it open — no flicker');
  await page.screenshot({ path: 'artifacts/qa/spotlight-library-overlay.png' });
  pass('hovering a card opens a floating panel with title, description, status and an action, and it survives the pointer crossing into it');

  // The right-edge card of the first shelf. The first shelf ("Start here") holds six games, so its
  // last card is global nth(5) — the last card fully inside the row at 1440px (a 7th card would sit
  // past the row edge, one arrow-step away, and could not be hovered without scrolling the row).
  const edgeCard = page.locator('#shelves .sd-shelf').first().locator('.sd-card').last();
  await page.mouse.move(2, 2); await page.waitForTimeout(300);
  await edgeCard.locator('.sd-art').hover();
  await panel().waitFor({ timeout: 2000 });
  const edge = await panelInfo();
  assert(edge.box.x >= -1 && edge.box.x + edge.box.width <= VIEWPORT.width + 1, `an edge card's panel stays horizontally inside the viewport (${Math.round(edge.box.x)}…${Math.round(edge.box.x + edge.box.width)})`);
  assert(edge.box.y >= -1 && edge.box.y + edge.box.height <= VIEWPORT.height + 1, `an edge card's panel stays vertically inside the viewport (${Math.round(edge.box.y)}…${Math.round(edge.box.y + edge.box.height)})`);

  await page.mouse.move(2, 2); await page.waitForTimeout(300);
  const focusCard = page.locator('#shelves .sd-card').nth(3);
  const focusTitle = await focusCard.locator('.sd-art').getAttribute('aria-label');
  await focusCard.locator('.sd-art').focus();
  await panel().waitFor({ timeout: 2000 });
  assert((await panelInfo()).title.length > 1, 'keyboard focus on a card opens the same panel');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert.equal(await panel().count(), 0, 'Escape closes the panel');
  assert(await focusCard.locator('.sd-art').evaluate(el => el === document.activeElement), `Escape returns focus to the card it came from (${focusTitle})`);
  await edgeCard.locator('.sd-art').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  // The three panel actions (Play / Favourite / Info) sit between the card and its neighbour in the
  // tab order, so the fourth Tab lands on the card after the first shelf's last one — global nth(6)
  // with a six-card first shelf. The intent is that focus leaves the panel for the next card, never
  // gets trapped inside it.
  const followingCard = page.locator('#shelves .sd-art').nth(6);
  assert(await followingCard.evaluate(el => el === document.activeElement), 'Tab leaves the last card panel for the next card instead of trapping focus');
  await panel().waitFor();
  await page.keyboard.press('Escape');

  const outsideCard = page.locator('#shelves .sd-card').nth(5);
  await outsideCard.locator('.sd-art').click();
  await panel().waitFor({ timeout: 2000 });
  await page.locator('#catalogue-heading').click();
  await page.waitForTimeout(150);
  assert.equal(await panel().count(), 0, 'an outside click closes the panel');
  pass('keyboard focus opens the panel, Escape closes it and restores focus to the card, an outside click dismisses it');

  /* --------------------------------------------------------------- favourites */
  await reload();
  const favCard = page.locator('#shelves .sd-card').first();
  const favId = await favCard.getAttribute('data-game');
  await favCard.locator('.sd-art').click();
  await panel().waitFor({ timeout: 2000 });
  await page.locator('.sd-panel [data-favourite]').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gameflex:favourites') || '[]'));
  assert(stored.includes(favId), `the panel's favourite control writes ${favId} to the existing gameflex:favourites store`);
  assert.equal(await page.locator('#favourite-count').textContent(), '1', 'the header favourite count updates');
  await reload();
  await page.locator('#shelves .sd-card').first().locator('.sd-art').click();
  await panel().waitFor({ timeout: 2000 });
  assert.equal(await page.locator('.sd-panel [data-favourite]').getAttribute('aria-pressed'), 'true', 'the favourite survives a reload — it is read back from localStorage');
  await page.locator('.sd-panel [data-favourite]').click();
  assert.equal(await page.locator('#favourite-count').textContent(), '0', 'the favourite control toggles back off');
  pass('favourites go through the existing localStorage store and survive a page reload');

  /* ------------------------------------------------------- launch paths and grid */
  await page.locator('#search').fill('');
  const playable = GAMES.find(game => !game.availability && game.category === 'shooters');
  await page.locator('#search').fill(playable.title);
  await page.waitForTimeout(200);
  await page.locator('#shelves .sd-card').first().locator('.sd-art').click();
  await panel().waitFor({ timeout: 2000 });
  assert((await panelInfo()).actions.some(action => action.play === playable.id), `a playable card's panel exposes the launch action for ${playable.id}`);
  await page.locator('.sd-panel [data-play]').click();
  assert.equal(await page.locator('#player').evaluate(el => el.hidden), false, 'the panel action opens the in-site player');
  assert.equal(await page.locator('#player-stage').getAttribute('data-state'), 'ready', 'a playable game reaches the ready player state');
  assert.equal(await page.locator('iframe').count(), 0, 'no frame is created until the visitor presses Start');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#player').evaluate(el => el.hidden), true, 'Escape closes the player again');

  const pending = GAMES.find(game => game.availability === 'sandbox-pending');
  await page.locator('#search').fill(pending.title);
  await page.waitForTimeout(200);
  await page.locator('#shelves .sd-card').first().locator('.sd-art').click();
  await panel().waitFor({ timeout: 2000 });
  assert.equal(await page.locator('.sd-panel .lime').textContent(), 'View status', 'pending entries offer a status action rather than Play');
  await page.locator('.sd-panel [data-play]').click();
  assert.equal(await page.locator('#player-stage').getAttribute('data-state'), 'blocked', 'the pending game reaches the blocked player state, not a playable one');
  assert((await page.locator('.player-panel').innerText()).includes('Sandbox pending'), 'the blocked panel explains the pending state');
  assert.equal(await page.locator('iframe').count(), 0, 'the blocked path never creates a frame');
  await page.locator('#player-close').click();

  const gridCase = async (expected, label) => {
    const shape = await page.evaluate(() => ({
      grid: document.querySelectorAll('#shelves .sd-grid').length,
      rows: document.querySelectorAll('#shelves .game-row').length,
      cards: document.querySelectorAll('#shelves .sd-card').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    assert.equal(shape.grid, 1, `${label}: the results render as one grid`);
    assert.equal(shape.rows, 0, `${label}: the results are not a single overflow row`);
    assert.equal(shape.cards, expected.length, `${label}: every matching game is shown (${shape.cards} of ${expected.length})`);
    assert(shape.overflow <= 0, `${label}: the results do not overflow the page`);
  };
  await page.locator('#search').fill('quake');
  await page.waitForTimeout(200);
  await gridCase(GAMES.filter(game => matches(game, 'quake')), 'search');
  await page.locator('#search').fill('');
  await page.locator('[data-category="puzzle"]').click();
  await page.waitForTimeout(200);
  await gridCase(GAMES.filter(game => game.category === 'puzzle'), 'filter');
  await page.locator('[data-category="all"]').click();
  await page.locator('#shelves .sd-card').first().locator('.sd-art').click();
  await panel().waitFor({ timeout: 2000 });
  const savedId = await page.locator('#shelves .sd-card').first().getAttribute('data-game');
  await page.locator('.sd-panel [data-favourite]').click();
  await page.locator('[data-view="favourites"]').click();
  await page.waitForTimeout(200);
  await gridCase(GAMES.filter(game => game.id === savedId), 'favourites');
  pass('search, filter and favourites all render one responsive grid with every match, never an overflow row');
  await page.locator('[data-view="discover"]').click();

  /* ------------------------------------------------------------- touch + mobile */
  const touchContext = await browser.newContext({ viewport: MOBILE, hasTouch: true, isMobile: true });
  const touch = await touchContext.newPage();
  touch.on('pageerror', error => errors.push(`touch: ${error.message}`));
  await blockExternal(touch);
  await touch.goto(PAGE_URL);
  await touch.locator('#shelves .sd-card').first().waitFor();
  await touch.locator('#shelves .sd-card').first().locator('.sd-art').tap();
  await touch.locator('.sd-panel').waitFor({ timeout: 2000 });
  assert.equal(await touch.locator('#player').evaluate(el => el.hidden), true, 'on touch the first tap opens the info panel without launching anything');
  assert.equal(await touch.locator('iframe').count(), 0, 'the first touch tap creates no frame');
  const touchPanel = await touch.locator('.sd-panel').boundingBox();
  assert(touchPanel.x >= 0 && touchPanel.x + touchPanel.width <= MOBILE.width + 1, 'the touch panel stays inside the 390px viewport');
  const touchGrid = await touch.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert(touchGrid <= 0, 'the 390px spotlight page has no horizontal overflow');
  await touch.locator('.sd-panel [data-play]').click();
  assert.equal(await touch.locator('#player').evaluate(el => el.hidden), false, 'the explicit play control on the touch panel opens the player');
  assert.equal(await touch.locator('#player-stage').getAttribute('data-state'), 'ready', 'only the panel\'s explicit action opens the ready player');
  await touch.screenshot({ path: 'artifacts/qa/spotlight-discovery-mobile.png', fullPage: false });
  pass('touch: the first tap opens info, only the panel action launches the ready player, and 390px has no overflow');

  /* ------------------------------------------------------------ reduced motion */
  const calmContext = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  const calm = await calmContext.newPage();
  await blockExternal(calm);
  await calm.goto(PAGE_URL);
  await calm.locator('#shelves .sd-card').first().waitFor();
  await calm.locator('#shelves .sd-card').nth(1).locator('.sd-art').hover();
  await calm.locator('.sd-panel').waitFor({ timeout: 2000 });
  assert.equal(await calm.locator('.sd-panel').evaluate(el => getComputedStyle(el).animationName), 'none', 'reduced motion removes the panel animation');
  pass('reduced motion still opens the panel, without animation');

  /* ------------------------------------------------------------- no detours */
  assert.deepEqual(pops, [], `no launch path opened a new tab or window: ${pops.join(', ')}`);
  assert.equal(external.length, 0, `no external game host was contacted: ${external.join(', ')}`);
  assert.deepEqual(errors, [], errors.join('\n'));
  const unexpected = consoleErrors.filter(entry => !/spotlight-media\.json/.test(entry.url));
  assert.deepEqual(unexpected.map(entry => `${entry.url} ${entry.text}`), [], 'no console errors other than the optional media map');
  pass('no new tab, no window.open path, no iframe while browsing, no external request, no page errors');

  results.passed = true;
  results.errors = errors;
  results.spotlightMediaMapAbsent = consoleErrors.some(entry => /spotlight-media\.json/.test(entry.url));
  await writeFile('artifacts/qa/spotlight-discovery-report.json', JSON.stringify({ ...results, previewServer: server.preview, base: server.base }, null, 2) + '\n');
  console.log(`\n${checks.length} checks passed${server.preview ? ' against the running preview' : ' against a private dist/ server'}`);
} finally {
  await browser?.close();
  await server.stop();
}
