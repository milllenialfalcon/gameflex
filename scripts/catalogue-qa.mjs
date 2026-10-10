import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.GAMEFLEX_PLAYWRIGHT||'playwright');
const games=JSON.parse(await readFile('dist/games.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('artifacts/qa',{recursive:true});
try {
 await page.goto(process.env.GAMEFLEX_PREVIEW||'http://127.0.0.1:4175');
 await page.locator('.game-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 const featured=games.filter(g=>g.featured||g.spotlight);
 assert(featured.length>=6);assert.equal(await page.locator('[data-hero-index]').count(),featured.length);
 assert.equal(await page.locator('#spotlight-name').textContent(),featured[0].title);
 await page.locator('#hero-next').click();assert.equal(await page.locator('#spotlight-name').textContent(),featured[1].title);
 await page.locator('#hero-play').click();assert.equal(await page.locator('#dialog-title').textContent(),featured[1].title);await page.keyboard.press('Escape');
 await page.locator('#hero-prev').click();assert.equal(await page.locator('#spotlight-name').textContent(),featured[0].title);
 await page.locator('#hero-prev').click();assert.equal(await page.locator('#spotlight-name').textContent(),featured.at(-1).title);
 await page.locator('[data-hero-index="0"]').click();
 await page.locator('[data-hero-index="0"]').focus();await page.keyboard.press('ArrowRight');
 assert(await page.locator('[data-hero-index="1"]').evaluate(el=>el===document.activeElement),'Carousel keyboard focus follows the selected slide');
 await page.locator('[data-hero-index="0"]').click();
 const dos=games.filter(g=>g.provider==='dos-zone');assert.equal(dos.length,21);
 assert.equal(await page.locator('#row-dos-zone .game-card').count(),dos.length);
 for(const game of dos){
  assert.equal(game.availability,'sandbox-pending');
  await page.locator('#search').fill(game.title);
  const card=page.locator('.game-card').filter({has:page.locator(`[data-details="${game.id}"]`)}).first();
  assert(await card.isVisible());
  assert.equal(await card.locator('a[target="_blank"]').count(),0);
  await card.locator('.game-art').click();
  assert.equal(await page.locator('#dialog-title').textContent(),game.title);
  assert.equal(await page.locator('#details a[target="_blank"]').count(),0);
  assert((await page.locator('#dialog-content').textContent()).includes('Sandbox'));
  await page.keyboard.press('Escape');
 }
 await page.locator('#search').fill('');
 for(const category of ['strategy','racing','platformers','puzzle','fighting','rpg','simulation']){
  await page.locator(`[data-category="${category}"]`).click();
  assert.equal(await page.locator('.game-card').count(),games.filter(g=>g.category===category).length);
 }
 await page.locator('[data-category="all"]').click();
 await page.locator(`[data-favourite="${dos[0].id}"]`).first().click();
 await page.reload();await page.locator('.game-card').first().waitFor();
 await page.locator('[data-view="favourites"]').click();assert.equal(await page.locator('.game-card').count(),1);
 await page.locator('[data-view="discover"]').click();
 for(const game of games){assert(game.art,`Artwork required: ${game.title}`);const response=await page.request.get(new URL(game.art,page.url()).href);assert(response.ok(),`Image response: ${game.title}`);}
 await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode().catch(()=>{});}));});
 assert(await page.locator('.game-art img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
 await page.locator('[data-hero-index="4"]').click();
 await page.screenshot({path:'artifacts/qa/catalogue-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'artifacts/qa/catalogue-mobile.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
 const slider=await page.locator('#hero-slider').boundingBox(), content=await page.locator('.hero-content').boundingBox();
 assert(slider.y>=content.y+content.height-2,'Hero carousel does not overlap hero copy on mobile');
 await page.locator('#hero-next').click();assert.equal(await page.locator('#spotlight-name').textContent(),featured[5].title);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#hero-next').click();
 assert.equal(await page.locator('#hero-image').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.equal(errors.length,0,errors.join('\n'));
 const report={passed:true,games:games.length,dosListings:dos.length,heroSlides:featured.length,allCoversLoaded:true,checks:['current-slide CTA','carousel next/previous/wrap/dots','pending DOS cards have no external play link','all genres','favourites persistence','desktop/mobile layout','mobile hero no overlap','reduced motion'],errors};
 await writeFile('artifacts/qa/catalogue-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
