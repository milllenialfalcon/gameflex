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
 *   - default browse: the Continue playing demo shelf is the page's FIRST shelf and is a
 *     direct-launch shelf — its five cards are #play/<id> anchors carrying data-play and no
 *     aria-haspopup, and hovering or focusing one opens NO detail panel. Then a ranked Top games
 *     of exactly ten unique games (1..10, editorial subtitle) shown as portrait 2:3 covers — ALL
 *     TEN carrying a decoded portrait poster — with a large green-outlined, glowing rank numeral
 *     whose baseline lands on the poster's bottom edge; a ranked card paints no visible .sd-name
 *     (the name lives in the card's accessible label). The shelf heading glyphs are 16px
 *     stroke-only marks parked LEFT of the heading text in the page gutter, vertically centred
 *     across the h3 + subtitle block; the heading title + subtitle keep the first card's left
 *     edge and the title sits in a .sd-title-text span. Curated rows hold all 54 catalogue ids
 *     uniquely at most 8 per row. APPROVED: ordinary shelf cards paint NO caption at all — the
 *     landscape artwork (sourced from spotlight-thumbnails.json where present, which bakes the
 *     name into the picture) is the whole card, so only the card's accessible label still names
 *     the game; the Continue playing row keeps its name line and progress rail. Every shelf
 *     carries a subtitle and a zero-padded count, scrollbars stay hidden and the first rows
 *     decode real images;
 *   - at 1440px exactly six whole cards fit a row (the sixth ends inside the row, the seventh
 *     does not) and the card width matches the computed (100% − 5·gap) ⁄ 6 formula;
 *   - the floating detail panel: opens on hover with title, description, availability and
 *     an action, its background matches the page ground, it is centred on the card's thumbnail
 *     (not the whole card), survives a pointer move into the panel, stays inside the viewport for
 *     an edge card, opens on keyboard focus, closes on Escape (focus returns to the card) and
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
// APPROVED: the landscape artwork map (game id → {image, source}). Ordinary shelf cards and the
// result grid paint `image` when it is a plain local assets/ path, and fall back to the catalogue
// art otherwise. Missing entries are expected for some catalogue games.
const THUMBS = await readFile(path.join(DIST, 'spotlight-thumbnails.json'), 'utf8').then(text => JSON.parse(text)).catch(() => ({}));
const isLocalAsset = value => typeof value === 'string' && value.startsWith('assets/') && !value.includes('..') && !value.includes('\\') && !value.includes('://');
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
  // The catalogue artwork maps (spotlight-media.json, spotlight-thumbnails.json,
  // spotlight-portraits.json) are all shipped in this tree; a missing one would fall back to the
  // catalogue's own art. Other console errors are real failures.
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
      // APPROVED: ordinary shelf cards paint NO caption at all. The ranked Top cards never paint a
      // name line (the numeral must not be overlapped), and ordinary cards leave the name to the
      // artwork; only the direct-launch Continue playing cards keep a name line.
      rankCards: document.querySelectorAll('#shelves .sd-card.sd-ranked').length,
      rankNameCount: document.querySelectorAll('#shelves .sd-card.sd-ranked .sd-name').length,
      directCards: document.querySelectorAll('#shelves .sd-card[data-sd-direct]').length,
      ordinaryNameCount: [...document.querySelectorAll('#shelves .sd-card')].filter(card => !card.classList.contains('sd-ranked') && !card.hasAttribute('data-sd-direct') && card.querySelector('.sd-name')).length,
      // Every ordinary (unranked, non-direct) shelf card must be labelled — the accessible name
      // lives on the artwork button — and its src comes from spotlight-thumbnails.json when present.
      ordinaryArt: [...document.querySelectorAll('#shelves .sd-card')].filter(card => !card.classList.contains('sd-ranked') && !card.hasAttribute('data-sd-direct')).map(card => ({
        id: card.dataset.game,
        src: card.querySelector('.sd-art img')?.getAttribute('src') || '',
        label: card.querySelector('.sd-art')?.getAttribute('aria-label') || '',
      })),
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
  assert.equal(await previewShelf.count(), 1, 'a fresh visitor sees the Continue playing demo shelf');
  assert.equal(await previewShelf.locator('.sd-preview-tag').count(), 0, 'the demo shelf carries no "Preview" badge');
  assert(!/preview/i.test(await previewShelf.innerText()), 'the demo shelf never uses preview wording');
  assert(/start a game/i.test(await previewShelf.innerText()), 'the demo shelf invites the visitor to "Start a game"');
  assert.equal(await previewShelf.locator('.sd-card').count(), 5, `the Continue playing demo holds exactly five cards, not six (found ${await previewShelf.locator('.sd-card').count()})`);
  assert.equal(await page.evaluate(() => localStorage.getItem('gameflex:recent')), null, 'the demo shelf writes no launch history to localStorage');
  assert.equal(browse.curatedIds.length, GAMES.length, `every one of the ${GAMES.length} catalogue games sits in the curated rows (found ${browse.curatedIds.length})`);
  assert.equal(new Set(browse.curatedIds).size, GAMES.length, 'every game id is unique across the curated rows — no duplicate or missing game');
  assert(curatedShelves.length >= 4, `the browse layer is split into curated rows (${curatedShelves.length}), not one mega-row`);
  assert(curatedShelves.every(shelf => shelf.cards >= 1 && shelf.cards <= 8), `every curated shelf holds at most 8 cards (largest ${Math.max(...curatedShelves.map(shelf => shelf.cards))})`);
  assert(topShelf && topShelf.cards === 10, `Top games holds exactly ten games (found ${topShelf?.cards})`);
  assert.equal(new Set(browse.topIds).size, 10, 'the ten Top games are distinct');
  assert.deepEqual(topShelf.ranks, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], 'Top games are ranked 1..10 in order');
  assert(/editorial/i.test(topShelf.subtitle) && !/play count|popular|most played/i.test(topShelf.subtitle), `the Top games subtitle is editorial and makes no popularity claim ("${topShelf.subtitle}")`);
  assert(browse.shelves.every(shelf => shelf.subtitle.length > 10 && shelf.count === String(shelf.cards).padStart(2, '0')), 'every shelf carries a subtitle and a zero-padded count matching its cards');
  const totalCards = browse.shelves.reduce((n, shelf) => n + shelf.cards, 0);
  assert(totalCards > 0, 'the shelves render cards');
  assert.equal(browse.rankCards, 10, `the ranked Top games row holds ten rank cards (found ${browse.rankCards})`);
  assert.equal(browse.rankNameCount, 0, 'no ranked Top card paints a visible .sd-name — the numeral is never overlapped');
  assert.equal(browse.ordinaryNameCount, 0, 'ordinary shelf cards paint no caption at all — the artwork carries the name');
  assert(browse.directCards >= 1, `the Continue playing shelf supplies the only named cards (found ${browse.directCards})`);
  assert.equal(browse.nameCount, browse.directCards, 'only the direct-launch Continue playing cards keep a visible name line');
  assert.equal(browse.namesInsideArt, 0, 'no card name sits inside the artwork');
  assert.equal(browse.namesBelowArt, browse.nameCount, 'the name line sits below the artwork on the cards that keep one');
  assert.equal(browse.captions, 0, 'no meta, tag chip or heart control sits beneath a resting card');
  // APPROVED: every ordinary shelf card is labelled with its game (the accessible name lives on the
  // artwork button) and its artwork is the spotlight-thumbnails.json image where the map supplies a
  // plain local assets/ path.
  const gamesById = new Map(GAMES.map(game => [game.id, game]));
  const unlabelled = browse.ordinaryArt.filter(card => { const game = gamesById.get(card.id); return !game || !card.label.includes(game.title); });
  assert.equal(unlabelled.length, 0, `every ordinary shelf card is labelled with its game name (${unlabelled.map(card => card.id).join(', ') || 'none'})`);
  const mapped = browse.ordinaryArt.filter(card => { const entry = THUMBS[card.id]; return entry && isLocalAsset(entry.image); });
  assert(mapped.length > 0, 'spotlight-thumbnails.json supplies landscape artwork for the shelves');
  const wrongSrc = mapped.filter(card => card.src !== THUMBS[card.id].image);
  assert.equal(wrongSrc.length, 0, `every mapped ordinary card paints its spotlight-thumbnails.json image (${wrongSrc.map(card => `${card.id}:${card.src}`).join(', ') || 'none'})`);
  assert(browse.ordinaryArt.every(card => isLocalAsset(card.src)), `every ordinary card paints a local assets/ image, never an external URL (offenders ${browse.ordinaryArt.filter(card => !isLocalAsset(card.src)).map(card => card.id).join(', ') || 'none'})`);
  assert(browse.scrollbar.every(value => value === 'none'), 'every shelf row hides its scrollbar (scrollbar-width: none)');
  assert.equal(browse.rows, browse.shelves.length, 'each shelf renders exactly one row (no nested scroller)');

  /* ---------------------- Continue playing demo: direct-launch, no floating panel */
  // APPROVED: the fresh-browser Continue playing shelf is the page's FIRST shelf and launches
  // straight through the existing player hash gate — every card's thumbnail is an anchor to
  // #play/<id> carrying data-play, with NO aria-haspopup and NO floating detail panel on hover or
  // focus. Its five cards are the fixed editorial ids.
  const DEMO_IDS = ['halo', 'bo1', 'quake3', 'diablo', 'vicecity'];
  const demoLinks = await page.locator('[data-sd-shelf="demo"] .sd-card .sd-art').evaluateAll(els => els.map(el => ({
    tag: el.tagName, href: el.getAttribute('href') || '', dataPlay: el.getAttribute('data-play') || '',
    haspopup: el.getAttribute('aria-haspopup'), game: el.closest('.sd-card')?.dataset.game || '',
  })));
  assert.deepEqual(demoLinks.map(link => link.game), DEMO_IDS, `the demo shelf shows the fixed editorial ids (${demoLinks.map(link => link.game).join(', ')})`);
  assert(demoLinks.every(link => link.tag === 'A' && link.href === `#play/${link.game}`), 'every demo thumbnail is a direct #play/<id> anchor, the existing player gate');
  assert(demoLinks.every(link => link.dataPlay === link.game), 'every demo anchor carries data-play for its own game');
  assert(demoLinks.every(link => link.haspopup === null), 'demo anchors carry no aria-haspopup — they launch, they do not open a dialog');
  // Hover then keyboard-focus a demo card: no detail panel may appear.
  await page.locator('[data-sd-shelf="demo"] .sd-card').first().locator('.sd-art').hover();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.sd-panel').count(), 0, 'hovering a demo card opens no detail panel — it is a direct-launch shelf');
  await page.mouse.move(2, 2);
  await page.locator('[data-sd-shelf="demo"] .sd-card').nth(1).locator('.sd-art').focus();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.sd-panel').count(), 0, 'keyboard focus on a demo card opens no detail panel either');
  await page.evaluate(() => document.activeElement?.blur());
  // A green launch glyph marks every demo card, and a thin rail labelled "Sample" shows these are
  // samples — never a fabricated game progress figure.
  const demoVisual = await page.locator('[data-sd-shelf="demo"]').evaluate(shelf => {
    const greenish = value => { const [r, g, b] = (String(value).match(/\d+/g) || []).slice(0, 3).map(Number); return [r, g, b].every(Number.isFinite) && g > r + 20 && g > b + 20; };
    const cards = [...shelf.querySelectorAll('.sd-card')];
    return cards.map(card => ({
      green: [...card.querySelectorAll('.sd-name .sd-play-mark svg')].some(node => greenish(getComputedStyle(node).fill)),
      rail: [...card.querySelectorAll('*')].some(node => { const b = node.getBoundingClientRect(); return b.height > 0 && b.height <= 4 && b.width >= 30; }),
      sample: card.querySelector('.sd-rail')?.getAttribute('aria-label') === 'Sample progress',
    }));
  });
  assert.equal(demoVisual.length, 5, 'the demo visual check sees all five cards');
  assert(demoVisual.every(entry => entry.green), 'every demo card carries a green launch glyph');
  assert(demoVisual.every(entry => entry.rail), 'every demo card shows a thin progress rail');
  assert(demoVisual.every(entry => entry.sample), 'the demo rail is labelled Sample, not a fabricated game progress');
  assert.equal(await page.evaluate(() => localStorage.getItem('gameflex:recent')), null, 'the demo shelf is never persisted as history');
  pass('the Continue playing demo is a direct-launch shelf: five #play/<id> anchors with data-play and no aria-haspopup or detail panel, a green launch glyph and a thin Sample rail, nothing persisted');

  /* ------------------------------------ shelf headings: glyph, title span, first-card alignment */
  // APPROVED: the glyph is taken OUT of the heading text and parked in the page's left gutter,
  // sitting LEFT of the h3 + subtitle block and vertically centred across it. The title + subtitle
  // keep the first card's left edge, so the heading column lines up with the row beneath it. The
  // shelf title lives in a .sd-title-text span. Glyphs are shuffled per load but stay stable across
  // a re-render.
  const headings = await page.evaluate(() => [...document.querySelectorAll('#shelves .sd-shelf')].map(shelf => {
    const titleBlock = shelf.querySelector('.sd-shelf-title');
    const heading = titleBlock?.querySelector('h3');
    const glyph = titleBlock?.querySelector('.sd-glyph');
    const svg = glyph?.querySelector('svg');
    const titleText = heading?.querySelector('.sd-title-text');
    const subtitle = titleBlock?.querySelector('.shelf-subtitle');
    const firstCard = shelf.querySelector('.sd-row .sd-card');
    const rect = node => { const box = node?.getBoundingClientRect(); return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height } : null; };
    const svgStyle = svg ? getComputedStyle(svg) : null;
    return {
      kind: shelf.dataset.sdShelf || '',
      glyphBox: rect(glyph), blockBox: rect(titleBlock), titleBox: rect(titleText), subBox: rect(subtitle), firstCardBox: rect(firstCard),
      glyphInH3: Boolean(heading && glyph && heading.contains(glyph)),
      titleText: titleText?.textContent?.trim() || '',
      // Identity token: the glyph's own name attribute when present, else its markup signature.
      // This is never compared to a hard-coded path — only used to tell the marks apart.
      glyphName: (svg?.getAttribute('data-sd-glyph') || svg?.innerHTML || '').trim(),
      glyphFill: svgStyle ? svgStyle.fill : '',
      glyphStroke: svgStyle ? svgStyle.stroke : '',
      glyphStrokeWidth: svgStyle ? parseFloat(svgStyle.strokeWidth) || 0 : 0,
    };
  }));
  assert(headings.length >= 6, `the browse layer renders the shelf headings (${headings.length})`);
  assert(headings.every(entry => entry.titleText.length > 1), 'every heading wraps its title in a .sd-title-text span');
  assert(headings.every(entry => entry.glyphBox && entry.titleBox && entry.blockBox), 'every heading carries a glyph, a title span and its title block');
  assert(headings.every(entry => entry.glyphInH3 === false), 'every heading glyph sits OUTSIDE the h3, beside the h3 + subtitle block');
  // The glyph is a 16px mark parked LEFT of the heading text: its right edge stops before the title
  // text begins, so the title keeps the first card's left edge instead of being pushed in by the mark.
  assert(headings.every(entry => Math.abs(entry.glyphBox.width - 16) <= 2 && Math.abs(entry.glyphBox.height - 16) <= 2), `every heading glyph is a 16px mark (widths ${headings.map(entry => Math.round(entry.glyphBox.width)).join(', ')}px)`);
  assert(headings.every(entry => entry.glyphBox.left < entry.titleBox.left && entry.glyphBox.right <= entry.titleBox.left + 1), `every heading glyph sits LEFT of the heading text (glyph right ${headings.map(entry => Math.round(entry.glyphBox.right)).join(', ')} vs title left ${headings.map(entry => Math.round(entry.titleBox.left)).join(', ')})`);
  // The title + subtitle keep the first card's left edge, so the heading column lines up with the row.
  assert(headings.every(entry => entry.firstCardBox), 'every heading has a first card to align against');
  assert(headings.every(entry => Math.abs(entry.titleBox.left - entry.firstCardBox.left) <= 1), `every heading title is left-aligned with the first card in its row (offsets ${headings.map(entry => Math.round(entry.titleBox.left - entry.firstCardBox.left)).join(', ')}px)`);
  // The glyph centres on the h3 + subtitle block, and the subtitle is left-aligned with the actual
  // heading title text (no per-shelf padding fudge).
  assert(headings.every(entry => Math.abs((entry.glyphBox.top + entry.glyphBox.height / 2) - (entry.blockBox.top + entry.blockBox.height / 2)) <= 3), `every glyph is vertically centred across its h3 + subtitle block (offsets ${headings.map(entry => Math.round((entry.glyphBox.top + entry.glyphBox.height / 2) - (entry.blockBox.top + entry.blockBox.height / 2))).join(', ')}px)`);
  assert(headings.every(entry => entry.subBox && Math.abs(entry.subBox.left - entry.titleBox.left) <= 2), `every subtitle is left-aligned with the actual heading title text (offsets ${headings.map(entry => Math.round((entry.subBox?.left || 0) - entry.titleBox.left)).join(', ')}px)`);
  // Stroke-only marks: no filled glyph survives (the old lime sparkle was fill:currentColor).
  const isNone = value => !value || value === 'none' || /rgba?\(0, 0, 0, 0\)/.test(value);
  assert(headings.every(entry => isNone(entry.glyphFill)), `every shelf glyph is stroke-only — no filled mark (fills ${headings.map(entry => entry.glyphFill).join(', ')})`);
  assert(headings.every(entry => !isNone(entry.glyphStroke) && entry.glyphStrokeWidth > 0), 'every shelf glyph is drawn with a visible stroke');
  assert(headings.every(entry => !/sparkle/i.test(entry.glyphName)), 'no shelf glyph identifies itself as the old sparkle');
  // Shuffled per load: gather the glyph set over several loads and require at least twelve marks.
  const glyphSet = new Set(headings.map(entry => entry.glyphName).filter(Boolean));
  for (let load = 0; load < 4; load += 1) {
    await reload();
    const names = await page.evaluate(() => [...document.querySelectorAll('#shelves .sd-shelf')].map(shelf => {
      const svg = shelf.querySelector('.sd-glyph svg');
      return ((svg?.getAttribute('data-sd-glyph') || svg?.innerHTML || '')).trim();
    }));
    names.forEach(name => { if (name) glyphSet.add(name); });
  }
  assert(glyphSet.size >= 12, `the shelf glyph set holds at least twelve distinct marks (found ${glyphSet.size})`);
  // Stable across a re-render: a search that swaps in the results grid and a clear back to browse
  // must NOT reshuffle the glyphs already assigned to each shelf id.
  // Keyed by the shelf title, not by data-sd-shelf: the curated kind repeats across the curated
  // rows, so a kind-only key would silently collapse them and the keys assert below could pass on a
  // handful of entries. The title text is unique per shelf.
  const glyphMap = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#shelves .sd-shelf')].map(shelf => {
    const svg = shelf.querySelector('.sd-glyph svg');
    const key = shelf.querySelector('.sd-title-text')?.textContent?.trim() || '';
    return [key, ((svg?.getAttribute('data-sd-glyph') || svg?.innerHTML || '')).trim()];
  })));
  const beforeRerender = await glyphMap();
  await page.locator('#search').fill('quake');
  await page.waitForTimeout(200);
  await page.locator('#search').fill('');
  await page.waitForTimeout(300);
  const afterRerender = await glyphMap();
  assert(Object.keys(beforeRerender).length >= 6, 'the re-render check saw the full shelf set');
  assert.deepEqual(afterRerender, beforeRerender, 'the shelf glyphs are stable across a re-render — a filter/search does not reshuffle them');
  pass(`shelf headings: a 16px stroke-only glyph parked LEFT of the heading text, vertically centred on the h3 + subtitle block, the title in a .sd-title-text span aligned with the first card, subtitles left-aligned with the title text, ${glyphSet.size} distinct glyphs shuffled per load and stable across a re-render`);
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

  /* ------------------------------------------- Top games: portrait covers, green rank */
  const top = await page.evaluate(() => {
    const shelf = document.querySelector('[data-sd-shelf="top"]');
    const card = shelf.querySelector('.sd-card');
    const artBox = card.querySelector('.sd-art').getBoundingClientRect();
    const rankNode = card.querySelector('.sd-rank');
    const rankBox = rankNode ? rankNode.getBoundingClientRect() : null;
    const rankStyle = rankNode ? getComputedStyle(rankNode) : null;
    const rankText = rankNode?.querySelector('text');
    const textStyle = rankText ? getComputedStyle(rankText) : null;
    const svgStyle = rankText ? getComputedStyle(rankText.ownerSVGElement) : null;
    const heading = shelf.querySelector('.shelf-heading h3');
    const count = shelf.querySelector('.shelf-heading h3 small');
    const subtitle = shelf.querySelector('.shelf-subtitle');
    return {
      artW: artBox.width, artH: artBox.height,
      rankH: rankBox ? rankBox.height : 0, rankFont: rankStyle ? parseFloat(rankStyle.fontSize) : 0,
      // APPROVED: the numeral is a neon-green outline that glows, its baseline landed on the
      // poster's bottom edge, layered BEHIND the portrait. Capture stroke, fill, glow and both
      // stacking orders.
      rankStroke: textStyle?.stroke || '',
      rankFill: textStyle?.fill || '',
      rankGlow: svgStyle?.filter || '',
      rankBottom: rankBox ? rankBox.bottom : 0,
      artBottom: artBox.bottom,
      rankZ: rankNode ? (Number(getComputedStyle(rankNode).zIndex) || 0) : 0,
      artZ: Number(getComputedStyle(card.querySelector('.sd-art')).zIndex) || 0,
      // APPROVED: the Top games heading is warm white; its count and subtitle are muted.
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
  const channels = value => (String(value).match(/\d+/g) || []).slice(0, 3).map(Number);
  // A neon-green mark: green dominates both other channels.
  const isGreenish = value => { const [r, g, b] = channels(value); return [r, g, b].every(Number.isFinite) && g > r + 20 && g > b + 20; };
  assert(Math.abs(top.artW / top.artH - 2 / 3) <= 0.04, `Top games covers are portrait 2:3 (${top.artW.toFixed(0)}×${top.artH.toFixed(0)})`);
  // APPROVED: the numeral is large — its em-size is at least as big as the portrait it sits behind
  // (no tiny hard-coded font-size floor carried over from the previous layout; the rank glyph uses
  // line-height:.9, so its measured box is a little shorter than its em-size — the font size is the
  // honest size signal).
  assert(top.rankFont >= top.artH * 0.9, `the Top games rank numeral is as large as its portrait (${Math.round(top.rankFont)}px numeral vs ${Math.round(top.artH)}px cover)`);
  assert(isGreenish(top.rankStroke), `the rank numeral is outlined in neon green (${top.rankStroke})`);
  assert(top.rankGlow && top.rankGlow !== 'none', `the rank numeral glows (text-shadow ${top.rankGlow})`);
  const [fr, fg, fb] = channels(top.rankFill);
  assert(!LIME.test(top.rankFill) && (fr + fg + fb) < 320, `the rank numeral fill is not a solid lime fill (${top.rankFill})`);
  // APPROVED: the numeral's baseline lands on the poster's bottom edge.
  assert(Math.abs(top.rankBottom - top.artBottom) <= 6, `the rank numeral is bottom-aligned with the poster (rank ${Math.round(top.rankBottom)} vs poster ${Math.round(top.artBottom)})`);
  // APPROVED: the numeral sits BEHIND the portrait — the portrait paints in front of it.
  assert(top.artZ > top.rankZ, `the portrait paints in front of the rank numeral (art z-index ${top.artZ} > rank z-index ${top.rankZ})`);
  // APPROVED: the Top games heading is warm white; the count and subtitle are muted.
  const topHeading = channels(top.titleColor), topCount = channels(top.countColor), topSub = channels(top.subColor);
  assert(topHeading.length === 3 && topHeading.every(channel => channel >= 200) && Math.max(...topHeading) - Math.min(...topHeading) <= 26, `the Top games heading is warm white (${top.titleColor})`);
  // APPROVED: the green accent is confined to the rank numeral — the heading itself is not lime.
  assert(!LIME.test(top.titleColor), `the Top games heading is not lime (${top.titleColor})`);
  assert(topCount.length === 3 && Math.max(...topCount) < 200, `the Top games count is muted, not warm white (${top.countColor})`);
  assert(topSub.length === 3 && Math.max(...topSub) < 200, `the Top games subtitle is muted, not warm white (${top.subColor})`);
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
  // APPROVED: the portrait is smaller than an oversized grey-outlined numeral that sits BEHIND it
  // (Netflix style) and never covers the poster. Every rank 1..10 stays inside its own card, and
  // no hard-coded tiny font-size / inset floor from the previous layout is assumed.
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
        cardLeft: card.left, cardRight: card.right, cardWidth: card.width,
        artLeft: art.left, artRight: art.right, artHeight: art.height,
        // The card is inset a small gutter so the numeral can overlap the poster's left edge.
        artInset: art.left - card.left,
        artRatio: art.height ? art.width / art.height : 0,
        rankLeft: rank ? rank.left : 0,
        rankRight: rank ? rank.right : 0,
        rankHeight: rank ? rank.height : 0,
        rankFont: style ? parseFloat(style.fontSize) : 0,
        rankZ: style ? (Number(style.zIndex) || 0) : 0,
        artZ: Number(getComputedStyle(node.querySelector('.sd-art')).zIndex) || 0,
        nextLeft: next ? next.left : Infinity,
      };
    });
  });
  assert.equal(rankedGeom.length, 10, 'the ranked row holds ten cards for the overlap check');
  assert(rankedGeom.every(card => card.text === String(rankedGeom.indexOf(card) + 1)), `every card carries its own rank 1..10 (${rankedGeom.map(card => card.text).join(', ')})`);
  // The numeral is large relative to its card, and every rank stays fully inside its own card.
  assert(rankedGeom.every(card => card.rankFont >= card.cardWidth * 0.7), `every rank numeral is large relative to its card (font/card ${rankedGeom.map(card => `${Math.round(card.rankFont)}/${Math.round(card.cardWidth)}`).join(', ')})`);
  assert(rankedGeom.every(card => card.rankFont >= card.artHeight * 0.9), `every rank numeral is at least as tall as its smaller portrait (font/cover ${rankedGeom.map(card => `${Math.round(card.rankFont)}/${Math.round(card.artHeight)}`).join(', ')})`);
  assert(rankedGeom.every(card => card.rankLeft >= card.cardLeft - 1 && card.rankRight <= card.cardRight + 1), `every rank numeral stays inside its own card width (${rankedGeom.map(card => `${card.text}@${Math.round(card.rankLeft)}–${Math.round(card.rankRight)}`).join(' ')})`);
  // Not covering the poster: the numeral is layered BEHIND the portrait on every card.
  assert(rankedGeom.every(card => card.artZ > card.rankZ), 'the portrait paints in front of the numeral on every card (z-index art > rank)');
  // The compressed pair must remain visible before the portrait, with both digits present.
  const rankTen = rankedGeom[9];
  assert(rankTen.text === '10' && rankTen.rankRight > rankTen.rankLeft && rankTen.artLeft - rankTen.rankLeft >= rankTen.cardWidth * .35, 'rank 10 has both digits and a clear region beside the poster');
  // A ranked card paints no visible .sd-name, so the numeral is never overlapped; the card's
  // accessible label still names the game and its rank.
  const rankedLabels = await page.locator('[data-sd-shelf="top"] .sd-art').evaluateAll(els => els.map(el => el.getAttribute('aria-label') || ''));
  assert.equal(rankedLabels.length, 10, 'every ranked card exposes one accessible label');
  assert(rankedLabels.every((label, index) => new RegExp(`^Rank ${index + 1}, show details for .+,`).test(label)), `every ranked card's label names its rank then its game (${rankedLabels[0]} … ${rankedLabels[9]})`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the spotlight browse has no horizontal overflow');
  pass(`default browse: ${GAMES.length} curated games, unique ids, a ranked Top games of ten as portrait 2:3 covers (all ten with decoded posters) and a large neon-green rank numeral, glowing and bottom-aligned to each poster, behind it, ${curatedShelves.length} curated rows of at most 8, ordinary cards captionless with labelled local artwork and only the Continue playing cards named, hidden scrollbars, decoded images, no overflow`);

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
  // The panel is a curated-shelf affordance; the demo shelf is direct-launch (checked above). Use
  // curated cards from the middle of the catalogue so the panel is measured unclamped.
  const curatedCards = page.locator('[data-sd-shelf="curated"] .sd-card');
  const midCard = curatedCards.nth(4);
  await page.mouse.move(2, 2);
  await midCard.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(150);
  await midCard.locator('.sd-art').hover();
  await panel().waitFor({ timeout: 2000 });
  const shown = await panelInfo();
  assert(shown && shown.fixed && !shown.clipped, 'the panel floats, fixed-positioned and outside the row markup so a row overflow cannot clip it');
  assert(shown.title.length > 1 && shown.copy.length > 20 && shown.avail.length > 10, `the panel carries a title, a description and an availability note ("${shown.avail.slice(0, 40)}…")`);
  assert(shown.actions.some(action => action.play || action.details), 'the panel offers a launch or details action');
  assert(Math.abs(shown.box.width - 301) <= 10, `the floating panel is a compact ~301px wide (measured ${Math.round(shown.box.width)}px)`);
  // APPROVED: the panel background matches the page ground, and the panel centres on the card's
  // thumbnail — here the card sits mid-page so the placement is unclamped.
  const grounds = await page.evaluate(() => ({
    panel: getComputedStyle(document.querySelector('.sd-panel')).backgroundColor,
    page: getComputedStyle(document.body).backgroundColor,
  }));
  assert.equal(grounds.panel, grounds.page, `the panel background matches the page ground (${grounds.panel} vs ${grounds.page})`);
  const midArt = await midCard.locator('.sd-art').boundingBox();
  const panelCenterX = shown.box.x + shown.box.width / 2, panelCenterY = shown.box.y + shown.box.height / 2;
  const artCenterX = midArt.x + midArt.width / 2, artCenterY = midArt.y + midArt.height / 2;
  assert(Math.abs(panelCenterX - artCenterX) <= 2, `the panel is centred on the card's thumbnail horizontally (panel ${Math.round(panelCenterX)} vs thumbnail ${Math.round(artCenterX)})`);
  assert(Math.abs(panelCenterY - artCenterY) <= 2, `the panel is centred on the card's thumbnail vertically when unclamped (panel ${Math.round(panelCenterY)} vs thumbnail ${Math.round(artCenterY)})`);
  const actionFont = await page.locator('.sd-panel .sd-action').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  assert(actionFont >= 13, `the panel actions stay readable at a compact size (${actionFont}px)`);
  assert(await page.locator('.sd-panel .sd-action').first().evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'the compact panel action label is not clipped');
  await page.mouse.move(shown.box.x + shown.box.width / 2, shown.box.y + shown.box.height / 2);
  await page.waitForTimeout(500);
  const afterMove = await panelInfo();
  assert(afterMove && afterMove.title === shown.title, 'moving the pointer from the card into the panel keeps it open — no flicker');
  await page.screenshot({ path: 'artifacts/qa/spotlight-library-overlay.png' });
  pass('hovering a curated card opens a floating panel that matches the page ground and is centred on the card thumbnail, with title, description, status and an action; it survives the pointer crossing into it');

  // A right-edge card: its panel stays inside the viewport.
  const edgeCard = curatedCards.nth(9);
  await page.mouse.move(2, 2); await page.waitForTimeout(300);
  await edgeCard.locator('.sd-art').hover();
  await panel().waitFor({ timeout: 2000 });
  const edge = await panelInfo();
  assert(edge.box.x >= -1 && edge.box.x + edge.box.width <= VIEWPORT.width + 1, `an edge card's panel stays horizontally inside the viewport (${Math.round(edge.box.x)}…${Math.round(edge.box.x + edge.box.width)})`);
  assert(edge.box.y >= -1 && edge.box.y + edge.box.height <= VIEWPORT.height + 1, `an edge card's panel stays vertically inside the viewport (${Math.round(edge.box.y)}…${Math.round(edge.box.y + edge.box.height)})`);

  await page.mouse.move(2, 2); await page.waitForTimeout(300);
  const focusCard = curatedCards.nth(6);
  const focusTitle = await focusCard.locator('.sd-art').getAttribute('aria-label');
  await focusCard.locator('.sd-art').focus();
  await panel().waitFor({ timeout: 2000 });
  assert((await panelInfo()).title.length > 1, 'keyboard focus on a card opens the same panel');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert.equal(await panel().count(), 0, 'Escape closes the panel');
  assert(await focusCard.locator('.sd-art').evaluate(el => el === document.activeElement), `Escape returns focus to the card it came from (${focusTitle})`);
  // Tab out of the panel: the module moves focus to the NEXT .sd-art in the document, so derive that
  // next card from the live DOM instead of assuming a shelf position.
  await edgeCard.locator('.sd-art').focus();
  const edgeArtIndex = await edgeCard.locator('.sd-art').evaluate(el => [...document.querySelectorAll('#shelves .sd-art')].indexOf(el));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const tabbed = await page.evaluate(() => {
    const arts = [...document.querySelectorAll('#shelves .sd-art')];
    const active = document.activeElement;
    return { index: arts.indexOf(active), label: active?.getAttribute('aria-label') || '' };
  });
  assert.equal(tabbed.index, edgeArtIndex + 1, `Tab leaves the panel for the very next card in the DOM, not a trapped focus (${tabbed.label})`);
  await panel().waitFor();
  await page.keyboard.press('Escape');

  const outsideCard = curatedCards.nth(2);
  await outsideCard.locator('.sd-art').click();
  await panel().waitFor({ timeout: 2000 });
  await page.locator('#catalogue-heading').click();
  await page.waitForTimeout(150);
  assert.equal(await panel().count(), 0, 'an outside click closes the panel');
  pass('keyboard focus opens the panel, Escape closes it and restores focus to the card, Tab leaves for the next card, an outside click dismisses it');


  /* --------------------------------------------------------------- favourites */
  await reload();
  const favCard = page.locator('[data-sd-shelf="curated"] .sd-card').first();
  const favId = await favCard.getAttribute('data-game');
  await favCard.locator('.sd-art').click();
  await panel().waitFor({ timeout: 2000 });
  await page.locator('.sd-panel [data-favourite]').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gameflex:favourites') || '[]'));
  assert(stored.includes(favId), `the panel's favourite control writes ${favId} to the existing gameflex:favourites store`);
  assert.equal(await page.locator('#favourite-count').textContent(), '1', 'the header favourite count updates');
  await reload();
  await page.locator('[data-sd-shelf="curated"] .sd-card').first().locator('.sd-art').click();
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
  await page.locator('[data-sd-shelf="curated"] .sd-card').first().locator('.sd-art').click();
  await panel().waitFor({ timeout: 2000 });
  const savedId = await page.locator('[data-sd-shelf="curated"] .sd-card').first().getAttribute('data-game');
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
  // The demo shelf is direct-launch, so open the panel on a curated card.
  await touch.locator('[data-sd-shelf="curated"] .sd-card').first().locator('.sd-art').tap();
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
  await calm.locator('[data-sd-shelf="curated"] .sd-card').nth(1).locator('.sd-art').hover();
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
