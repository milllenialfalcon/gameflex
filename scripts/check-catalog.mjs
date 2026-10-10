import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const games=JSON.parse(await readFile('dist/games.json','utf8'));
const audit=JSON.parse(await readFile('docs/link-audit.json','utf8'));
const entries=Array.isArray(audit)?audit:audit.entries||audit.games||audit.results;
const baseline=JSON.parse(await readFile('research/catalogue-baseline.json','utf8'));
const candidates=JSON.parse(await readFile('research/candidates.json','utf8'));
const canonical=value=>{const url=new URL(value);url.hash='';return url.href.replace(/\/$/,'');};
assert(games.length>0,'Catalogue must contain verified games');
assert.equal(new Set(games.map(g=>g.id)).size,games.length,'Unique game IDs');
for(const g of games){assert(g.title&&g.description&&g.genre&&g.category&&g.requirements&&g.checkedAt);assert.equal(new URL(g.url).protocol,'https:');assert(entries.some(a=>a.include===true && [a.url,a.finalUrl,a.originalUrl].some(u=>u?.replace(/\/$/,'').replace(/\/Fan$/,'/pc-games')===g.url.replace(/\/$/,'').replace(/\/Fan$/,'/pc-games'))),`${g.title} requires audit evidence`);if(g.art)await access('dist/'+g.art);
  const existing=baseline.some(b=>b.id===g.id&&canonical(b.url)===canonical(g.url));
  if(!existing) assert(candidates.some(c=>canonical(c.playUrl)===canonical(g.url)&&c.assistantReview.status==='verified'&&c.userReview.status==='verified'),`${g.title}: new catalogue additions require assistant and explicit user verification in the research database`);
}
console.log(`${games.length} games: unique IDs, HTTPS URLs, requirements, audit evidence, artwork files verified.`);
