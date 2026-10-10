import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const games=JSON.parse(await readFile('dist/games.json','utf8'));
const audit=JSON.parse(await readFile('docs/link-audit.json','utf8'));
const entries=Array.isArray(audit)?audit:audit.entries||audit.games||audit.results;
assert(games.length>0,'Catalogue must contain verified games');
assert.equal(new Set(games.map(g=>g.id)).size,games.length,'Unique game IDs');
for(const g of games){assert(g.title&&g.description&&g.genre&&g.category&&g.requirements&&g.checkedAt);assert.equal(new URL(g.url).protocol,'https:');assert(entries.some(a=>a.include===true && [a.url,a.finalUrl,a.originalUrl].some(u=>u?.replace(/\/$/,'').replace(/\/Fan$/,'/pc-games')===g.url.replace(/\/$/,'').replace(/\/Fan$/,'/pc-games'))),`${g.title} requires audit evidence`);if(g.art)await access('dist/'+g.art);}
console.log(`${games.length} games: unique IDs, HTTPS URLs, requirements, audit evidence, artwork files verified.`);
