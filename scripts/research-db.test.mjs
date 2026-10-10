import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const directory=path.resolve('artifacts/research-db-test');await mkdir(directory,{recursive:true});
const source=path.join(directory,'candidates.json');await writeFile(source,'[]\n');
const before=createHash('sha256').update(await readFile('dist/games.json')).digest('hex');
const live=JSON.parse(await readFile('dist/games.json','utf8'));
const base={genre:'Puzzle',description:'Test candidate',browserEvidence:'Test evidence',sourceUrls:['https://example.com/source'],researchedAt:'2026-10-10',ownFiles:null,requirements:'Unknown',issues:[],researchMethod:'Fixture'};
const fixture=path.join(directory,'discoveries.json');
await writeFile(fixture,JSON.stringify([
 {...base,id:'fixture-one',title:'=Formula-like title',playUrl:'https://example.com/play?utm_source=test',assistantReview:{status:'verified'},userReview:{status:'verified'}},
 {...base,id:'fixture-two',title:'Second fixture',playUrl:'https://example.com/other'},
 {...base,id:'fixture-duplicate',title:'Duplicate',playUrl:'https://example.com/play/'},
 {...base,id:'fixture-live',title:'Already live',playUrl:live[0].url},
]));
function run(...args){const r=spawnSync(process.execPath,['scripts/research-db.mjs',...args],{env:{...process.env,GAMEFLEX_RESEARCH_DIR:directory},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
const read=async()=>JSON.parse(await readFile(source,'utf8'));
run('import',fixture);let games=await read();assert.equal(games.length,2);assert(games.every(g=>g.assistantReview.status==='pending'&&g.userReview.status==='pending'));
assert.equal(JSON.parse(run('ready')).length,0);
run('review','fixture-one','assistant','verified','Fixture launch inspected','https://example.com/play');assert.equal(JSON.parse(run('ready')).length,0);
run('review','fixture-one','user','verified','Explicit fixture human confirmation','Fixture user instruction');assert.equal(JSON.parse(run('ready')).length,1);
run('import',fixture);games=await read();const reviewed=games.find(g=>g.id==='fixture-one');assert.equal(reviewed.userReview.status,'verified');assert.equal(reviewed.reviewEvents.length,2);assert.equal(games.length,2);
assert((await readFile(path.join(directory,'candidates.csv'),'utf8')).includes("'=Formula-like title"),'CSV formula-shaped text is neutralised');
run('review','fixture-one','assistant','rejected','Runtime failed on recheck','https://example.com/play');assert.equal(JSON.parse(run('ready')).length,0);
const after=createHash('sha256').update(await readFile('dist/games.json')).digest('hex');assert.equal(before,after,'Research/review operations never change live games');
console.log('Research DB checks passed: fresh reviews pending, duplicates/live URLs skipped, two-review gate, decisions retained on reimport, rejection removes eligibility, CSV formula protection, catalogue unchanged.');
