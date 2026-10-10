/**
 * gameflex hero comparison QA — homepage baseline vs the spotlight preview page.
 *
 * Runs the bundled Edge build through the same Playwright rig the other suites use
 * (channel: msedge, no browser download). Playwright is resolved from
 * GAMEFLEX_PLAYWRIGHT, then from a normal node_modules lookup, then from this repo's
 * node_modules whether the script runs in the project root or in a git worktree.
 *
 * What it checks
 *   - the homepage hero is still the baseline: generic headline, numbered selectors,
 *     numeric index, 570px band, no pause control, never autoplays;
 *   - spotlight.html: the current game title is the page h1, the description reads on the
 *     left, three upcoming game thumbnails, arrows + pause in the bottom-right corner;
 *   - autoplay: advances every 7s with no announcement and no focus movement, and stands
 *     down on hover, on focus, on a hidden tab, on manual pause and under reduced motion;
 *   - the header menu sits immediately right of search on both pages and links the two
 *     pages; the account icon opens a coming-soon popover with no sign-in;
 *   - the Sports filter rename and the shared sandbox player on both pages.
 *
 * The 7-second interval is the feature under test, so the pause checks wait one real
 * interval plus a margin: if a pause failed, the title would have changed by then.
 * Fixtures: every non-loopback request is answered locally, and the suite asserts none
 * were made, so no real game host is contacted and no gameplay is claimed.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');
const GAMES = JSON.parse(await readFile(path.join(DIST, 'games.json'), 'utf8'));
// The homepage hero keeps every spotlight/featured game. The spotlight page narrows that set to
// the artwork worker's quality-curated pool (dist/app.js curatedHeroPool): a featured game stays
// only when spotlight-media.json holds an entry whose src is a usable local assets/ path, and the
// pool falls back to the full featured list when fewer than six survive. This suite derives the
// same pool rather than assuming catalogue order, and reads the shuffled order the UI rendered.
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
const SPOT_TITLES = SPOT_POOL.map(game => game.title);
const INTERVAL_MS = 7000;
const OVERRUN_MS = 700;
const CHECK_VIEWPORT = { width: 1440, height: 1000 };
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
await mkdir('artifacts/qa', { recursive: true });

const external = [];
const blockExternal = page => page.route(url => ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname), route => {
  external.push(route.request().url());
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GAMEFLEX QA FIXTURE</title></head><body data-gameflex-fixture="1"><h1>Deterministic QA fixture — not real gameplay</h1></body></html>' });
});

const checks = [];
const pass = label => { checks.push(label); console.log(`ok — ${label}`); };
let browser = null;
const results = { passed: false, homepageSlides: SLIDES.length, spotlightSlides: SPOT_POOL.length, autoplayIntervalMs: INTERVAL_MS, checks, timings: {}, externalRequests: external, errors: [] };

try {
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  /* ------------------------------------------------ reduced-motion page (parallel) */
  // Loaded first so its 8-second no-advance window elapses while the other checks run.
  const calmContext = await browser.newContext({ viewport: CHECK_VIEWPORT, reducedMotion: 'reduce' });
  const calmPage = await calmContext.newPage();
  const calmErrors = [];
  calmPage.on('pageerror', error => calmErrors.push(error.message));
  await blockExternal(calmPage);
  const calmStarted = Date.now();
  await calmPage.goto(SPOTLIGHT);
  await calmPage.locator('.game-card').first().waitFor();

  /* ------------------------------------------------------------- homepage baseline */
  const page = await browser.newPage({ viewport: CHECK_VIEWPORT });
  const errors = [], popups = [], crossOrigin = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('popup', popup => popups.push(popup.url()));
  await blockExternal(page);

  const title = () => page.locator('#spotlight-name').textContent();
  const status = () => page.locator('#hero-status').textContent();
  const paused = () => page.locator('#hero-dots').evaluate(el => el.classList.contains('is-paused'));
  // The spotlight order is shuffled per load, so "advance" waits for the hero to move to any
  // other real slide rather than to a fixed index, and reports how long that took.
  const TITLES_ALL = SPOT_TITLES;
  const advance = async (fromTitle, timeout = INTERVAL_MS * 2) => {
    const started = Date.now();
    await page.waitForFunction(({ from, titles }) => { const shown = document.getElementById('spotlight-name').textContent; return shown !== from && titles.includes(shown); }, { from: fromTitle, titles: TITLES_ALL }, { timeout });
    return Date.now() - started;
  };
  // Any click leaves the pointer and focus inside the hero, and both of those pause the
  // slideshow. Move the pointer above the hero and drop focus before timing anything.
  const releaseHero = async () => {
    await page.mouse.move(2, 2);
    await page.evaluate(() => document.activeElement?.blur());
  };

  await page.goto(HOME);
  await page.locator('.game-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);

  assert.equal(await page.locator('#spotlight-name').evaluate(el => el.tagName), 'STRONG', 'the homepage keeps its copy-led hero panel, not a title-led h1');
  assert((await page.locator('#hero-heading').textContent()).includes('Old favourites'), 'the homepage headline copy is unchanged');
  assert.equal(await page.locator('#hero-pause').count(), 0, 'the homepage hero has no pause control');
  assert.equal((await page.locator('[data-hero-index]').first().textContent()).trim(), '01', 'homepage selectors stay numbered');
  assert.equal((await page.locator('#hero-index-current').textContent()).trim(), '01');
  assert.equal((await page.locator('#hero-index-total').textContent()).trim(), String(SLIDES.length).padStart(2, '0'));
  const homeHeroHeight = await page.locator('#hero').evaluate(el => el.getBoundingClientRect().height);
  assert(Math.abs(homeHeroHeight - 570) < 2, `the homepage hero keeps its 570px baseline band (measured ${homeHeroHeight})`);
  assert.equal(await page.locator('#spotlight-name').count(), 1);
  const homeTitle = await title();
  await page.waitForTimeout(INTERVAL_MS + OVERRUN_MS);
  assert.equal(await title(), homeTitle, 'the homepage hero never autoplays');
  await page.screenshot({ path: 'artifacts/qa/hero-home-desktop.png', fullPage: true });
  await page.locator('#hero-play').click();
  assert.equal(await page.locator('#player').evaluate(el => el.hidden), false, 'the homepage hero action still opens the in-site player');
  assert.equal(await page.locator('#player-title').textContent(), SLIDES[0].title, 'the homepage hero action opens the spotlight game it was showing');
  await page.locator('#player-close').click();
  pass(`homepage hero baseline intact: generic headline, numbered selectors, ${homeHeroHeight}px band, no pause control, no autoplay, launch still goes through the player`);

  /* ---------------------------------------------------------- shared header chrome */
  for (const [label, url] of [['homepage', HOME], ['spotlight', SPOTLIGHT]]) {
    await page.goto(url);
    await page.locator('.game-card').first().waitFor();
    const search = await page.locator('.search-box').boundingBox();
    const menu = await page.locator('#menu-button').boundingBox();
    assert(menu.x >= search.x + search.width - 2, `${label}: the pages menu sits to the right of search`);
    assert(menu.x - (search.x + search.width) <= 26, `${label}: the pages menu sits immediately right of search (gap ${Math.round(menu.x - (search.x + search.width))}px)`);
    assert.equal(await page.locator('#account-button').count(), 1, `${label}: the account icon is present`);
    assert.equal(await page.locator('#site-menu').isHidden(), true, `${label}: the menu starts closed`);

    await page.locator('#menu-button').click();
    assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'), 'true', `${label}: the menu reports expanded`);
    const links = await page.locator('#site-menu a').evaluateAll(els => els.map(el => ({ href: el.getAttribute('href'), current: el.getAttribute('aria-current'), text: el.textContent })));
    assert.equal(links.length, 2, `${label}: the menu links exactly two pages`);
    assert.deepEqual(links.map(link => link.href), ['index.html', 'spotlight.html'], `${label}: the menu links the original home and the spotlight preview`);
    assert.equal(links.filter(link => link.current === 'page').length, 1, `${label}: the current page is marked`);
    assert(links.find(link => link.current === 'page').href === (label === 'homepage' ? 'index.html' : 'spotlight.html'), `${label}: the marked link is this page`);
    assert(links.every(link => /Original home|Spotlight preview/.test(link.text)), `${label}: the links are labelled`);

    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#site-menu').isHidden(), true, `${label}: Escape closes the menu`);
    assert(await page.locator('#menu-button').evaluate(el => el === document.activeElement), `${label}: Escape returns focus to the menu button`);

    await page.locator('#account-button').click();
    assert.equal(await page.locator('#account-popover').isVisible(), true, `${label}: the account icon opens a popover`);
    assert.equal(await page.locator('#account-popover').getAttribute('role'), 'dialog', `${label}: the popover is announced as a dialog`);
    const accountCopy = (await page.locator('#account-popover').innerText()).toLowerCase();
    assert(accountCopy.includes('coming soon'), `${label}: the popover says accounts are coming soon`);
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
  pass('header menu sits immediately right of search on both pages, links both pages, Escape/outside dismiss; account popover is coming-soon only with no auth fields; Sports filter renamed on both');

  /* --------------------------------------------------- spotlight hero: title-led */
  await page.goto(SPOTLIGHT);
  await page.locator('.game-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(2, 2);

  // The spotlight pool is shuffled on every load, so the suite reads the order the UI actually
  // rendered instead of assuming catalogue order: it snapshots the opener from the live hero
  // (data-hero-game, stamped by dist/app.js paintHero), then walks one full cycle with Next and
  // records each game and the media map's background + crop point on the way round.
  const TOTAL = SPOT_POOL.length;
  const TITLES = SPOT_TITLES;
  const heroGameId = () => page.locator('#hero-image').getAttribute('data-hero-game');
  const gameById = id => SPOT_POOL.find(game => game.id === id) || null;
  const ORDER = [];
  const openerId = await heroGameId();
  assert(SPOT_POOL.some(game => game.id === openerId), `the spotlight opens on one of the ${TOTAL} quality-curated games (${openerId})`);
  for (let step = 0; step < TOTAL; step += 1) {
    const id = await heroGameId();
    const game = gameById(id);
    assert(game, `every spotlight slide maps to a curated game (${id})`);
    assert.equal(await title(), game.title, `the h1 names the game the hero is showing (${game.title})`);
    const media = SPOT_MEDIA[id];
    const { image, position } = await page.locator('#hero-image').evaluate(el => ({ image: el.style.backgroundImage, position: el.style.backgroundPosition }));
    assert(image.includes(media.src), `${id}: the hero paints the media map artwork (${image})`);
    assert.equal(position, media.position, `${id}: the hero keeps the media map crop point`);
    ORDER.push(id);
    await page.locator('#hero-next').click();
  }
  assert.equal(await heroGameId(), openerId, 'one full cycle of Next returns to the opener');
  assert.deepEqual([...new Set(ORDER)].sort(), SPOT_POOL.map(game => game.id).sort(), `the cycle visits all ${TOTAL} curated games exactly once`);
  await releaseHero();
  const thumbs = () => page.evaluate(() => [...document.querySelectorAll('#hero-dots .hero-thumb')].map(button => ({
    index: Number(button.dataset.heroIndex),
    title: button.getAttribute('title'),
    label: button.getAttribute('aria-label'),
    text: button.textContent.trim(),
    current: button.classList.contains('active') || button.getAttribute('aria-current') !== null,
    tabIndex: button.tabIndex,
    art: button.querySelector('img.hero-thumb-art')?.getAttribute('src') || '',
  })));

  assert.equal(await page.locator('html').getAttribute('class'), 'page-spotlight', 'the spotlight page marks itself with page-spotlight');
  assert.equal(await page.locator('h1').count(), 1, 'the spotlight page has exactly one h1');
  assert.equal(await page.locator('#spotlight-name').evaluate(el => el.tagName), 'H1', 'the current game title is the page heading, not a generic slogan');
  assert.equal(await page.locator('#hero-heading').count(), 0, 'no leftover marketing headline on the spotlight page');
  const opener = gameById(ORDER[0]);
  assert(opener && TITLES.includes(opener.title), `the hero opens on one of the ${TOTAL} quality-curated spotlight games, not a fixed one (${opener?.title})`);
  assert.equal(await page.locator('#spotlight-tag').textContent(), opener.tag, 'the hero kicker is the current game tag');
  const expectedMeta = [opener.genre, opener.availability === 'sandbox-pending' ? 'Sandbox pending' : (opener.platform || 'Desktop')].filter(Boolean).join(' · ');
  assert.equal(await page.locator('#spotlight-genre').textContent(), expectedMeta, 'the meta line describes the current game');
  assert.equal(await page.locator('#spotlight-description').textContent(), opener.description, 'the description is the current game description');
  assert.equal(await page.locator('#spotlight-requirements').textContent(), opener.requirements, 'the requirements note is the current game requirements');

  const copyBox = await page.locator('#spotlight-description').boundingBox();
  const titleBox = await page.locator('#spotlight-name').boundingBox();
  assert(copyBox.x < CHECK_VIEWPORT.width / 2, `the description reads on the left half (x=${Math.round(copyBox.x)})`);
  assert(titleBox.y < copyBox.y, 'the title sits above the description');
  for (const [selector, minimum] of [['#spotlight-name', 38], ['#spotlight-description', 16], ['#spotlight-genre', 12], ['#spotlight-requirements', 13]]) {
    const size = await page.locator(selector).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert(size >= minimum, `${selector} is readable (${size}px)`);
  }
  assert.equal(await page.locator('#hero-slide-req').count(), 0);
  pass('spotlight hero is title-led on a shuffled opener: the h1, meta, description and requirements all describe whatever game is showing');

  /* ---------------------------------------------------------- up-next thumbnails */
  const pills = page.locator('[data-hero-index]');
  assert.equal(await pills.count(), 5, 'five upcoming game thumbnails');
  await page.waitForFunction(() => [...document.querySelectorAll('.hero-thumb-art')].every(img => img.complete && img.naturalWidth > 0));
  const peek = await thumbs();
  assert.equal(peek.length, 5, 'the strip holds five thumbnails');
  assert.equal(peek.every(entry => entry.text === '' && entry.title && entry.art), true, 'the thumbnails are unnumbered and carry the game title as a tooltip');
  assert.equal(new Set(peek.map(entry => entry.title)).size, 5, 'the five upcoming games are distinct');
  assert.equal(peek.some(entry => entry.title === opener.title), false, 'the current game is never repeated in its own up-next strip');
  assert.equal(peek.every(entry => TITLES.includes(entry.title)), true, 'every upcoming thumbnail names a real spotlight game');
  assert.equal(peek.every(entry => entry.current === false && entry.tabIndex === 0), true, 'no upcoming thumbnail is marked current and all stay tabbable');
  const currentIndex = ((peek[0].index - 1) + TOTAL) % TOTAL;
  const expectedPeek = [1, 2, 3, 4, 5].map(step => (currentIndex + step) % TOTAL);
  assert.deepEqual(peek.map(entry => entry.index), expectedPeek, 'the thumbnails preview current+1…current+5, wrapping once and never repeating');
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
  pass('spotlight hero shows five distinct decoded upcoming thumbnails previewing current+1…current+5, with 7s progress and bottom-right controls');

  /* ------------------------------------------------------ manual navigation first */
  await page.evaluate(() => [...document.querySelectorAll('#hero-dots .hero-thumb')].forEach((button, slot) => { button.dataset.qaNode = `n${slot}`; }));
  const nextUp = (await thumbs())[0];
  await page.locator('#hero-next').click();
  assert.equal(await title(), nextUp.title, `Next shows the game that was first up next (${nextUp.title})`);
  assert((await status()).includes(`Spotlight ${currentIndex + 2} of ${TOTAL}`), 'a manual change is announced politely with the running order');
  const nodeIds = await page.evaluate(() => [...document.querySelectorAll('#hero-dots .hero-thumb')].map(button => button.dataset.qaNode));
  assert.deepEqual(nodeIds, ['n0', 'n1', 'n2', 'n3', 'n4'], 'the five thumbnail nodes are stable across a slide change, so focus and animation state survive');
  await page.locator('#hero-prev').click();
  assert.equal(await title(), opener.title, 'Previous returns to the game it came from');
  const pick = (await thumbs())[2];
  await page.locator(`[data-hero-index="${pick.index}"]`).click();
  assert.equal(await title(), pick.title, 'a preview thumbnail selects the game it names');
  assert.deepEqual((await thumbs()).map(entry => entry.index), [1, 2, 3, 4, 5].map(step => (pick.index + step) % TOTAL), 'the five upcoming previews follow the selected game');
  await releaseHero();
  assert.equal(await paused(), false, 'the slideshow resumes once the pointer and focus leave the hero');
  pass('manual next/previous/preview thumbnails select games, update the five upcoming indexes and announce the change');

  /* ----------------------------------------------------------- autoplay behaviour */
  await page.evaluate(() => document.activeElement?.blur());
  const beforeAuto = await title();
  const announcement = await status();
  const autoplayStart = Date.now();
  const waited = await advance(beforeAuto);
  results.timings.firstAdvanceMs = waited;
  const afterAuto = await title();
  assert(afterAuto !== beforeAuto && TITLES.includes(afterAuto), `the hero advances on its own to another spotlight game (${afterAuto})`);
  results.timings.autoplayMeasuredMs = Date.now() - autoplayStart;
  assert(waited >= INTERVAL_MS - 700 && waited <= INTERVAL_MS + 1700, `autoplay advances on a ~7s beat (measured ${waited}ms)`);
  assert.equal(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null), true, 'autoplay moves no focus');
  assert.equal(await status(), announcement, 'autoplay announces nothing: the last manual announcement is untouched');
  assert.equal(await page.locator('#toast').evaluate(el => el.classList.contains('visible')), false, 'autoplay raises no toast');
  pass(`autoplay advances the hero on a measured ${waited}ms beat with no announcement and no focus change`);

  const afterAutoplay = await title();
  await page.mouse.move(CHECK_VIEWPORT.width / 2, CHECK_VIEWPORT.height * 0.6);
  assert.equal(await paused(), true, 'hovering the hero pauses the slideshow');
  await page.waitForTimeout(INTERVAL_MS + OVERRUN_MS);
  assert.equal(await title(), afterAutoplay, 'nothing advances while the hero is hovered');
  await page.mouse.move(2, 2);
  assert.equal(await paused(), false, 'leaving the hero resumes the slideshow');
  const resumeWait = await advance(afterAutoplay);
  results.timings.resumeAfterHoverMs = resumeWait;
  pass('hover pauses the spotlight slideshow and leaving resumes it');

  const beforeFocus = await title();
  await page.locator('#hero-next').focus();
  assert.equal(await paused(), true, 'focus inside the hero pauses the slideshow');
  await page.waitForTimeout(INTERVAL_MS + OVERRUN_MS);
  assert.equal(await title(), beforeFocus, 'nothing advances while focus is inside the hero');
  await page.evaluate(() => document.activeElement?.blur());
  assert.equal(await paused(), false, 'blurring the hero resumes the slideshow');
  pass('focus anywhere inside the hero pauses the spotlight slideshow; blurring resumes it');

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

  await page.mouse.move(2, 2);
  await page.locator('#hero-pause').click();
  assert.equal(await page.locator('#hero-pause').getAttribute('aria-pressed'), 'true', 'the pause button reports the paused state');
  assert((await page.locator('#hero-pause').getAttribute('aria-label')).toLowerCase().includes('play'), 'the pause button offers to play again');
  await releaseHero();
  assert.equal(await paused(), true, 'manual pause holds once the pointer leaves the hero');
  const beforeManual = await title();
  await page.waitForTimeout(INTERVAL_MS + OVERRUN_MS);
  assert.equal(await title(), beforeManual, 'nothing advances while the visitor has paused');
  await page.locator('#hero-pause').click();
  await releaseHero();
  assert.equal(await page.locator('#hero-pause').getAttribute('aria-pressed'), 'false', 'the pause button toggles back');
  const manualResume = await advance(beforeManual);
  results.timings.resumeAfterManualPauseMs = manualResume;
  pass('the pause button stops the slideshow for good and starts it again on the second press');

  /* ------------------------------------------------------ player + catalogue share */
  assert.equal(await page.locator('.game-card').count() >= GAMES.length, true, 'the spotlight page carries the same catalogue');
  assert.equal(await page.locator('a[target]').count(), 0, 'no launch link opens a new tab');
  assert.equal(await page.locator('a[href^="http"]').count(), 0, 'no external anchors on the spotlight page');
  const heroGame = await title();
  await page.locator('#hero-play').click();
  assert.equal(await page.locator('#player').evaluate(el => el.hidden), false, 'the hero action opens the in-site player');
  assert.equal(await page.locator('#player-title').textContent(), heroGame, 'the hero action opens the game that was on screen');
  assert.equal(await page.locator('#player a[href^="http"]').count(), 0, 'the player offers no external fallback');
  await page.locator('#player-close').click();
  assert.equal(await page.locator('#player').evaluate(el => el.hidden), true, 'Back closes the player');
  const pending = GAMES.find(game => game.availability === 'sandbox-pending');
  await page.locator('#search').fill(pending.title);
  const pendingCard = page.locator(`.sd-card[data-game="${pending.id}"]`).first();
  await pendingCard.locator('.game-art').click();
  await page.locator('.sd-panel [data-play]').click();
  assert.equal(await page.locator('#player-stage').getAttribute('data-state'), 'blocked', 'a sandbox-pending game still shows the blocked player state');
  assert((await page.locator('.player-panel').innerText()).includes('Sandbox pending'), 'the blocked panel still explains the pending state');
  await page.locator('#player-close').click();
  await page.locator('#search').fill('');
  pass('hero and catalogue launches on the spotlight page go through the existing sandbox player, including the sandbox-pending blocked state');

  /* ------------------------------------------------------------------ responsive */
  await page.goto(SPOTLIGHT);
  await page.locator('.game-card').first().waitFor();
  await page.mouse.move(2, 2);
  await page.screenshot({ path: 'artifacts/qa/hero-spotlight-desktop.png', fullPage: true });
  const desktopHero = await page.locator('#hero').evaluate(el => el.getBoundingClientRect().height);
  assert(desktopHero > homeHeroHeight + 100, `the spotlight hero is a taller full-bleed band than the homepage baseline (${desktopHero}px vs ${homeHeroHeight}px)`);
  results.timings.heroHeights = { homepage: homeHeroHeight, spotlight: desktopHero };

  // Composition geometry: the absolutely placed controls must never sit on the copy, and
  // the title must stay a few lines tall rather than spill down the frame.
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
    const title = await measure('#spotlight-name');
    const font = await page.locator('#spotlight-name').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert(title.height <= font * 1.05 * 3 + 6, `${label}: the title wraps to at most three lines (${Math.round(title.height)}px of ${font}px text)`);
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
  const mobileControls = await page.locator('.hero-slider-controls').boundingBox();
  assert(mobileControls.y >= mobileCopy.y + mobileCopy.height - 2, 'the mobile controls stack below the copy, clear of it');
  await page.screenshot({ path: 'artifacts/qa/hero-spotlight-mobile.png', fullPage: true });
  await page.evaluate(() => scrollTo(0, 0));
  const mobileSearch = await page.locator('.search-box').boundingBox();
  const mobileMenuButton = await page.locator('#menu-button').boundingBox();
  assert(mobileMenuButton.x >= mobileSearch.x + mobileSearch.width - 2 && mobileMenuButton.x - (mobileSearch.x + mobileSearch.width) <= 26, 'the mobile menu button stays immediately right of search');
  await page.locator('#menu-button').click();
  const mobileMenuPanel = await page.locator('#site-menu').boundingBox();
  assert(mobileMenuPanel.x >= 0 && mobileMenuPanel.x + mobileMenuPanel.width <= 391, 'the mobile pages menu stays inside the 390px viewport');
  await page.locator('#site-menu a').nth(1).textContent();
  await page.keyboard.press('Escape');
  await page.locator('#account-button').click();
  const mobileAccount = await page.locator('#account-popover').boundingBox();
  assert(mobileAccount.x >= 0 && mobileAccount.x + mobileAccount.width <= 391, 'the mobile account popover stays inside the 390px viewport');
  await page.keyboard.press('Escape');
  await page.setViewportSize(CHECK_VIEWPORT);
  pass('spotlight hero is full-bleed on desktop and stacks legibly with no overflow on a 390px viewport');

  /* -------------------------------------------- shuffle refresh opens on a new game */
  const preRefreshOpener = await page.locator('#hero-image').getAttribute('data-hero-game');
  await page.reload();
  await page.locator('.game-card').first().waitFor();
  await page.waitForFunction(() => document.querySelector('#hero-image')?.getAttribute('data-hero-game'));
  await page.mouse.move(2, 2);
  const postRefreshOpener = await page.locator('#hero-image').getAttribute('data-hero-game');
  assert(SPOT_POOL.some(game => game.id === postRefreshOpener), `a refresh still opens on one of the ${TOTAL} curated games (${postRefreshOpener})`);
  assert.notEqual(postRefreshOpener, preRefreshOpener, 'a refresh never reopens on the game it opened on last time');
  pass('the spotlight reshuffles on every load and a refresh never reopens on the previous game');

  /* ------------------------------------------------- reduced motion (no autoplay) */
  const calmElapsed = Date.now() - calmStarted;
  const calmOpenerId = await calmPage.locator('#hero-image').getAttribute('data-hero-game');
  const calmOpener = SPOT_POOL.find(game => game.id === calmOpenerId);
  const calmTitle = await calmPage.locator('#spotlight-name').textContent();
  assert(Boolean(calmOpener) && calmTitle === calmOpener.title, `reduced motion opens on a curated game and never starts the slideshow (checked after ${Math.round(calmElapsed / 1000)}s)`);
  assert((await calmPage.locator('#hero-dots').evaluate(el => el.classList.contains('is-paused'))) === true, 'reduced motion leaves the slideshow in the paused state');
  assert.equal(await calmPage.locator('.hero-progress-fill').evaluate(el => getComputedStyle(el).animationName), 'none', 'reduced motion removes the progress animation');
  assert.equal(await calmPage.locator('#hero-pause').isVisible(), true, 'the manual pause control stays available under reduced motion');
  assert(await calmElapsed > INTERVAL_MS + OVERRUN_MS, 'the reduced-motion window really did cover a full interval');
  results.timings.reducedMotionWindowMs = calmElapsed;
  const calmUpNext = await calmPage.locator('#hero-dots .hero-thumb').first().getAttribute('title');
  await calmPage.locator('#hero-next').click();
  assert.equal(await calmPage.locator('#spotlight-name').textContent(), calmUpNext, 'manual controls still work under reduced motion, moving to the game that was up next');
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
  await writeFile('artifacts/qa/hero-comparison-report.json', JSON.stringify(results, null, 2) + '\n');
  console.log(`\n${checks.length} checks passed in ${Math.round((Date.now() - calmStarted) / 1000)}s`);
  console.log(JSON.stringify({ passed: results.passed, homepageSlides: results.homepageSlides, spotlightSlides: results.spotlightSlides, timings: results.timings }, null, 2));
} finally {
  await browser?.close();
  await server.stop();
}
