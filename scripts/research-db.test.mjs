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
// The release check also rejects a new catalogue URL unless both reviewers cleared it.
const releaseFixture=path.join(directory,'catalogue-check');
for(const folder of ['dist','docs','research']) await mkdir(path.join(releaseFixture,folder),{recursive:true});
const newGame={id:'new-game',title:'New game',url:'https://example.com/play',genre:'Puzzle',category:'strategy',description:'Fixture',requirements:'Browser',checkedAt:'2026-10-10'};
await writeFile(path.join(releaseFixture,'dist/games.json'),JSON.stringify([newGame]));
await writeFile(path.join(releaseFixture,'docs/link-audit.json'),JSON.stringify([{url:newGame.url,include:true}]));
await writeFile(path.join(releaseFixture,'research/catalogue-baseline.json'),'[]');
const releaseCandidate={playUrl:newGame.url,assistantReview:{status:'verified'},userReview:{status:'pending'}};
const checkRelease=()=>spawnSync(process.execPath,[path.resolve('scripts/check-catalog.mjs')],{cwd:releaseFixture,encoding:'utf8'});
await writeFile(path.join(releaseFixture,'research/candidates.json'),JSON.stringify([releaseCandidate]));
assert.notEqual(checkRelease().status,0,'Release check rejects missing user verification');
releaseCandidate.userReview.status='verified';
await writeFile(path.join(releaseFixture,'research/candidates.json'),JSON.stringify([releaseCandidate]));
assert.equal(checkRelease().status,0,'Release check accepts both reviews');
const after=createHash('sha256').update(await readFile('dist/games.json')).digest('hex');assert.equal(before,after,'Research/review operations never change live games');
console.log('Research DB checks passed: fresh reviews pending, duplicates/live URLs skipped, two-review gate, decisions retained on reimport, rejection removes eligibility, CSV formula protection, new catalogue additions require both reviews, live catalogue unchanged.');
