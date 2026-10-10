/*
 * gameflex catalogue QA (hero carousel + combined catalogue).
 *
 * Runs against the built dist/ served over loopback. Expected counts are derived
 * from dist/games.json, read locally, so the assertions track the shipped
 * catalogue (37 listings: 16 reviewed + 21 DOS sandbox-pending) rather than a
 * hardcoded number.
 *
 * Fixtures: every non-loopback request is answered with a deterministic local
 * fixture page, so this suite never contacts a real game host. Opening the
 * player for a playable game only renders the ready panel — no frame is
 * requested until Start is clicked, which this suite never does.
 */
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';

const {chromium} = await import(process.env.GAMEFLEX_PLAYWRIGHT || 'playwright');
const games = JSON.parse(await readFile('dist/games.json', 'utf8'));
const browser = await chromium.launch({channel: 'msedge', headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir('artifacts/qa', {recursive: true});

const fixtureHosts = new Set();
await page.route(url => ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname), route => {
  fixtureHosts.add(new URL(route.request().url()).hostname);
  return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GAMEFLEX QA FIXTURE</title></head><body data-gameflex-fixture="1"><h1>Deterministic QA fixture — not real gameplay</h1></body></html>'});
});

const playerHidden = () => page.locator('#player').evaluate(el => el.hidden);
const stageState = () => page.locator('#player-stage').getAttribute('data-state');

try {
  await page.goto(process.env.GAMEFLEX_PREVIEW || 'http://127.0.0.1:4175');
  await page.locator('.game-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);

  /* ------------------------------------------------------------- hero carousel */
  const featured = games.filter(g => g.featured || g.spotlight);
  assert(featured.length >= 6, 'the hero has enough slides to be a carousel');
  assert(featured.length >= 11, 'the hero keeps the existing spotlight games');
  assert.equal(await page.locator('[data-hero-index]').count(), featured.length, 'one dot per slide');
  assert.equal(await page.locator('#hero-index-total').textContent(), String(featured.length).padStart(2, '0'));
  assert.equal(await page.locator('#spotlight-name').textContent(), featured[0].title);

  await page.locator('#hero-next').click();
  assert.equal(await page.locator('#spotlight-name').textContent(), featured[1].title);

  // The current-slide CTA opens that slide's own game inside the internal player.
  await page.locator('#hero-play').click();
  assert.equal(await playerHidden(), false, 'the hero CTA opens the internal player, not a details dialog');
  assert.equal(await page.evaluate(() => location.hash), `#play/${featured[1].id}`);
  assert.equal(await page.locator('#player-title').textContent(), featured[1].title);
  assert.equal(await page.locator('#dialog-title').count(), 0, 'the hero CTA no longer opens the details dialog');
  await page.keyboard.press('Escape');
  assert.equal(await playerHidden(), true, 'Escape closes the player');

  // A sandbox-pending slide opens the internal player's blocked state.
  const pendingIndex = featured.findIndex(g => g.availability === 'sandbox-pending');
  assert(pendingIndex >= 0, 'at least one spotlight slide is sandbox-pending');
  await page.locator(`[data-hero-index="${pendingIndex}"]`).click();
  assert.equal(await page.locator('#spotlight-name').textContent(), featured[pendingIndex].title);
  await page.locator('#hero-play').click();
  assert.equal(await playerHidden(), false, 'a pending slide still opens the internal player');
  assert.equal(await page.locator('#player-title').textContent(), featured[pendingIndex].title);
  assert.equal(await stageState(), 'blocked', 'a pending slide shows the blocked player state');
  assert((await page.locator('.player-panel').innerText()).includes('Sandbox pending'), 'the blocked panel says Sandbox pending');
  assert.equal(await page.locator('#player a[href^="http"]').count(), 0, 'the blocked player offers no external link');
  await page.locator('#player-close').click();
  assert.equal(await playerHidden(), true, 'Back closes the player before the carousel checks continue');

  await page.locator('[data-hero-index="0"]').click();
  assert.equal(await page.locator('#spotlight-name').textContent(), featured[0].title);
  await page.locator('#hero-prev').click();
  assert.equal(await page.locator('#spotlight-name').textContent(), featured.at(-1).title, 'Previous wraps to the last slide');
  await page.locator('#hero-next').click();
  assert.equal(await page.locator('#spotlight-name').textContent(), featured[0].title, 'Next wraps back to the first slide');

  await page.locator('[data-hero-index="0"]').focus();
  await page.keyboard.press('ArrowRight');
  assert(await page.locator('[data-hero-index="1"]').evaluate(el => el === document.activeElement), 'Carousel keyboard focus follows the selected slide');
  await page.locator('[data-hero-index="0"]').click();

  /* -------------------------------------------------------------- DOS listings */
  const dos = games.filter(g => g.provider === 'dos-zone');
  assert(dos.length >= 21, 'the catalogue keeps its existing DOS listings');
  assert.equal(await page.locator('#row-dos-zone .game-card').count(), dos.length);
  for (const game of dos) {
    assert.equal(game.availability, 'sandbox-pending', `Pending availability preserved: ${game.title}`);
    await page.locator('#search').fill(game.title);
    const card = page.locator('.game-card').filter({has: page.locator(`[data-details="${game.id}"]`)}).first();
    assert(await card.isVisible());
    assert.equal(await card.locator('a[target]').count(), 0, `Pending card links stay internal: ${game.title}`);

    // Tile/title opens the internal player's blocked state, not a details dialog.
    await card.locator('.game-art').click();
    assert.equal(await playerHidden(), false, `Pending card opens the internal player: ${game.title}`);
    assert.equal(await page.locator('#player-title').textContent(), game.title);
    assert.equal(await stageState(), 'blocked', `Pending card shows the blocked state: ${game.title}`);
    assert((await page.locator('.player-panel').innerText()).includes('Sandbox pending'), `Blocked panel says Sandbox pending: ${game.title}`);
    assert.equal(await page.locator('#player a[href^="http"]').count(), 0, `No external fallback for ${game.title}`);
    await page.locator('#player-close').click();
    assert.equal(await playerHidden(), true);

    // Details via the info button still exists.
    await card.locator('button.info-button').click();
    assert.equal(await page.locator('#dialog-title').textContent(), game.title);
    assert.equal(await page.locator('#details a[target]').count(), 0, `Details dialog stays internal: ${game.title}`);
    assert((await page.locator('#dialog-content').textContent()).includes('Sandbox'), `Details explain the sandbox state: ${game.title}`);
    await page.keyboard.press('Escape');
  }
  await page.locator('#search').fill('');

  /* ----------------------------------------------------------------- genres */
  for (const category of ['strategy', 'racing', 'platformers', 'puzzle', 'fighting', 'rpg', 'simulation', 'sports']) {
    await page.locator(`[data-category="${category}"]`).click();
    assert.equal(await page.locator('.game-card').count(), games.filter(g => g.category === category).length, `${category} filter count`);
  }
  await page.locator('[data-category="all"]').click();

  /* ------------------------------------------------------------- favourites */
  await page.locator(`[data-favourite="${dos[0].id}"]`).first().click();
  await page.reload();
  await page.locator('.game-card').first().waitFor();
  await page.locator('[data-view="favourites"]').click();
  assert.equal(await page.locator('.game-card').count(), 1, 'a DOS favourite persists and lists once');
  await page.locator('[data-view="discover"]').click();

  /* --------------------------------------------------------------- artwork */
  for (const game of games) {
    assert(game.art, `Artwork required: ${game.title}`);
    const response = await page.request.get(new URL(game.art, page.url()).href);
    assert(response.ok(), `Image response: ${game.title}`);
  }
  await page.evaluate(async () => { await Promise.all([...document.images].map(img => { img.loading = 'eager'; return img.decode().catch(() => {}); })); });
  assert(await page.locator('.game-art img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0)));

  /* ----------------------------------------------------------- layout + motion */
  await page.locator('[data-hero-index="4"]').click();
  await page.screenshot({path: 'artifacts/qa/catalogue-desktop.png', fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({path: 'artifacts/qa/catalogue-mobile.png', fullPage: true});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile horizontal overflow');
  const slider = await page.locator('#hero-slider').boundingBox(), content = await page.locator('.hero-content').boundingBox();
  assert(slider.y >= content.y + content.height - 2, 'Hero carousel does not overlap hero copy on mobile');
  await page.locator('#hero-next').click();
  assert.equal(await page.locator('#spotlight-name').textContent(), featured[5].title);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.locator('#hero-next').click();
  assert.equal(await page.locator('#hero-image').evaluate(el => getComputedStyle(el).animationName), 'none');

  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(fixtureHosts.size, 0, `no real host was contacted: ${[...fixtureHosts].join(', ')}`);

  const report = {
    passed: true,
    games: games.length,
    reviewed: games.filter(g => !g.provider).length,
    dosListings: dos.length,
    heroSlides: featured.length,
    allCoversLoaded: true,
    checks: [
      'current-slide hero CTA opens that game in the internal player',
      'sandbox-pending slide opens the blocked player with Sandbox pending',
      'carousel next/previous/wrap/dots',
      'pending DOS cards open the internal player blocked state, no external play link',
      'DOS details via the info button still explain the sandbox state',
      'all genres',
      'favourites persistence',
      'desktop/mobile layout',
      'mobile hero no overlap',
      'reduced motion',
    ],
    errors,
  };
  await writeFile('artifacts/qa/catalogue-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
