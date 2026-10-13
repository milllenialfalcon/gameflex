import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const games=JSON.parse(await readFile('dist/games.json','utf8'));
const audit=JSON.parse(await readFile('docs/link-audit.json','utf8'));
const entries=Array.isArray(audit)?audit:audit.entries||audit.games||audit.results;
const baseline=JSON.parse(await readFile('research/catalogue-baseline.json','utf8'));
const candidates=JSON.parse(await readFile('research/candidates.json','utf8'));
const playerConfig=JSON.parse(await readFile('dist/player-config.json','utf8'));
const lock=JSON.parse(await readFile('emulator/emulatorjs-lock.json','utf8'));
let dosApproval={entries:[]};
try { dosApproval=JSON.parse(await readFile('docs/dos-zone-catalogue-approval.json','utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; }
const canonical=value=>{const url=new URL(value);url.hash='';return url.href.replace(/\/$/,'');};
// One vendored core per system, read from the lock file rather than a second list that could drift.
const vendoredCores=new Map(lock.packages.filter(p=>p.kind==='core'&&p.core).map(p=>[p.core,p]));
// The extensions each core accepts, measured from the core.json inside the vendored -wasm.data
// (scripts/emulator-qa.mjs, docs/emulator-verification.md). Used to reject a ROM the core cannot mount.
const coreExtensions={
  nes:['nes','fds','unf','unif'], snes:['smc','sfc','swc','fig','bs','st'], gb:['gb','gbc','dmg'], gbc:['gb','gbc','dmg'],
  gba:['gb','gbc','gba'], segaMD:['bin','md','gen','smd','68k','sgd','m3u','mdx'], segaMS:['sms','bin','sg'], segaGG:['gg','bin'],
  sega32x:['32x','bin','gen','smd','md','68k'], psx:['chd','pbp','bin','img'],
  n64:['n64','v64','z64','bin','u1','ndd'], nds:['nds','bin'], pce:['pce','cue','ccd','iso','img','bin','chd'],
  atari2600:['a26','bin','zip'], atari7800:['a78','bin'], arcade:['zip','7z'],
};
const sha256=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
assert(games.length>0,'Catalogue must contain verified games');
assert.equal(new Set(games.map(g=>g.id)).size,games.length,'Unique game IDs');
assert.equal(playerConfig.version,2,'Player config version');
const emulatorListings=game=>playerConfig.games?.[game.id]?.mode==='emulator';
for(const g of games){
  assert(g.title&&g.description&&g.genre&&g.category&&g.requirements&&g.checkedAt,`${g.id}: title, description, genre, category, requirements and checkedAt are required`);
  assert(g.description.length<=240,`${g.title}: description stays short enough for a card`);
  if(g.art)await access('dist/'+g.art);
  // Emulator listings carry no external page: the ROM, its hash and the vendored core are the evidence.
  if(emulatorListings(g)){
    const entry=playerConfig.games[g.id];
    assert.equal(g.url,`https://gameflex.lol/#play/${g.id}`,`${g.id}: an emulator listing points at the internal player route, not an external host`);
    for(const field of ['system','core','rom','sha256','licence'])assert(typeof entry[field]==='string'&&entry[field],`${g.id}: player-config is missing ${field}`);
    const core=vendoredCores.get(entry.core);
    assert(core,`${g.id}: core ${entry.core} is not vendored in emulator/emulatorjs-lock.json`);
    assert(core.systems.includes(entry.system),`${g.id}: core ${entry.core} does not declare system ${entry.system} (declares ${core.systems.join(', ')})`);
    assert(/^[0-9a-f]{64}$/.test(entry.sha256),`${g.id}: sha256 must be 64 lowercase hex characters`);
    const segments=entry.rom.split('/');
    assert(segments.length>=2&&segments[segments.length-1].includes('.')&&segments.every(part=>/^[A-Za-z0-9._-]+$/.test(part)&&part!=='..'),`${g.id}: rom must be a plain relative path inside dist/`);
    const romFile='dist/'+entry.rom;
    await access(romFile);
    assert.equal(await sha256(romFile),entry.sha256,`${g.id}: the ROM on disk does not match its recorded sha256`);
    const extension=(/\.([a-z0-9]+)$/.exec(entry.rom)||[])[1];
    assert((coreExtensions[entry.system]||[]).includes(extension),`${g.id}: a .${extension} file is not an extension the ${entry.core} core accepts`);
    await access(`dist/emulator/ejs/${lock.version}/cores/${entry.core}-wasm.data`);
    await access(`dist/emulator/ejs/${lock.version}/cores/reports/${entry.core}.json`);
    continue;
  }
  assert.equal(new URL(g.url).protocol,'https:');
  assert(entries.some(a=>a.include===true && [a.url,a.finalUrl,a.originalUrl].some(u=>u?.replace(/\/$/,'').replace(/\/Fan$/,'/pc-games')===g.url.replace(/\/$/,'').replace(/\/Fan$/,'/pc-games'))),`${g.title} requires audit evidence`);
  const existing=baseline.some(b=>b.id===g.id&&canonical(b.url)===canonical(g.url));
  const disabledDosListing=g.availability==='sandbox-pending'&&g.provider==='dos-zone'&&new URL(g.url).hostname==='dos.zone'&&dosApproval.scope==='catalogue-listing-only'&&dosApproval.entries.some(a=>a.id===g.id&&canonical(a.url)===canonical(g.url));
  if(!existing&&!disabledDosListing) assert(candidates.some(c=>canonical(c.playUrl)===canonical(g.url)&&c.assistantReview.status==='verified'&&c.userReview.status==='verified'),`${g.title}: new playable catalogue additions require assistant and explicit user verification in the research database`);
}
const emulators=games.filter(emulatorListings).length;
console.log(`${games.length} games: unique IDs, HTTPS URLs, requirements, audit evidence, artwork files verified.`);
console.log(`${emulators} emulator listings: ROM present, sha256 matched, core vendored, licence recorded, system/core pair valid.`);
