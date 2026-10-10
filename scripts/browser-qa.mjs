import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.GAMEFLEX_PLAYWRIGHT || 'playwright');
await mkdir('artifacts/qa',{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173');await page.locator('.game-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:'artifacts/qa/desktop.png',fullPage:true});
const count=await page.locator('.game-card').count();assert(count>0);
assert.equal((await page.locator('.site-header .wordmark').textContent()).trim(),'GAMEFLEX');
for(const selector of ['.card-meta','.card-tag','.shelf-subtitle','.collection-count','.hero-note','footer']) {
  assert(await page.locator(selector).first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=12),`${selector} readable text size`);
}
// Each click/key should advance one card, rather than replacing the entire visible shelf.
async function checkShelfStep() {
  const row=page.locator('#row-shooters');
  const pitch=await row.evaluate(el=>el.children[1].getBoundingClientRect().left-el.children[0].getBoundingClientRect().left);
  const right=page.locator('[data-scroll="shooters"][data-direction="1"]');
  const left=page.locator('[data-scroll="shooters"][data-direction="-1"]');
  await right.click();
  await page.waitForFunction(p=>Math.abs(document.querySelector('#row-shooters').scrollLeft-p)<3,pitch);
  await right.click();
  await page.waitForFunction(p=>Math.abs(document.querySelector('#row-shooters').scrollLeft-p*2)<3,pitch);
  await left.click();
  await page.waitForFunction(p=>Math.abs(document.querySelector('#row-shooters').scrollLeft-p)<3,pitch);
  await row.focus();await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>document.querySelector('#row-shooters').scrollLeft<3);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(p=>Math.abs(document.querySelector('#row-shooters').scrollLeft-p)<3,pitch);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>document.querySelector('#row-shooters').scrollLeft<3);
  const firstArt=row.locator('.game-art').nth(0), nextArt=row.locator('.game-art').nth(1);
  await firstArt.focus();await page.keyboard.press('ArrowRight');
  assert(await nextArt.evaluate(el=>el===document.activeElement),'Keyboard movement keeps focus on the newly shown game');
  await page.waitForFunction(p=>Math.abs(document.querySelector('#row-shooters').scrollLeft-p)<3,pitch);
  await page.keyboard.press('ArrowLeft');
  assert(await firstArt.evaluate(el=>el===document.activeElement));
  await page.waitForFunction(()=>document.querySelector('#row-shooters').scrollLeft<3);
}
await checkShelfStep();
await page.locator('[data-favourite="halo"]').first().click();
assert.equal(await page.locator('#favourite-count').textContent(),'1');
await page.reload();await page.locator('.game-card').first().waitFor();assert.equal(await page.locator('#favourite-count').textContent(),'1');
await page.locator('[data-view="favourites"]').click();assert.equal(await page.locator('.game-card').count(),1);
await page.locator('[data-favourite="halo"]').click();assert(await page.locator('#empty-state').isVisible());
await page.locator('#reset').click();
await page.locator('#search').fill('quAke');assert.equal(await page.locator('.game-card').count(),3);
await page.locator('#search').fill('zzzz-not-a-game');assert(await page.locator('#empty-state').isVisible());
await page.locator('#reset').click();await page.locator('[data-category="sports"]').click();assert.equal(await page.locator('.game-card').count(),3);
assert(!(await page.locator('[data-category="strategy"]').isVisible()));
await page.locator('[data-view="discover"]').click();
await page.locator('[data-details="halo"]').first().click();assert(await page.locator('#details').isVisible());assert((await page.locator('.requirements').textContent()).includes('XISO'));await page.keyboard.press('Escape');assert(!(await page.locator('#details').isVisible()));
await page.locator('#surprise').click();assert(await page.locator('#details').isVisible());await page.keyboard.press('Escape');
const links=await page.locator('.game-card a').evaluateAll(els=>els.map(a=>({target:a.target,rel:a.rel,href:a.href})));assert(links.every(a=>a.target==='_blank'&&a.rel.includes('noopener')&&a.rel.includes('noreferrer')&&a.href.startsWith('https://')));
await page.route('https://mitchellhynes.com/**',route=>route.fulfill({status:200,body:'Game navigation test'}));
const popupPromise=page.waitForEvent('popup');await page.locator('.game-art').first().click();const popup=await popupPromise;await popup.waitForLoadState();assert(popup.url().includes('mitchellhynes.com/halo'));await popup.close();
await page.locator('#about-button').click();assert(await page.locator('#about').isVisible());await page.keyboard.press('Escape');
await page.keyboard.press('/');assert.equal(await page.locator('#search').evaluate(el=>el===document.activeElement),true);
await page.setViewportSize({width:390,height:844});await page.locator('#search').blur();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'artifacts/qa/mobile.png',fullPage:true});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
await checkShelfStep();
for(const selector of ['.card-meta','.card-tag','.shelf-subtitle','.hero-note','footer']) {
  assert(await page.locator(selector).first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=12),`${selector} mobile readable text size`);
}
await page.locator('[data-view="favourites"]').click();assert(await page.locator('#empty-state').isVisible());await page.locator('#reset').click();
await page.locator('[data-favourite="bo1"]').first().click();assert.equal(await page.locator('#favourite-count').textContent(),'1');
assert.equal(errors.length,0,errors.join('\n'));
const report={passed:true,checks:['desktop render','mobile render and no overflow','capital-case pixel logo','readable supporting text at both widths','one-card shelf buttons and ArrowLeft/ArrowRight at both widths','search case-insensitive and empty result','category filters and empty category','favourites add/remove/reload persistence','favourites empty state','game details and requirements','random picker','new-tab navigation (intercepted destination)','secure external link attributes','keyboard search shortcut','Escape closes dialogs','about dialog'],consoleErrors:errors,renderedCards:count};
await writeFile('artifacts/qa/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
