/**
 * gameflex hero comparison QA — homepage baseline vs the spotlight preview page.
 *
 * Runs the bundled Edge build through the same Playwright rig the other suites use
 * (channel: msedge, no browser download). Playwright is resolved from GAMEFLEX_PLAYWRIGHT,
 * then from a normal node_modules lookup, then from this repo's node_modules whether the
 * script runs in the project root or in a git worktree.
 *
 * APPROVED BEHAVIOUR UNDER TEST (hero-refresh)
 *   - the homepage hero is the unchanged baseline: eleven slides, generic headline,
 *     numbered selectors, `01 / 11` index, 570px band, no pause control, never autoplays;
 *   - spotlight.html rotates NINE slides: the eight quality-curated hero games from
 *     spotlight-media.json plus ONE Gameflex brand promo slide. The promo is identified by
 *     the slide it renders, not by a hard-coded position;
 *   - the promo slide offers a call to action that names the games ("Show me the games") which
 *     scrolls the collection into view. It never exposes a #play/ link or a launch action, never
 *     opens the player, never deep-links a launch, and raises no popup;
 *   - the promo headline copy is dynamic: revisiting the promo slide in the same session shows
 *     different copy;
 *   - the five up-next previews are drawn from the CURATED GAME slides only — the strip walks the
 *     game ids, skipping the brand promo (an accepted product decision: five real game previews),
 *     previews current+1…current+5 among those games, wraps once and never repeats. The promo
 *     itself stays part of the carousel cycle;
 *   - a refresh reshuffles and never reopens on the previous first slide;
 *   - autoplay: one ~7s beat, silent, no focus movement. Hovering the hero does NOT pause
 *     it (autoplay continues under the pointer); focus inside the hero, a hidden tab, manual
 *     pause and reduced motion all still pause it;
 *   - the homepage document title is UNCHANGED ("gameflex — one more game.", read from
 *     dist/index.html at run time) and the spotlight page carries the new title "GameFlex -
 *     The Browser is your Console.";
 *   - ONLY the spotlight page carries the compact ~75px nav bar (the homepage keeps its
 *     original 94px header);
 *   - the shared header menu, account popover, Sports rename and in-site player are intact,
 *     with no new tab, no window.open and no external fallback.
 *
 * ASSUMPTIONS (confirm once the implementation is ready; see docs/spotlight-portraits-qa.md):
 *   - the promo slide is a hero slide whose data-hero-game is not a curated game id (the
 *     implementation stamps it "gameflex-promo"); its CTA is the hero action whose text names
 *     the games / scrolls the collection (the implementation labels it "Show me the games").
 *     Behaviour, not wording, is what is asserted: it scrolls the collection and never opens
 *     the player, deep-links a launch or raises a popup;
 *   - the up-next strip holds five REAL GAME thumbnails: it walks the curated game ids skipping
 *     the brand promo slide, so the strip never spends a slot on the promo (an accepted product
 *     decision — five genuine game previews). The promo stays part of the carousel cycle;
 *   - the promo thumb title (GAMEFLEX) stays stable even though its on-slide headline rotates.
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
// Approved: eight curated game slides + one Gameflex brand promo slide.
const SPOT_SLIDE_COUNT = SPOT_POOL.length + 1;
const HOME_SLIDE_COUNT = SLIDES.length;
const INTERVAL_MS = 7000;
const OVERRUN_MS = 700;
const CHECK_VIEWPORT = { width: 1440, height: 1000 };
const NAVBAR_HEIGHT = 75;
const NAVBAR_TOLERANCE = 8;
// The homepage keeps its original header: the compact 75px bar is a SPOTLIGHT-ONLY change.
const HOME_NAVBAR_HEIGHT = 94;
const HOME_NAVBAR_TOLERANCE = 6;
const BROWSER_TITLE = 'GameFlex - The Browser is your Console.';
// The homepage document title is UNCHANGED — read from the shipped dist/index.html rather than
// hard-coded, so this baseline assertion tracks the file that is actually published.
const HOME_TITLE = (() => {
  const source = readFile(path.join(DIST, 'index.html'), 'utf8');
  return source.then(text => (text.match(/<title>([^<]*)<\/title>/i) || [, ''])[1].trim());
})();
const HOME_TITLE_EXPECTED = 'gameflex — one more game.';
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
const results = { passed: false, homepageSlides: HOME_SLIDE_COUNT, spotlightSlides: SPOT_SLIDE_COUNT, autoplayIntervalMs: INTERVAL_MS, homepageTitle: HOME_TITLE_EXPECTED, spotlightTitle: BROWSER_TITLE, homepageNavbarHeight: HOME_NAVBAR_HEIGHT, spotlightNavbarHeight: NAVBAR_HEIGHT, checks, timings: {}, externalRequests: external, errors: [] };

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
  const heroGameId = () => page.locator('#hero-image').getAttribute('data-hero-game');
  // The spotlight order is shuffled per load, and the promo slide may sit anywhere, so "advance"
  // waits for the hero to move to any other slide rather than to a fixed index.
  const advance = async (fromTitle, timeout = INTERVAL_MS * 2) => {
    const started = Date.now();
    await page.waitForFunction(from => { const shown = document.getElementById('spotlight-name').textContent; return Boolean(shown) && shown !== from; }, fromTitle, { timeout });
    return Date.now() - started;
  };
  // Any click leaves the pointer and focus inside the hero. Move the pointer above the hero and
  // drop focus before timing anything.
  const releaseHero = async () => {
    await page.mouse.move(2, 2);
    await page.evaluate(() => document.activeElement?.blur());
  };

  await page.goto(HOME);
  await page.locator('.game-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);

  const homeTitleText = await HOME_TITLE;
  assert.equal(homeTitleText, HOME_TITLE_EXPECTED, `the homepage document title is unchanged (dist/index.html says "${homeTitleText}")`);
  assert.equal(await page.title(), HOME_TITLE_EXPECTED, `the homepage browser title is still "${HOME_TITLE_EXPECTED}" — the title change is spotlight-only`);
  assert.equal(await page.locator('#spotlight-name').evaluate(el => el.tagName), 'STRONG', 'the homepage keeps its copy-led hero panel, not a title-led h1');
  assert((await page.locator('#hero-heading').textContent()).includes('Old favourites'), 'the homepage headline copy is unchanged');
  assert.equal(await page.locator('#hero-pause').count(), 0, 'the homepage hero has no pause control');
  assert.equal(await page.locator('#hero-dots [data-hero-index]').count(), HOME_SLIDE_COUNT, `the homepage hero still carries its ${HOME_SLIDE_COUNT} slides`);
  assert.equal(HOME_SLIDE_COUNT, 11, 'the homepage spotlight set is still eleven games');
  assert.equal((await page.locator('[data-hero-index]').first().textContent()).trim(), '01', 'homepage selectors stay numbered');
  assert.equal((await page.locator('#hero-index-current').textContent()).trim(), '01');
  assert.equal((await page.locator('#hero-index-total').textContent()).trim(), String(HOME_SLIDE_COUNT).padStart(2, '0'));
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
  pass(`homepage hero baseline intact: ${HOME_SLIDE_COUNT} slides, generic headline, numbered selectors, ${homeHeroHeight}px band, no pause control, no autoplay, unchanged title "${HOME_TITLE_EXPECTED}", launch still goes through the player`);

  /* ---------------------------------------------------------- shared header chrome */
  for (const [label, url] of [['homepage', HOME], ['spotlight', SPOTLIGHT]]) {
    await page.goto(url);
    await page.locator('.game-card').first().waitFor();
    if (label === 'homepage') {
      // The title change is Spotlight-only: the homepage keeps its original document title.
      assert.equal(await page.title(), HOME_TITLE_EXPECTED, `homepage: the document title is UNCHANGED ("${await page.title()}")`);
    } else {
      assert.equal(await page.title(), BROWSER_TITLE, `spotlight: the document title is the new exact "${BROWSER_TITLE}"`);
    }
    const navHeight = await page.locator('.site-header').evaluate(el => el.getBoundingClientRect().height);
    if (label === 'homepage') {
      // The compact bar is a Spotlight-only change — the homepage header stays at its original height.
      assert(Math.abs(navHeight - HOME_NAVBAR_HEIGHT) <= HOME_NAVBAR_TOLERANCE, `homepage: the header keeps its original ~${HOME_NAVBAR_HEIGHT}px height, NOT the compact ${NAVBAR_HEIGHT}px (measured ${Math.round(navHeight)}px)`);
    } else {
      assert(Math.abs(navHeight - NAVBAR_HEIGHT) <= NAVBAR_TOLERANCE, `spotlight: the nav bar is the compact ~${NAVBAR_HEIGHT}px design (measured ${Math.round(navHeight)}px)`);
    }
    // APPROVED: on the spotlight page BOTH the header and footer wordmark are the local SVG asset
    // gameflex-curve.svg, and each anchor's accessible name is GAMEFLEX. Its textContent is empty
    // now (the logo is an image with alt="GAMEFLEX"), so the old text assertion must read the
    // accessible label, not textContent. The homepage keeps its original text wordmark, unchanged.
    const wordmarks = page.locator('.site-header .wordmark, footer .wordmark');
    assert.equal(await wordmarks.count(), 2, `${label}: a header and a footer wordmark are present`);
    for (const [slot, place] of [[0, 'header'], [1, 'footer']]) {
      const wm = wordmarks.nth(slot);
      const textContent = ((await wm.textContent()) || '').trim();
      const ariaLabel = ((await wm.getAttribute('aria-label')) || '').trim();
      const img = wm.locator('img');
      if (label === 'spotlight') {
        const alt = ((await img.getAttribute('alt')) || '').trim();
        const accessible = ariaLabel || alt;
        assert(/GAMEFLEX/.test(accessible), `${label}: the spotlight ${place} wordmark's accessible name is GAMEFLEX ("${accessible}")`);
        assert.equal(alt, 'GAMEFLEX', `${label}: the spotlight ${place} wordmark image alt is GAMEFLEX`);
        assert.equal(await img.count(), 1, `${label}: the spotlight ${place} wordmark uses an image asset`);
        const src = await img.getAttribute('src');
        assert(/gameflex-curve\.svg$/.test(src || ''), `${label}: the spotlight ${place} wordmark paints the local gameflex-curve.svg asset (${src})`);
        assert.equal(textContent, '', `${label}: the spotlight ${place} wordmark anchor carries no stray text — the logo is the image`);
      } else {
        // UNCHANGED: the homepage keeps the original text wordmark and no curve asset.
        assert(/gameflex/i.test(textContent), `${label}: the homepage ${place} wordmark still shows its original text ("${textContent}")`);
        assert.equal(await img.count(), 0, `${label}: the homepage ${place} wordmark is not replaced by an image`);
      }
    }
    // APPROVED: the active nav item keeps its underline, but the rule now sits INSIDE the button
    // beneath the label — never a pill or a background enclosure. The header keeps its height.
    const activeNav = page.locator('.site-header nav .nav-link.active');
    assert.equal(await activeNav.count(), 1, `${label}: exactly one nav item is active`);
    const nav = await activeNav.evaluate(el => {
      const box = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      return {
        width: box.width,
        content: after.content,
        afterHeight: parseFloat(after.height) || 0,
        afterWidth: parseFloat(after.width) || 0,
        afterBg: after.backgroundColor,
        afterBottom: after.bottom,
        background: getComputedStyle(el).backgroundColor,
      };
    });
    assert(nav.content && nav.content !== 'none', `${label}: the active nav item keeps an ::after underline`);
    if (label === 'spotlight') {
      // The inside-the-button rule is the approved Spotlight change; the homepage keeps its own.
      assert(nav.afterHeight > 0 && nav.afterHeight <= 6, `${label}: the underline is a thin rule (${nav.afterHeight}px)`);
      assert(nav.afterBg && !/rgba?\(0, 0, 0, 0\)/.test(nav.afterBg), `${label}: the underline is painted (${nav.afterBg})`);
      const afterBottom = parseFloat(nav.afterBottom);
      assert(Number.isFinite(afterBottom) && afterBottom >= 0, `${label}: the underline sits INSIDE the button, not below it (::after bottom ${nav.afterBottom})`);
      assert(/rgba?\(0, 0, 0, 0\)|transparent/.test(nav.background), `${label}: the active nav item has no pill or background enclosure (${nav.background})`);
      assert(nav.afterWidth <= nav.width + 1, `${label}: the underline stays within the button width`);
    }
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
  pass(`the spotlight page carries the new title "${BROWSER_TITLE}" and the compact ~${NAVBAR_HEIGHT}px nav bar, while the homepage keeps its original title "${HOME_TITLE_EXPECTED}" and ~${HOME_NAVBAR_HEIGHT}px header; menu sits immediately right of search on both and links both pages; account popover is coming-soon only; Sports filter renamed`);

  /* ------------------------------------------------------------------ page ground colour */
  // APPROVED: the spotlight ground is the darker #0b0d0b, a shade below the homepage #101210.
  const groundOf = async url => {
    await page.goto(url);
    await page.locator('.game-card').first().waitFor();
    return page.evaluate(() => ({ body: getComputedStyle(document.body).backgroundColor, html: getComputedStyle(document.documentElement).backgroundColor }));
  };
  const homeGround = await groundOf(HOME);
  const spotGround = await groundOf(SPOTLIGHT);
  const bgChannels = value => (value.match(/\d+/g) || []).slice(0, 3).map(Number);
  const bgSum = value => bgChannels(value).reduce((total, channel) => total + channel, 0);
  assert(/16, 18, 16/.test(homeGround.body), `the homepage ground stays #101210 (${homeGround.body})`);
  assert(/11, 13, 11/.test(spotGround.body), `the spotlight ground is the darker #0b0d0b (${spotGround.body})`);
  assert(bgSum(spotGround.body) < bgSum(homeGround.body), `the spotlight ground is darker than the homepage (${spotGround.body} vs ${homeGround.body})`);
  pass('the spotlight page ground is #0b0d0b, a darker shade than the homepage #101210');

  /* --------------------------------------- spotlight hero: curated games + promo slides */
  await page.goto(SPOTLIGHT);
  await page.locator('.game-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(2, 2);

  // Snapshot of the live slide: id (data-hero-game, stamped by dist/app.js paintHero), title,
  // copy, backdrop and whether a launch affordance or a games-naming CTA is present.
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
      // The promo CTA is the launch action (`#hero-play`) whose text names the games; the approved
      // label "Explore games" ships as "Show me the games". On a game slide the same control reads
      // "Let's play" / "View game", so this predicate separates the two. It deliberately ignores the
      // shared static "See the collection" link, which sits in .hero-actions on EVERY slide and would
      // otherwise make every slide look like a promo. Behaviour is asserted word-agnostically below.
      promoAction: /games|collection/i.test(play?.textContent || ''),
      heroPlayText: play?.textContent?.trim() || '',
      heroPlayDisabled: play ? Boolean(play.disabled) : true,
      playDeepLink: document.querySelectorAll('.hero-actions a[href^="#play/"], .hero-actions [data-play]').length,
    };
  });
  // The promo slide is the one slide that is not a curated game id (or carries no id at all).
  const keyOf = snap => snap.heroGameId || `promo:${snap.title}`;
  const isGameKey = key => SPOT_POOL.some(game => game.id === key);

  // Walk one full cycle with Next, snapshotting each slide. The opener is the origin.
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
  assert.equal(gameEntries.length, SPOT_POOL.length, `eight quality-curated game slides (found ${gameEntries.length})`);
  assert.equal(new Set(gameEntries.map(entry => entry.key)).size, SPOT_POOL.length, 'each curated game appears once in the rotation');
  assert.equal(promoEntries.length, 1, `exactly one Gameflex brand promo slide (found ${promoEntries.length})`);
  const PROMO_INDEX = walk.findIndex(entry => !isGameKey(entry.key));
  const PROMO_KEY = walk[PROMO_INDEX].key;
  const PROMO_TITLE = walk[PROMO_INDEX].snap.title;
  assert.equal(walk[PROMO_INDEX].snap.playDeepLink, 0, 'the promo slide offers no #play/ deep link');
  assert.equal(walk[PROMO_INDEX].snap.promoAction, true, 'the promo slide offers a call to action that names the games');
  assert(gameEntries.every(entry => !entry.snap.promoAction && /play|view/i.test(entry.snap.heroPlayText) && !entry.snap.heroPlayDisabled), 'every game slide keeps a working in-site launch action instead of the promo CTA');

  // Every game slide names its game and paints the media-map artwork and crop.
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
  await page.screenshot({ path: 'artifacts/qa/hero-spotlight-desktop.png', fullPage: true });

  assert.equal(await page.locator('html').getAttribute('class'), 'page-spotlight', 'the spotlight page marks itself with page-spotlight');
  assert.equal(await page.locator('h1').count(), 1, 'the spotlight page has exactly one h1');
  assert.equal(await page.locator('#spotlight-name').evaluate(el => el.tagName), 'H1', 'the current title is the page heading, not a generic slogan');
  assert.equal(await page.locator('#hero-heading').count(), 0, 'no leftover marketing headline on the spotlight page');
  pass(`spotlight hero rotates ${TOTAL} slides — ${SPOT_POOL.length} curated games plus one Gameflex brand promo at index ${PROMO_INDEX} — each game naming its title and media, the promo carrying a games-naming CTA and no launch link`);

  /* ------------------------------------------------------- promo CTA + dynamic copy */
  // From the opener, step forward to the promo slide and exercise its call to action.
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
  // Revisit the promo (one more lap) and confirm the headline copy is dynamic.
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
  // The strip previews five REAL GAMES: it walks the curated game ids (skipping the brand promo
  // slide, an accepted product decision), so its indexes are computed over the game slides only.
  const GAME_IDX = walk.map((entry, index) => (isGameKey(entry.key) ? index : -1)).filter(index => index >= 0);
  const titleById = new Map(SPOT_POOL.map(game => [`${game.id}`, game.title]));
  const keyOfIndex = index => walk[index]?.key || '';
  const expectedUpcoming = current => {
    const start = GAME_IDX.findIndex(index => index > current);
    const ordered = start === -1 ? GAME_IDX.slice() : [...GAME_IDX.slice(start), ...GAME_IDX.slice(0, start)];
    return ordered.slice(0, 5);
  };
  // Return to the opener so the preview indexes are read from a known origin.
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
  // Every thumbnail is a real game: a curated title, never the brand promo.
  assert.equal(peek.every(entry => entry.title === titleById.get(keyOfIndex(entry.index))), true, `every upcoming thumbnail indexes a curated game slide (${peek.map(entry => entry.title).join(', ')})`);
  assert.equal(peek.some(entry => entry.title === PROMO_TITLE), false, 'the up-next strip never spends a slot on the brand promo');
  assert.equal(peek.every(entry => entry.current === false && entry.tabIndex === 0), true, 'no upcoming thumbnail is marked current and all stay tabbable');
  // Order and indexes: current+1…current+5 over the curated game slides, wrapping once, skipping promo.
  const expectedPeek = expectedUpcoming(openerIndexInWalk);
  assert.equal(expectedPeek.length, 5, 'the curated pool supplies five upcoming games');
  assert.deepEqual(peek.map(entry => entry.index), expectedPeek, 'the previews walk the curated game ids after the current slide (skipping the promo), wrapping once');
  assert.equal(new Set(peek.map(entry => entry.index)).size, 5, 'the five preview indexes are distinct — no repeats and no promo slot');
  assert.deepEqual(peek.map(entry => entry.title), expectedPeek.map(index => titleById.get(keyOfIndex(index))), 'the preview titles follow the curated game order');
  assert.equal(peek.every(entry => entry.art.length > 0), true, 'every upcoming thumbnail carries artwork');
  // Decoded: each thumbnail's image really decodes from its source.
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
  await page.evaluate(() => [...document.querySelectorAll('#hero-dots .hero-thumb')].forEach((button, slot) => { button.dataset.qaNode = `n${slot}`; }));
  const nextUp = (await thumbs())[0];
  await page.locator('#hero-next').click();
  const afterNext = await slideSnapshot();
  if (isGameKey(keyOf(afterNext))) {
    assert.equal(afterNext.title, nextUp.title, `Next shows the slide that was first up next (${nextUp.title})`);
  } else {
    assert.equal(keyOf(afterNext), PROMO_KEY, 'Next reaches the promo slide when it was first up next');
  }
  assert((await status()).includes('Spotlight'), 'a manual change is announced politely with the running order');
  const nodeIds = await page.evaluate(() => [...document.querySelectorAll('#hero-dots .hero-thumb')].map(button => button.dataset.qaNode));
  assert.deepEqual(nodeIds, ['n0', 'n1', 'n2', 'n3', 'n4'], 'the five thumbnail nodes are stable across a slide change, so focus and animation state survive');
  await page.locator('#hero-prev').click();
  assert.equal(await keyOf(await slideSnapshot()), openerKey, 'Previous returns to the slide it came from');
  const pick = (await thumbs())[2];
  await page.locator(`[data-hero-index="${pick.index}"]`).click();
  assert.deepEqual((await thumbs()).map(entry => entry.index), expectedUpcoming(pick.index), 'the five upcoming previews follow the selected slide across the curated game ids');
  await releaseHero();
  assert.equal(await paused(), false, 'the slideshow is running once the pointer and focus leave the hero');
  pass(`manual next/previous/preview thumbnails move the carousel across all ${TOTAL} slides (promo included) and update the five upcoming game indexes`);
  await page.locator('#hero-prev').click();
  await releaseHero();

  /* ----------------------------------------------------------- autoplay behaviour */
  await page.evaluate(() => document.activeElement?.blur());
  const beforeAuto = await title();
  const announcement = await status();
  const autoplayStart = Date.now();
  const waited = await advance(beforeAuto);
  results.timings.firstAdvanceMs = waited;
  const afterAuto = await title();
  assert(afterAuto !== beforeAuto && afterAuto.length > 0, `the hero advances on its own to another spotlight slide (${afterAuto})`);
  results.timings.autoplayMeasuredMs = Date.now() - autoplayStart;
  assert(waited >= INTERVAL_MS - 700 && waited <= INTERVAL_MS + 1700, `autoplay advances on a ~7s beat (measured ${waited}ms)`);
  assert.equal(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null), true, 'autoplay moves no focus');
  assert.equal(await status(), announcement, 'autoplay announces nothing: the last manual announcement is untouched');
  assert.equal(await page.locator('#toast').evaluate(el => el.classList.contains('visible')), false, 'autoplay raises no toast');
  pass(`autoplay advances the hero on a measured ${waited}ms beat with no announcement and no focus change`);

  // APPROVED: hovering the hero no longer pauses autoplay — it keeps running under the pointer.
  const beforeHover = await title();
  await page.mouse.move(CHECK_VIEWPORT.width / 2, CHECK_VIEWPORT.height * 0.6);
  assert.equal(await paused(), false, 'hovering the hero does NOT pause the slideshow');
  const hoverAdvance = await advance(beforeHover);
  results.timings.advanceWhileHoveringMs = hoverAdvance;
  assert(hoverAdvance <= INTERVAL_MS + 1700, `the slideshow keeps advancing while the hero is hovered (measured ${hoverAdvance}ms)`);
  assert.equal(await paused(), false, 'the slideshow reports running while hovered');
  await page.mouse.move(2, 2);
  pass(`hovering the hero leaves autoplay running — it advanced in ${hoverAdvance}ms under the pointer`);

  // Focus, a hidden tab, manual pause and reduced motion all still stand the slideshow down.
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
  // Land on a game slide before exercising the hero launch action.
  for (let step = 0; step < TOTAL; step += 1) {
    if (isGameKey(keyOf(await slideSnapshot()))) break;
    await page.locator('#hero-next').click();
  }
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
  const desktopHero = await page.locator('#hero').evaluate(el => el.getBoundingClientRect().height);
  assert(desktopHero > homeHeroHeight + 100, `the spotlight hero is a taller full-bleed band than the homepage baseline (${desktopHero}px vs ${homeHeroHeight}px)`);
  results.timings.heroHeights = { homepage: homeHeroHeight, spotlight: desktopHero };

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
  await writeFile('artifacts/qa/hero-comparison-report.json', JSON.stringify(results, null, 2) + '\n');
  console.log(`\n${checks.length} checks passed in ${Math.round((Date.now() - calmStarted) / 1000)}s`);
  console.log(JSON.stringify({ passed: results.passed, homepageSlides: results.homepageSlides, spotlightSlides: results.spotlightSlides, timings: results.timings }, null, 2));
} finally {
  await browser?.close();
  await server.stop();
}
