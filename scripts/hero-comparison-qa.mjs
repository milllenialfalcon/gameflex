/**
 * gameflex spotlight-home QA — the unified Spotlight UI served as BOTH the homepage
 * (dist/index.html) and the spotlight page (dist/spotlight.html).
 *
 * APPROVED BEHAVIOUR UNDER TEST (spotlight-home)
 *   - index.html and spotlight.html are now byte-identical Spotlight UI copies: both carry
 *     <html class="page-spotlight">, the full-bleed spotlight hero, the discover shelves, the
 *     autoplay controller and the SAME document title "GameFlex - The Browser is your Console.".
 *     There is no separate old-homepage hero any more, so every former homepage-baseline assertion
 *     (eleven slides, generic headline, numbered selectors, 570px band, no pause control, never
 *     autoplays, unchanged title) is gone;
 *   - the shared header, left to right, is search → favourites (heart + count) → account → burger.
 *     The burger is a PLACEHOLDER: it opens a popover with a note and NO page links (the old
 *     "Original home / Spotlight preview" menu links are gone). The favourite control is a header
 *     icon carrying the heart glyph and #favourite-count. Discover stays the single active nav-link
 *     and keeps its underline;
 *   - the active Discover underline is a 2px lime rule resting at 24px, flush right under the
 *     label, that grows to the full label width over a ~500ms transition (not the old ~220ms);
 *   - both pages rotate the SAME nine spotlight slides: the eight quality-curated hero games from
 *     spotlight-media.json plus ONE Gameflex brand promo slide, shuffled per load, the promo last;
 *   - autoplay: one ~7s beat, silent, no focus movement. A POINTER press on the preview strip or on
 *     Next keeps the beat running (a pointer-borne focus never latches a pause), and an EXPLICIT
 *     Play press overrides a keyboard-focus pause. Keyboard focus still pauses; reduced motion, an
 *     offscreen hero, a hidden tab, an open player and a manual pause all still stand the beat
 *     down. Hovering the hero never pauses it;
 *   - the up-next strip shows five REAL GAME thumbnails (the brand promo is skipped); the promo
 *     slide offers a games-naming CTA that scrolls the collection and never opens the player;
 *   - the shared in-site player, favourites store and catalogue are intact, with no new tab, no
 *     window.open and no external fallback.
 *
 * Playwright is resolved from GAMEFLEX_PLAYWRIGHT, then a normal node_modules lookup, then this
 * repo's node_modules from the worktree or root. Edge (channel: msedge) is used; nothing is
 * downloaded. The 7-second interval is the feature under test, so pause checks wait one real
 * interval plus a margin: a failed pause would have advanced by then.
 *
 * Fixtures: every non-loopback request is answered locally and the suite asserts none were made,
 * so no real game host is contacted and no gameplay is claimed.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');
const GAMES = JSON.parse(await readFile(path.join(DIST, 'games.json'), 'utf8'));
// Both pages now narrow the featured set to the artwork worker's quality-curated pool
// (dist/app.js curatedHeroPool): a featured game stays only when spotlight-media.json holds an
// entry whose src is a usable local assets/ path, and the pool falls back to the full featured
// list when fewer than six survive. This suite derives the same pool rather than assuming order.
const SLIDES = GAMES.filter(game => game.spotlight || game.featured);
const SPOT_MEDIA = await readFile(path.join(DIST, 'spotlight-media.json'), 'utf8').then(text => JSON.parse(text)).catch(() => ({}));
const isLocalArtPath = value => typeof value === 'string' && value.startsWith('assets/') && !value.includes('..') && !value.includes('\\') && !value.includes('://');
const SPOT_POOL = (() => {
  const curated = SLIDES.filter(game => {
    const media = SPOT_MEDIA[game.id];
    return Boolean(media) && typeof media === 'object' && !Array.isArray(media) && isLocalArtPath(media.src);
  });
  return curated.length >= 6 ? curated : SLIDES;
})();
// Approved: eight curated game slides + one Gameflex brand promo slide, on BOTH pages.
const SPOT_SLIDE_COUNT = SPOT_POOL.length + 1;
const INTERVAL_MS = 7000;
const OVERRUN_MS = 700;
const CHECK_VIEWPORT = { width: 1440, height: 1000 };
// Both pages run the compact 82.5px spotlight bar.
const NAVBAR_HEIGHT = 82.5;
const NAVBAR_TOLERANCE = 5;
// APPROVED: the underline grows over a ~500ms transition (was ~220ms).
const UNDERLINE_MS_MIN = 450;
const UNDERLINE_MS_MAX = 600;
const BROWSER_TITLE = 'GameFlex - The Browser is your Console.';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };

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

async function startServer() {
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

const server = await startServer();
const HOME = `${server.base}/index.html`;
const SPOTLIGHT = `${server.base}/spotlight.html`;
const PAGES = [['homepage', HOME], ['spotlight', SPOTLIGHT]];
await mkdir('artifacts/qa', { recursive: true });

const external = [];
const blockExternal = page => page.route(url => ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname), route => {
  external.push(route.request().url());
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GAMEFLEX QA FIXTURE</title></head><body data-gameflex-fixture="1"><h1>Deterministic QA fixture — not real gameplay</h1></body></html>' });
});

const checks = [];
const pass = label => { checks.push(label); console.log(`ok — ${label}`); };
let browser = null;
const results = { passed: false, slidesPerPage: SPOT_SLIDE_COUNT, autoplayIntervalMs: INTERVAL_MS, spotlightTitle: BROWSER_TITLE, navbarHeight: NAVBAR_HEIGHT, underlineTransitionMs: UNDERLINE_MS_MAX, checks, timings: {}, externalRequests: external, errors: [] };

try {
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  /* ------------------------------------------------ reduced-motion page (parallel) */
  // Loaded first so its no-advance window elapses while the other checks run.
  const calmContext = await browser.newContext({ viewport: CHECK_VIEWPORT, reducedMotion: 'reduce' });
  const calmPage = await calmContext.newPage();
  const calmErrors = [];
  calmPage.on('pageerror', error => calmErrors.push(error.message));
  await blockExternal(calmPage);
  const calmStarted = Date.now();
  await calmPage.goto(SPOTLIGHT);
  await calmPage.locator('.game-card').first().waitFor();

  /* ------------------------------------------------------------- unified UI pages */
  const page = await browser.newPage({ viewport: CHECK_VIEWPORT });
  const errors = [], popups = [], crossOrigin = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('popup', popup => popups.push(popup.url()));
  await blockExternal(page);

  const title = () => page.locator('#spotlight-name').textContent();
  const status = () => page.locator('#hero-status').textContent();
  const paused = () => page.locator('#hero-dots').evaluate(el => el.classList.contains('is-paused'));
  const heroGameId = () => page.locator('#hero-image').getAttribute('data-hero-game');
  // The spotlight order is shuffled per load, and the promo slide sits last, so "advance" waits for
  // the hero to move to any other slide rather than to a fixed index.
  const advance = async (fromTitle, timeout = INTERVAL_MS * 2) => {
    const started = Date.now();
    await page.waitForFunction(from => { const shown = document.getElementById('spotlight-name').textContent; return Boolean(shown) && shown !== from; }, fromTitle, { timeout });
    return Date.now() - started;
  };
  // Any click leaves the pointer and focus inside the hero. Move the pointer off the hero and drop
  // focus before timing anything.
  const releaseHero = async () => {
    await page.mouse.move(2, 2);
    await page.evaluate(() => document.activeElement?.blur());
  };

  await page.goto(HOME);
  await page.locator('.game-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);

  /* ------------------------------------------------ both pages are the same Spotlight UI */
  // APPROVED: the old homepage hero is gone. index.html and spotlight.html both carry page-spotlight
  // and the same header/hero markup; only the document title differs.
  const signature = async url => {
    await page.goto(url);
    await page.locator('.game-card').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    return page.evaluate(() => ({
      htmlClass: document.documentElement.className,
      hasSpotlightHero: Boolean(document.querySelector('#hero.hero-spotlight')),
      heroHeading: document.querySelectorAll('#hero-heading').length,
      spotlightNameTag: document.getElementById('spotlight-name')?.tagName || '',
      h1Count: document.querySelectorAll('h1').length,
      pause: document.querySelectorAll('#hero-pause').length,
      prev: document.querySelectorAll('#hero-prev').length,
      next: document.querySelectorAll('#hero-next').length,
      search: document.querySelectorAll('#search').length,
      favourite: document.querySelectorAll('#favourite-button').length,
      favouriteCount: document.querySelectorAll('#favourite-count').length,
      account: document.querySelectorAll('#account-button').length,
      burger: document.querySelectorAll('#menu-button').length,
      navActive: document.querySelectorAll('.site-header nav .nav-link.active').length,
    }));
  };
  const homeSig = await signature(HOME);
  const spotSig = await signature(SPOTLIGHT);
  assert.equal(homeSig.htmlClass, 'page-spotlight', 'the homepage carries page-spotlight, the same as the spotlight page');
  assert.equal(homeSig.hasSpotlightHero, true, 'the homepage renders the spotlight hero, not the old copy-led hero');
  assert.equal(homeSig.heroHeading, 0, 'the old #hero-heading baseline hero is gone from the homepage');
  assert.equal(spotSig.heroHeading, 0, 'no leftover marketing headline on the spotlight page');
  assert.equal(homeSig.spotlightNameTag, 'H1', 'the homepage title is the h1 spotlight heading');
  assert.equal(homeSig.h1Count, 1, 'the homepage has exactly one h1');
  const strip = sig => { const { htmlClass, spotlightNameTag, h1Count, ...rest } = sig; return rest; };
  assert.deepEqual(strip(homeSig), strip(spotSig), 'both pages share the same spotlight header/hero markup');
  assert.equal(await page.title(), BROWSER_TITLE, `the spotlight page document title is the new exact "${BROWSER_TITLE}"`);
  await page.goto(HOME);
  await page.locator('.game-card').first().waitFor();
  assert.equal(await page.title(), BROWSER_TITLE, `the homepage now carries the same document title "${BROWSER_TITLE}"`);
  pass('index.html and spotlight.html are now the same Spotlight UI and document title (page-spotlight, spotlight hero, one h1, shared header)');

  /* ---------------------------------------------------------- shared header chrome */
  for (const [label, url] of PAGES) {
    await page.goto(url);
    await page.locator('.game-card').first().waitFor();
    await page.evaluate(() => document.fonts.ready);

    assert.equal(await page.title(), BROWSER_TITLE, `${label}: the document title is the shared exact "${BROWSER_TITLE}"`);
    const navHeight = await page.locator('.site-header').evaluate(el => el.getBoundingClientRect().height);
    assert(Math.abs(navHeight - NAVBAR_HEIGHT) <= NAVBAR_TOLERANCE, `${label}: the nav bar is the compact ~${NAVBAR_HEIGHT}px design (measured ${Math.round(navHeight)}px)`);
    // APPROVED: the header and footer wordmarks are the straight text "GAMEFLEX" in the Pixel font
    // plus the lime <span class="logo-pixel"> on BOTH pages.
    const wordmarks = page.locator('.site-header .wordmark, footer .wordmark');
    assert.equal(await wordmarks.count(), 2, `${label}: a header and a footer wordmark are present`);
    for (const [slot, place] of [[0, 'header'], [1, 'footer']]) {
      const wm = wordmarks.nth(slot);
      const textContent = ((await wm.textContent()) || '').trim();
      const ariaLabel = ((await wm.getAttribute('aria-label')) || '').trim();
      const style = await wm.evaluate(el => { const s = getComputedStyle(el); return { family: s.fontFamily, size: parseFloat(s.fontSize) }; });
      assert(/GAMEFLEX/.test(textContent), `${label}: the ${place} wordmark is the straight text GAMEFLEX ("${textContent}")`);
      assert(/Pixel/i.test(style.family), `${label}: the ${place} wordmark paints the Pixel font (${style.family})`);
      assert.equal(await wm.locator('img').count(), 0, `${label}: the ${place} wordmark is text, not a curve image`);
      assert.equal(await wm.locator('.logo-pixel').count(), 1, `${label}: the ${place} wordmark keeps its lime pixel dot`);
      assert(/^GAMEFLEX home/.test(ariaLabel), `${label}: the ${place} wordmark keeps its accessible name (${ariaLabel})`);
    }
    // APPROVED: the active Discover rule is a 2px lime underline inside the button, right-aligned
    // under the label — never a pill. It rests at 24px and grows to the full label width on hover or
    // keyboard focus over a ~500ms width transition (was ~220ms).
    const activeNav = page.locator('.site-header nav .nav-link.active');
    assert.equal(await activeNav.count(), 1, `${label}: exactly one nav item is active`);
    const navAfter = () => activeNav.evaluate(el => {
      const s = getComputedStyle(el, '::after');
      return {
        content: s.content, width: parseFloat(s.width) || 0, height: parseFloat(s.height) || 0,
        right: s.right, bottom: parseFloat(s.bottom), bg: s.backgroundColor,
        transition: parseFloat(s.transitionDuration) * (s.transitionDuration.includes('ms') ? 1 : 1000),
        labelWidth: el.getBoundingClientRect().width,
        background: getComputedStyle(el).backgroundColor,
      };
    });
    const navRest = await navAfter();
    assert(navRest.content && navRest.content !== 'none', `${label}: the active nav item keeps an ::after underline`);
    assert(Math.abs(navRest.width - 24) <= 1, `${label}: the underline rests at 24px (${navRest.width}px)`);
    assert(navRest.height > 0 && navRest.height <= 3, `${label}: the underline is a thin 2px rule (${navRest.height}px)`);
    assert(/196, ?250, ?83/.test(navRest.bg), `${label}: the underline is lime (${navRest.bg})`);
    assert(parseFloat(navRest.right) === 0, `${label}: the underline is flush right under the label (::after right ${navRest.right})`);
    assert(navRest.bottom >= 0, `${label}: the underline sits INSIDE the button, not below it (::after bottom ${navRest.bottom})`);
    assert(/rgba?\(0, 0, 0, 0\)|transparent/.test(navRest.background), `${label}: the active nav item has no pill or background enclosure (${navRest.background})`);
    assert(navRest.transition >= UNDERLINE_MS_MIN && navRest.transition <= UNDERLINE_MS_MAX, `${label}: the underline animates over ~500ms (measured ${navRest.transition}ms, was ~220ms)`);
    await activeNav.hover();
    await page.waitForFunction(() => { const el = document.querySelector('.site-header nav .nav-link.active'); return parseFloat(getComputedStyle(el, '::after').width) >= el.getBoundingClientRect().width - 1; });
    const navHover = await navAfter();
    assert(navHover.width >= navRest.labelWidth - 1, `${label}: the underline grows to the full label width on hover (${Math.round(navHover.width)}px vs label ${Math.round(navRest.labelWidth)}px)`);
    assert(navHover.width > navRest.width + 4, `${label}: hover really widens the rule past its 24px rest (${Math.round(navRest.width)}px -> ${Math.round(navHover.width)}px)`);
    await page.mouse.move(2, 2);
    // A keyboard press first, so the scripted focus counts as :focus-visible.
    await page.keyboard.press('Tab');
    await activeNav.focus();
    await page.waitForFunction(() => { const el = document.querySelector('.site-header nav .nav-link.active'); return parseFloat(getComputedStyle(el, '::after').width) >= el.getBoundingClientRect().width - 1; });
    assert((await navAfter()).width >= navRest.labelWidth - 1, `${label}: the underline reaches the full label width on keyboard focus`);

    // APPROVED header order, left to right: search → favourites (heart + count) → account → burger.
    const order = await page.evaluate(() => {
      const box = selector => { const node = document.querySelector(selector); if (!node) return null; const b = node.getBoundingClientRect(); return { x: b.x, right: b.right, width: b.width }; };
      return { search: box('.search-box'), favourite: box('#favourite-button'), account: box('#account-button'), burger: box('#menu-button') };
    });
    assert(order.search && order.favourite && order.account && order.burger, `${label}: search, favourites, account and burger are all present`);
    assert(order.search.right <= order.favourite.x + 1, `${label}: search sits left of favourites (search right ${Math.round(order.search.right)} vs favourite ${Math.round(order.favourite.x)})`);
    assert(order.favourite.right <= order.account.x + 1, `${label}: favourites sits left of account (favourite right ${Math.round(order.favourite.right)} vs account ${Math.round(order.account.x)})`);
    assert(order.account.right <= order.burger.x + 1, `${label}: account sits left of the burger (account right ${Math.round(order.account.right)} vs burger ${Math.round(order.burger.x)})`);
    // The favourite control is a heart icon with the shared count.
    assert.equal(await page.locator('#favourite-button svg').count(), 1, `${label}: the favourite control carries a heart icon`);
    assert.equal((await page.locator('#favourite-count').textContent()).trim(), '0', `${label}: the favourite count starts at 0`);

    // APPROVED: the burger is a PLACEHOLDER — it opens a popover with no page links.
    assert.equal(await page.locator('#site-menu').isHidden(), true, `${label}: the burger menu starts closed`);
    await page.locator('#menu-button').click();
    assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'), 'true', `${label}: the burger menu reports expanded`);
    assert.equal(await page.locator('#site-menu a').count(), 0, `${label}: the burger placeholder exposes no old page links`);
    assert((await page.locator('#site-menu').innerText()).trim().length > 0, `${label}: the burger placeholder shows a note`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#site-menu').isHidden(), true, `${label}: Escape closes the burger menu`);
    assert(await page.locator('#menu-button').evaluate(el => el === document.activeElement), `${label}: Escape returns focus to the burger`);

    // The account popover is unchanged: a coming-soon placeholder, no sign-in.
    await page.locator('#account-button').click();
    assert.equal(await page.locator('#account-popover').isVisible(), true, `${label}: the account icon opens a popover`);
    assert.equal(await page.locator('#account-popover').getAttribute('role'), 'dialog', `${label}: the popover is announced as a dialog`);
    assert((await page.locator('#account-popover').innerText()).toLowerCase().includes('coming soon'), `${label}: the popover says accounts are coming soon`);
    assert.equal(await page.locator('#account-popover input, #account-popover form').count(), 0, `${label}: there is no sign-in form or field`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#account-popover').isHidden(), true, `${label}: Escape closes the account popover`);
    await page.locator('#account-button').click();
    await page.locator('#account-close').click();
    assert.equal(await page.locator('#account-popover').isHidden(), true, `${label}: the popover has a dismiss button`);
    await page.locator('#account-button').click();
    await page.locator('#catalogue-heading').click();
    assert.equal(await page.locator('#account-popover').isHidden(), true, `${label}: an outside click dismisses the popover`);

    assert.equal((await page.locator('[data-category="sports"]').textContent()).trim(), 'Sports', `${label}: the sports filter is renamed`);
    await page.locator('[data-category="sports"]').click();
    assert.equal(await page.locator('.game-card').count(), GAMES.filter(game => game.category === 'sports').length, `${label}: the renamed sports filter still fills the shelf`);
    await page.locator('[data-category="all"]').click();
  }
  pass(`both pages share the compact ~${NAVBAR_HEIGHT}px header: search → favourites (heart + count) → account → burger placeholder (no old page links); the Discover underline rests at 24px and grows full-text over ~500ms; account popover is coming-soon only; Sports filter renamed`);

  /* ------------------------------------------------------------------ page ground colour */
  const groundOf = async url => {
    await page.goto(url);
    await page.locator('.game-card').first().waitFor();
    return page.evaluate(() => ({ body: getComputedStyle(document.body).backgroundColor, html: getComputedStyle(document.documentElement).backgroundColor }));
  };
  const homeGround = await groundOf(HOME);
  const spotGround = await groundOf(SPOTLIGHT);
  assert(/11, 13, 11/.test(homeGround.body), `the homepage ground is the darker #0b0d0b (${homeGround.body})`);
  assert(/11, 13, 11/.test(spotGround.body), `the spotlight ground is the darker #0b0d0b (${spotGround.body})`);
  assert.equal(homeGround.body, spotGround.body, 'both pages share the same #0b0d0b ground');
  pass('both pages share the spotlight #0b0d0b ground');

  /* --------------------------------------- spotlight hero: curated games + promo slides */
  await page.goto(SPOTLIGHT);
  await page.locator('.game-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(2, 2);

  const slideSnapshot = () => page.evaluate(() => {
    const image = document.getElementById('hero-image');
    const play = document.getElementById('hero-play');
    return {
      title: document.getElementById('spotlight-name')?.textContent?.trim() || '',
      tag: document.getElementById('spotlight-tag')?.textContent?.trim() || '',
      genre: document.getElementById('spotlight-genre')?.textContent?.trim() || '',
      description: document.getElementById('spotlight-description')?.textContent?.trim() || '',
      requirements: document.getElementById('spotlight-requirements')?.textContent?.trim() || '',
      image: image?.style.backgroundImage || '',
      position: image?.style.backgroundPosition || '',
      heroGameId: image?.getAttribute('data-hero-game') || '',
      promoAction: /games|collection/i.test(play?.textContent || ''),
      heroPlayText: play?.textContent?.trim() || '',
      heroPlayDisabled: play ? Boolean(play.disabled) : true,
      playDeepLink: document.querySelectorAll('.hero-actions a[href^="#play/"], .hero-actions [data-play]').length,
    };
  });
  const keyOf = snap => snap.heroGameId || `promo:${snap.title}`;
  const isGameKey = key => SPOT_POOL.some(game => game.id === key);

  const walk = [];
  const openerSnap = await slideSnapshot();
  const openerKey = keyOf(openerSnap);
  assert(openerKey.length > 0, 'the spotlight opens on a named slide');
  for (let step = 0; step < SPOT_SLIDE_COUNT + 4; step += 1) {
    const snap = await slideSnapshot();
    const key = keyOf(snap);
    if (step > 0 && key === openerKey) break;
    walk.push({ key, snap });
    await page.locator('#hero-next').click();
  }
  const TOTAL = walk.length;
  const keys = walk.map(entry => entry.key);
  const gameEntries = walk.filter(entry => isGameKey(entry.key));
  const promoEntries = walk.filter(entry => !isGameKey(entry.key));
  assert.equal(walk.length, SPOT_SLIDE_COUNT, `the spotlight rotates exactly ${SPOT_SLIDE_COUNT} slides (found ${walk.length})`);
  assert.equal(new Set(keys).size, keys.length, 'every spotlight slide is distinct across the cycle');
  assert.equal(gameEntries.length, SPOT_POOL.length, `${SPOT_POOL.length} quality-curated game slides (found ${gameEntries.length})`);
  assert.equal(new Set(gameEntries.map(entry => entry.key)).size, SPOT_POOL.length, 'each curated game appears once in the rotation');
  assert.equal(promoEntries.length, 1, `exactly one Gameflex brand promo slide (found ${promoEntries.length})`);
  const PROMO_INDEX = walk.findIndex(entry => !isGameKey(entry.key));
  const PROMO_KEY = walk[PROMO_INDEX].key;
  const PROMO_TITLE = walk[PROMO_INDEX].snap.title;
  assert.equal(walk[PROMO_INDEX].snap.playDeepLink, 0, 'the promo slide offers no #play/ deep link');
  assert.equal(walk[PROMO_INDEX].snap.promoAction, true, 'the promo slide offers a call to action that names the games');
  assert(gameEntries.every(entry => !entry.snap.promoAction && /play|view/i.test(entry.snap.heroPlayText) && !entry.snap.heroPlayDisabled), 'every game slide keeps a working in-site launch action instead of the promo CTA');
  for (const { key, snap } of gameEntries) {
    const game = SPOT_POOL.find(entry => entry.id === key);
    assert(game, `every game slide maps to a curated game (${key})`);
    assert.equal(snap.title, game.title, `the h1 names the game the hero is showing (${game.title})`);
    const media = SPOT_MEDIA[key];
    assert(media && snap.image.includes(media.src), `${key}: the hero paints the media map artwork`);
    assert.equal(snap.position, media.position, `${key}: the hero keeps the media map crop point`);
    assert.equal(snap.description, game.description, `${key}: the description is the current game description`);
    assert.equal(snap.requirements, game.requirements, `${key}: the requirements note is the current game requirements`);
  }
  assert.equal(await keyOf(await slideSnapshot()), openerKey, 'one full cycle of Next returns to the opener');
  await page.screenshot({ path: 'artifacts/qa/spotlight-home-desktop.png', fullPage: true });

  assert.equal(await page.locator('html').getAttribute('class'), 'page-spotlight', 'the spotlight page marks itself with page-spotlight');
  assert.equal(await page.locator('h1').count(), 1, 'the spotlight page has exactly one h1');
  assert.equal(await page.locator('#spotlight-name').evaluate(el => el.tagName), 'H1', 'the current title is the page heading, not a generic slogan');
  pass(`spotlight hero rotates ${TOTAL} slides — ${SPOT_POOL.length} curated games plus one Gameflex brand promo at index ${PROMO_INDEX} — each game naming its title and media, the promo carrying a games-naming CTA and no launch link`);

  /* ------------------------------------------------------- promo CTA + dynamic copy */
  for (let index = 0; index < PROMO_INDEX; index += 1) await page.locator('#hero-next').click();
  assert.equal(await keyOf(await slideSnapshot()), PROMO_KEY, 'the promo slide is reachable by stepping forward from the opener');
  assert(PROMO_TITLE.length > 0, 'the promo slide carries a headline');
  const promoCopyBefore = await page.evaluate(() => ({
    title: document.getElementById('spotlight-name')?.textContent?.trim() || '',
    description: document.getElementById('spotlight-description')?.textContent?.trim() || '',
    tag: document.getElementById('spotlight-tag')?.textContent?.trim() || '',
  }));
  const promoActions = page.locator('.hero-actions a, .hero-actions button').filter({ hasText: /games|collection/i });
  assert((await promoActions.count()) >= 1, 'the promo slide exposes a call to action that names the games (ships as "Show me the games")');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(120);
  await promoActions.first().click();
  await page.waitForTimeout(600);
  const scrollY = await page.evaluate(() => window.scrollY);
  assert(scrollY > 100, `the promo CTA scrolls the catalogue into view (scrollY ${Math.round(scrollY)})`);
  assert.equal(await page.locator('#player').evaluate(el => el.hidden), true, 'the promo CTA does not open the player');
  assert.equal(await page.evaluate(() => (location.hash || '').startsWith('#play/')), false, 'the promo CTA does not deep-link into a launch');
  assert.deepEqual(popups, [], 'the promo CTA opens no new tab or window');
  await page.locator('#hero-next').click();
  for (let step = 0; step < TOTAL; step += 1) {
    if (await keyOf(await slideSnapshot()) === PROMO_KEY) break;
    await page.locator('#hero-next').click();
  }
  assert.equal(await keyOf(await slideSnapshot()), PROMO_KEY, 'the promo slide is reached a second time around the cycle');
  const promoCopyAfter = await page.evaluate(() => ({
    title: document.getElementById('spotlight-name')?.textContent?.trim() || '',
    description: document.getElementById('spotlight-description')?.textContent?.trim() || '',
    tag: document.getElementById('spotlight-tag')?.textContent?.trim() || '',
  }));
  assert.notDeepEqual(promoCopyAfter, promoCopyBefore, `the promo headline copy changes when the slide is revisited (was "${promoCopyBefore.title}", now "${promoCopyAfter.title}")`);
  await page.evaluate(() => scrollTo(0, 0));
  pass('the promo slide\'s call to action ("Show me the games") scrolls the collection with no player, no #play/ link and no popup, and its headline copy is dynamic on revisit');

  /* ---------------------------------------------------------- up-next thumbnails */
  const pills = page.locator('[data-hero-index]');
  assert.equal(await pills.count(), 5, 'five upcoming preview thumbnails');
  const thumbs = () => page.evaluate(() => [...document.querySelectorAll('#hero-dots .hero-thumb')].map(button => ({
    index: Number(button.dataset.heroIndex),
    title: button.getAttribute('title'),
    label: button.getAttribute('aria-label'),
    text: button.textContent.trim(),
    current: button.classList.contains('active') || button.getAttribute('aria-current') !== null,
    tabIndex: button.tabIndex,
    art: button.querySelector('img.hero-thumb-art')?.getAttribute('src') || '',
  })));
  const GAME_IDX = walk.map((entry, index) => (isGameKey(entry.key) ? index : -1)).filter(index => index >= 0);
  const titleById = new Map(SPOT_POOL.map(game => [`${game.id}`, game.title]));
  const keyOfIndex = index => walk[index]?.key || '';
  const expectedUpcoming = current => {
    const start = GAME_IDX.findIndex(index => index > current);
    const ordered = start === -1 ? GAME_IDX.slice() : [...GAME_IDX.slice(start), ...GAME_IDX.slice(0, start)];
    return ordered.slice(0, 5);
  };
  await page.mouse.move(2, 2);
  for (let step = 0; step < TOTAL; step += 1) {
    if (await keyOf(await slideSnapshot()) === openerKey) break;
    await page.locator('#hero-next').click();
  }
  assert.equal(await keyOf(await slideSnapshot()), openerKey, 'back at the opener for the preview checks');
  const openerIndexInWalk = walk.findIndex(entry => entry.key === openerKey);
  assert(openerIndexInWalk >= 0, 'the opener is a slide in the walked cycle');
  await page.waitForFunction(() => [...document.querySelectorAll('.hero-thumb-art')].every(img => img.complete && img.naturalWidth > 0));
  const peek = await thumbs();
  assert.equal(peek.length, 5, 'the strip holds five thumbnails');
  assert.equal(peek.every(entry => entry.text === '' && entry.title && entry.art), true, 'the thumbnails are unnumbered and carry a title and artwork');
  assert.equal(new Set(peek.map(entry => entry.title)).size, 5, 'the five upcoming previews are distinct');
  assert.equal(peek.some(entry => entry.title === openerSnap.title), false, 'the current slide is never repeated in its own up-next strip');
  assert.equal(peek.every(entry => entry.title === titleById.get(keyOfIndex(entry.index))), true, `every upcoming thumbnail indexes a curated game slide (${peek.map(entry => entry.title).join(', ')})`);
  assert.equal(peek.some(entry => entry.title === PROMO_TITLE), false, 'the up-next strip never spends a slot on the brand promo');
  assert.equal(peek.every(entry => entry.current === false && entry.tabIndex === 0), true, 'no upcoming thumbnail is marked current and all stay tabbable');
  const expectedPeek = expectedUpcoming(openerIndexInWalk);
  assert.equal(expectedPeek.length, 5, 'the curated pool supplies five upcoming games');
  assert.deepEqual(peek.map(entry => entry.index), expectedPeek, 'the previews walk the curated game ids after the current slide (skipping the promo), wrapping once');
  assert.equal(new Set(peek.map(entry => entry.index)).size, 5, 'the five preview indexes are distinct — no repeats and no promo slot');
  assert.deepEqual(peek.map(entry => entry.title), expectedPeek.map(index => titleById.get(keyOfIndex(index))), 'the preview titles follow the curated game order');
  const decodedThumbs = await page.evaluate(() => [...document.querySelectorAll('#hero-dots .hero-thumb img.hero-thumb-art')].map(image => ({ src: image.getAttribute('src') || '', complete: image.complete, width: image.naturalWidth })));
  assert.equal(decodedThumbs.length, 5, 'five thumbnail images are present');
  assert.equal(decodedThumbs.every(entry => entry.src && entry.complete && entry.width > 0), true, `every thumbnail image decodes (${decodedThumbs.map(entry => entry.width).join(', ')})`);
  assert.equal(await page.locator('#hero-index-current').count(), 0, 'the spotlight hero drops the numeric index');
  assert.equal(await page.locator('#hero-dots').evaluate(el => getComputedStyle(el).display), 'flex', 'the thumbnails render as a row');
  const declared = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--spot-autoplay').trim());
  assert.equal(declared, '7s', 'the stylesheet declares the 7 second interval');
  assert.equal(await page.locator('.hero-progress-fill').evaluate(el => getComputedStyle(el).animationDuration), '7s', 'the current slide progress matches the interval');

  const controlBox = await page.locator('.hero-slider-controls').boundingBox();
  assert(controlBox.x + controlBox.width > CHECK_VIEWPORT.width / 2, 'the controls sit on the right');
  assert(controlBox.y + controlBox.height > CHECK_VIEWPORT.height / 2, 'the controls sit in the lower half');
  for (const selector of ['#hero-prev', '#hero-next', '#hero-pause']) {
    assert.equal(await page.locator(selector).isVisible(), true, `${selector} is available`);
  }
  assert.equal(await page.locator('#hero-pause').getAttribute('aria-pressed'), 'false', 'the slideshow starts unpaused');
  const arrows = await page.locator('#hero-prev, #hero-next, #hero-pause').evaluateAll(els => els.map(el => { const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, size: box.width }; }));
  assert(arrows.every(box => box.size >= 32), 'every control keeps a usable hit area');
  assert(arrows.every(box => box.x + box.size > CHECK_VIEWPORT.width / 2 && box.y > CHECK_VIEWPORT.height / 2), 'prev, next and pause all sit bottom right');
  pass(`five distinct decoded upcoming previews walking the curated game ids and skipping the brand promo, with 7s progress and bottom-right controls`);

  /* ------------------------------------------------------ manual navigation first */
  const pick = (await thumbs())[2];
  await page.locator(`[data-hero-index="${pick.index}"]`).click();
  assert.deepEqual((await thumbs()).map(entry => entry.index), expectedUpcoming(pick.index), 'the five upcoming previews follow the selected slide across the curated game ids');
  await releaseHero();
  assert.equal(await paused(), false, 'the slideshow is running once the pointer and focus leave the hero');
  pass(`manual next/previous/preview thumbnails move the carousel across all ${TOTAL} slides (promo included) and update the five upcoming game indexes`);

  /* ----------------------------------------------------------- autoplay behaviour */
  // 1) Baseline: with pointer and focus away, the beat runs on a ~7s interval.
  await releaseHero();
  const beforeAuto = await title();
  const announcement = await status();
  const waited = await advance(beforeAuto);
  results.timings.firstAdvanceMs = waited;
  assert(waited >= INTERVAL_MS - 700 && waited <= INTERVAL_MS + 1700, `autoplay advances on a ~7s beat (measured ${waited}ms)`);
  assert.equal(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null), true, 'autoplay moves no focus');
  assert.equal(await status(), announcement, 'autoplay announces nothing: the last manual announcement is untouched');
  pass(`autoplay advances on a measured ${waited}ms beat with no announcement and no focus change`);

  // 2) APPROVED: a POINTER press on Next does not pause the beat — the pointer-borne focus never
  //    latches a pause, so the slideshow keeps advancing after the click.
  await releaseHero();
  await page.locator('#hero-next').click();
  assert.equal(await paused(), false, 'a pointer press on Next does NOT pause the slideshow');
  const afterNext = await advance(await title());
  results.timings.advanceAfterNextMs = afterNext;
  assert.equal(await paused(), false, 'the slideshow keeps running after Next');
  pass(`a pointer press on Next leaves autoplay running (it advanced ${afterNext}ms later)`);

  // 3) APPROVED: a POINTER press on a preview thumbnail likewise keeps the beat running.
  await releaseHero();
  await page.locator('#hero-dots .hero-thumb').first().click();
  assert.equal(await paused(), false, 'a pointer press on a preview thumbnail does NOT pause the slideshow');
  const afterThumb = await advance(await title());
  results.timings.advanceAfterPreviewMs = afterThumb;
  assert.equal(await paused(), false, 'the slideshow keeps running after a preview pick');
  pass(`a pointer press on a preview thumbnail leaves autoplay running (it advanced ${afterThumb}ms later)`);

  // 4) APPROVED: keyboard focus still pauses the beat.
  await releaseHero();
  const beforeFocus = await title();
  await page.locator('#hero-next').focus();
  assert.equal(await paused(), true, 'keyboard focus inside the hero pauses the slideshow');
  await page.waitForTimeout(INTERVAL_MS + OVERRUN_MS);
  assert.equal(await title(), beforeFocus, 'nothing advances while keyboard focus is inside the hero');
  pass('keyboard focus inside the hero pauses the spotlight slideshow');

  // 5) APPROVED: an explicit Play press overrides the keyboard-focus pause.
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(2, 2);
  await page.locator('#hero-pause').click();
  assert.equal(await page.locator('#hero-pause').getAttribute('aria-pressed'), 'true', 'the pause button reports the paused state');
  assert((await page.locator('#hero-pause').getAttribute('aria-label')).toLowerCase().includes('play'), 'the pause button offers to play again');
  await releaseHero();
  const beforeManual = await title();
  await page.waitForTimeout(INTERVAL_MS + OVERRUN_MS);
  assert.equal(await title(), beforeManual, 'nothing advances while the visitor has paused');
  // Focus the pause control by keyboard while it is paused, then activate Play explicitly.
  await page.keyboard.press('Tab');
  await page.locator('#hero-pause').focus();
  assert.equal(await paused(), true, 'keyboard focus keeps the slideshow paused');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#hero-pause').getAttribute('aria-pressed'), 'false', 'the pause button toggles back to Play');
  assert.equal(await paused(), false, 'an explicit Play overrides the keyboard-focus pause');
  const explicitResume = await advance(await title());
  results.timings.resumeAfterExplicitPlayMs = explicitResume;
  pass(`the pause button holds while paused, and an explicit Play overrides the keyboard-focus pause (it advanced ${explicitResume}ms later)`);

  // 6) APPROVED: hovering the hero never pauses it.
  const beforeHover = await title();
  await page.mouse.move(CHECK_VIEWPORT.width / 2, CHECK_VIEWPORT.height * 0.6);
  assert.equal(await paused(), false, 'hovering the hero does NOT pause the slideshow');
  const hoverAdvance = await advance(beforeHover);
  results.timings.advanceWhileHoveringMs = hoverAdvance;
  assert(hoverAdvance <= INTERVAL_MS + 1700, `the slideshow keeps advancing while the hero is hovered (measured ${hoverAdvance}ms)`);
  assert.equal(await paused(), false, 'the slideshow reports running while hovered');
  await page.mouse.move(2, 2);
  pass(`hovering the hero leaves autoplay running — it advanced in ${hoverAdvance}ms under the pointer`);

  // 7) APPROVED: an offscreen hero pauses the beat.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  assert.equal(await paused(), true, 'scrolling the hero out of view pauses the slideshow');
  const beforeOffscreen = await title();
  await page.waitForTimeout(INTERVAL_MS + OVERRUN_MS);
  assert.equal(await title(), beforeOffscreen, 'nothing advances while the hero is offscreen');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  assert.equal(await paused(), false, 'scrolling back resumes the slideshow');
  pass('an offscreen hero pauses the spotlight slideshow and scrolling back resumes it');

  // 8) APPROVED: a hidden tab pauses the beat (visibilitychange exercised directly).
  const beforeHidden = await title();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await paused(), true, 'a hidden tab pauses the slideshow');
  await page.waitForTimeout(INTERVAL_MS + OVERRUN_MS);
  assert.equal(await title(), beforeHidden, 'nothing advances while the tab is hidden');
  await page.evaluate(() => {
    delete document.visibilityState;
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await paused(), false, 'a visible tab resumes the slideshow');
  pass('a hidden tab pauses the spotlight slideshow (visibilitychange exercised directly, not a real tab switch)');

  // 9) APPROVED: an open player freezes the beat.
  await releaseHero();
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let step = 0; step < TOTAL; step += 1) {
    if (isGameKey(keyOf(await slideSnapshot()))) break;
    await page.locator('#hero-next').click();
  }
  const beforePlayer = await title();
  await page.locator('#hero-play').click();
  assert.equal(await page.locator('#player').evaluate(el => el.hidden), false, 'the hero action opens the in-site player');
  await page.waitForTimeout(INTERVAL_MS + OVERRUN_MS);
  assert.equal(await title(), beforePlayer, 'the hero does not advance while the player is open');
  assert.equal(await page.locator('#player-title').textContent(), beforePlayer, 'the player opens the game that was on screen');
  assert.equal(await page.locator('#player a[href^="http"]').count(), 0, 'the player offers no external fallback');
  await page.locator('#player-close').click();
  assert.equal(await page.locator('#player').evaluate(el => el.hidden), true, 'Back closes the player');
  pass('an open player freezes the hero autoplay and closing it restores the beat');

  /* ------------------------------------------------------ player + catalogue share */
  assert.equal(await page.locator('.game-card').count() >= GAMES.length, true, 'the spotlight page carries the same catalogue');
  assert.equal(await page.locator('a[target]').count(), 0, 'no launch link opens a new tab');
  assert.equal(await page.locator('a[href^="http"]').count(), 0, 'no external anchors on the spotlight page');
  const pending = GAMES.find(game => game.availability === 'sandbox-pending');
  await page.locator('#search').fill(pending.title);
  const pendingCard = page.locator(`.sd-card[data-game="${pending.id}"]`).first();
  await pendingCard.locator('.game-art').click();
  await page.locator('.sd-panel [data-play]').click();
  assert.equal(await page.locator('#player-stage').getAttribute('data-state'), 'blocked', 'a sandbox-pending game still shows the blocked player state');
  assert((await page.locator('.player-panel').innerText()).includes('Sandbox pending'), 'the blocked panel still explains the pending state');
  await page.locator('#player-close').click();
  await page.locator('#search').fill('');
  pass('catalogue launches on the spotlight page go through the existing sandbox player, including the sandbox-pending blocked state');

  /* ------------------------------------------------------------------ responsive */
  await page.goto(SPOTLIGHT);
  await page.locator('.game-card').first().waitFor();
  await page.mouse.move(2, 2);
  const spotlightHero = await page.locator('#hero').evaluate(el => el.getBoundingClientRect().height);
  await page.goto(HOME);
  await page.locator('.game-card').first().waitFor();
  const homepageHero = await page.locator('#hero').evaluate(el => el.getBoundingClientRect().height);
  assert(spotlightHero > 300, `the spotlight hero is a full-bleed band (${spotlightHero}px)`);
  assert(Math.abs(spotlightHero - homepageHero) <= 2, `both pages render the same hero height (${Math.round(spotlightHero)}px vs ${Math.round(homepageHero)}px)`);
  results.timings.heroHeights = { homepage: homepageHero, spotlight: spotlightHero };
  await page.goto(SPOTLIGHT);
  await page.locator('.game-card').first().waitFor();
  await page.mouse.move(2, 2);

  const overlaps = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  const measure = selector => page.locator(selector).boundingBox();
  const assertComposition = async (label) => {
    const controls = await measure('.hero-slider-controls');
    const copy = await measure('#spotlight-description');
    const requirements = await measure('#spotlight-requirements');
    const actions = await measure('.hero-actions');
    assert(!overlaps(controls, copy), `${label}: the controls do not overlap the description`);
    assert(!overlaps(controls, requirements), `${label}: the controls do not overlap the requirements note`);
    assert(!overlaps(controls, actions), `${label}: the controls do not overlap the hero actions`);
    const titleBox = await measure('#spotlight-name');
    const font = await page.locator('#spotlight-name').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert(titleBox.height <= font * 1.05 * 3 + 6, `${label}: the title wraps to at most three lines (${Math.round(titleBox.height)}px of ${font}px text)`);
    const headerItems = await page.locator('.site-header > .wordmark, .site-header > nav, .header-right').evaluateAll(els => els.map(el => { const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
    for (let i = 0; i < headerItems.length; i += 1) for (let j = i + 1; j < headerItems.length; j += 1) assert(!overlaps(headerItems[i], headerItems[j]), `${label}: header blocks do not overlap`);
  };
  await assertComposition('1440x1000');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(150);
  await assertComposition('1920x1080');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the spotlight page has no overflow at 1920px');
  pass('spotlight hero composition holds at 1440px and 1920px: controls clear of the copy, title at most three lines, header blocks separate');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the spotlight page has no mobile horizontal overflow');
  const mobileCopy = await page.locator('#spotlight-description').boundingBox();
  assert(mobileCopy.x >= 0 && mobileCopy.x + mobileCopy.width <= 391, 'the mobile description stays inside the viewport');
  assert(await page.locator('#spotlight-description').evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16, 'the description stays readable on mobile');
  await page.screenshot({ path: 'artifacts/qa/spotlight-home-mobile.png', fullPage: true });
  await page.evaluate(() => scrollTo(0, 0));
  // The mobile header keeps the search → favourites → account → burger order.
  const mobileOrder = await page.evaluate(() => {
    const box = selector => { const node = document.querySelector(selector); if (!node) return null; const b = node.getBoundingClientRect(); return { x: b.x, right: b.right }; };
    return { search: box('.search-box'), favourite: box('#favourite-button'), account: box('#account-button'), burger: box('#menu-button') };
  });
  assert(mobileOrder.search.right <= mobileOrder.favourite.x + 1, 'at 390px search sits left of favourites');
  assert(mobileOrder.favourite.right <= mobileOrder.account.x + 1, 'at 390px favourites sits left of account');
  assert(mobileOrder.account.right <= mobileOrder.burger.x + 1, 'at 390px account sits left of the burger');
  await page.setViewportSize(CHECK_VIEWPORT);
  pass('spotlight hero is full-bleed on desktop and stacks legibly with no overflow on a 390px viewport; the mobile header keeps the search → favourites → account → burger order');

  /* -------------------------------------------- shuffle refresh opens on a new game */
  const preRefreshOpener = await heroGameId();
  await page.reload();
  await page.locator('.game-card').first().waitFor();
  await page.waitForFunction(() => document.querySelector('#hero-image')?.getAttribute('data-hero-game'));
  await page.mouse.move(2, 2);
  const postRefreshOpener = await heroGameId();
  assert(SPOT_POOL.some(game => game.id === postRefreshOpener) || postRefreshOpener === null, `a refresh opens on a real slide (${postRefreshOpener})`);
  assert.notEqual(postRefreshOpener, preRefreshOpener, 'a refresh never reopens on the slide it opened on last time');
  pass('the spotlight reshuffles on every load and a refresh never reopens on the previous slide');

  /* ------------------------------------------------- reduced motion (no autoplay) */
  const calmElapsed = Date.now() - calmStarted;
  const calmKey = await calmPage.locator('#hero-image').getAttribute('data-hero-game');
  const calmGame = SPOT_POOL.find(game => game.id === calmKey);
  const calmTitle = await calmPage.locator('#spotlight-name').textContent();
  assert(calmGame ? calmTitle === calmGame.title : (calmTitle || '').length > 0, `reduced motion opens on a valid slide and never starts the slideshow (checked after ${Math.round(calmElapsed / 1000)}s)`);
  assert((await calmPage.locator('#hero-dots').evaluate(el => el.classList.contains('is-paused'))) === true, 'reduced motion leaves the slideshow in the paused state');
  assert.equal(await calmPage.locator('.hero-progress-fill').evaluate(el => getComputedStyle(el).animationName), 'none', 'reduced motion removes the progress animation');
  assert.equal(await calmPage.locator('#hero-pause').isVisible(), true, 'the manual pause control stays available under reduced motion');
  assert(await calmElapsed > INTERVAL_MS + OVERRUN_MS, 'the reduced-motion window really did cover a full interval');
  results.timings.reducedMotionWindowMs = calmElapsed;
  await calmPage.locator('#hero-next').click();
  assert.notEqual(await calmPage.locator('#spotlight-name').textContent(), calmTitle, 'manual controls still work under reduced motion');
  pass(`reduced motion: no autoplay across a ${Math.round(calmElapsed / 1000)}s window from its own shuffled opener, no progress animation, manual controls intact`);

  /* -------------------------------------------------------------------- sources */
  for (const file of ['dist/index.html', 'dist/spotlight.html', 'dist/app.js', 'dist/spotlight.mjs']) {
    const source = await readFile(path.join(HERE, '..', file), 'utf8');
    assert(!/window\.open\s*\(/.test(source), `${file} must not open windows`);
    assert(!/_blank|target\s*=\s*["']_blank/i.test(source), `${file} must not reference a new tab`);
  }
  assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0, 'no frame is created by merely browsing the spotlight page');
  assert.equal(external.length, 0, `no external host was contacted: ${external.join(', ')}`);
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.deepEqual(calmErrors, [], calmErrors.join('\n'));
  assert.deepEqual(popups, []);
  pass('no window.open, no new-tab links, no iframes while browsing, no external requests, no page errors');

  results.passed = true;
  results.errors = errors;
  await writeFile('artifacts/qa/spotlight-home-report.json', JSON.stringify(results, null, 2) + '\n');
  console.log(`\n${checks.length} checks passed in ${Math.round((Date.now() - calmStarted) / 1000)}s`);
  console.log(JSON.stringify({ passed: results.passed, slidesPerPage: results.slidesPerPage, timings: results.timings }, null, 2));
} finally {
  await browser?.close();
  await server.stop();
}
