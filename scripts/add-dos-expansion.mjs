import {readFile,writeFile,access} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(p,'utf8'));

const research=await read('research/dos-top-expansion.json');
const artwork=await read('research/dos-expansion-artwork.json');
const games=await read('dist/games.json');
const audit=await read('docs/link-audit.json');
const ledger=await read('docs/dos-zone-catalogue-approval.json');

const EXCLUDED_ID='dos-command-and-conquer';
const CHECKED_AT='2026-10-10';
const REQUIREMENTS='Not playable in Gameflex yet. Sandbox integration is pending. Desktop browser with keyboard and mouse. Controls, saves and hosted edition unverified.';

// id -> [title, genre, category, description]
const copy={
 'dos-warcraft-ii':['WarCraft II: Tides of Darkness','Real-time strategy','strategy','Build a base, train an army, and out-fight the Horde.'],
 'dos-age-of-empires':['Age of Empires','Real-time strategy','strategy','Take a tribe from sticks and stones to a walled empire.'],
 'dos-master-of-orion-ii':['Master of Orion II: Battle at Antares','Turn-based strategy','strategy','Design your fleet, colonise the stars, and win Antares.'],
 'dos-sim-city-2000':['Sim City 2000','City-building simulation','simulation','Zone, tax, and power a city that never stops growing.'],
 'dos-prince-of-persia-2':['Prince of Persia 2: The Shadow & The Flame','Cinematic platformer','adventure','Sharper jumps, deadlier traps, and a flame that wants your crown.'],
 'dos-tomb-raider':['Tomb Raider','Action-adventure','adventure','Raiders, ruins, and Lara Croft in her first outing.'],
 'dos-resident-evil':['Resident Evil','Survival horror','adventure','A mansion, scarce ammo, and something waiting in the hallway.'],
 'dos-dungeon-keeper':['Dungeon Keeper','Real-time strategy / management','strategy','Dig a dungeon, hire the monsters, and keep the heroes out.'],
 'dos-secret-of-monkey-island':['The Secret of Monkey Island','Point-and-click adventure','adventure','Guybrush, insults, and the secret everyone keeps dodging.'],
 'dos-beneath-a-steel-sky':['Beneath a Steel Sky','Point-and-click adventure','adventure','A grim city, a talking visor, and a mystery to unfurl.'],
 'dos-blood':['BLOOD','First-person shooter','shooters','A shotgun, a cult, and a lot of very red corridors.'],
 'dos-heretic':['Heretic: Shadow of the Serpent Riders','First-person shooter','shooters','Dark fantasy, magic wands, and the Doom engine at war.'],
 'dos-road-rash':['Road Rash','Racing','racing','Race, brawl, and win on a very lawless highway.'],
 'dos-dark-forces':['Star Wars: Dark Forces','First-person shooter','shooters','Kyle Katarn storms the Empire in the original Star Wars FPS.'],
 'dos-battle-chess':['Battle Chess','Chess / strategy','strategy','Chess, but every capture is a full animation.'],
 'dos-rayman':['Rayman','Platformer','platformers','Rescue your friends, one bright world at a time.'],
 'dos-the-lost-vikings':['The Lost Vikings','Puzzle platformer','puzzle','Three Vikings, one brain, and a lot of switch puzzles.'],
};

const artById=new Map(artwork.entries.map(e=>[e.id,e]));
const records=research.filter(r=>r.id!==EXCLUDED_ID);
if(records.length!==17)throw Error(`Expected 17 records after excluding ${EXCLUDED_ID}, found ${records.length}`);

const newEntries=[];
const newAudit=[];
const ledgerEntries=[];

for(const r of records){
 const c=copy[r.id];
 if(!c)throw Error(`Missing copy for ${r.id}`);
 const [title,genre,category,description]=c;
 const a=artById.get(r.id);
 if(!a)throw Error(`Missing artwork receipt for ${r.id}`);
 if(a.status!=='downloaded')throw Error(`Artwork for ${r.id} is ${a.status}`);
 const art=a.localAsset.replaceAll('\\','/').replace(/^dist\//,'');
 await access('dist/'+art);

 const entry={id:r.id,title,url:r.playUrl,genre,category,provider:'dos-zone',art,featured:false,tag:'DOS CLASSIC',description,ownFiles:false,availability:'sandbox-pending',requirements:REQUIREMENTS,checkedAt:CHECKED_AT,verificationLevel:'launch-page',tags:['DOS','DOS Zone',title]};
 if(games.some(g=>g.id===r.id))throw Error(`Game ${r.id} already present; refusing to overwrite`);
 games.push(entry);
 newEntries.push(entry);

 const evidence=`Direct HTTPS GET of ${r.playUrl} recorded HTTP ${r.httpEvidence.status} and the js-dos launch markup for bundle ${r.jsDosBundle}. Launch-page markup only - the emulator was never booted and no gameplay was observed. The host sends CSP frame-ancestors limited to dos.zone and its own CDN, so this page cannot be framed from the Gameflex origin.`;
 const ae={title,url:r.playUrl,finalUrl:r.playUrl,status:200,browserGameEvidence:evidence,prerequisites:REQUIREMENTS,include:true,reason:'Mainstream original-title DOS Zone listing with a js-dos launch page, approved as a disabled catalogue listing only. No gameplay was observed and CSP frame-ancestors blocks framing from Gameflex. No complete gameplay verification is claimed.',checkedAt:CHECKED_AT,framing:'blocked',verificationLevel:'launch-page'};
 if(audit.some(x=>x.url===r.playUrl))throw Error(`Audit entry already exists for ${r.playUrl}`);
 audit.push(ae);
 newAudit.push(ae);

 ledgerEntries.push({id:r.id,url:r.playUrl});
}

// Approval ledger: retain the existing 21 entries, append the 17 new ones, and record the
// separate human approval event with its exact answer and id/url scope.
const retained=ledger.entries.length;
ledger.entries=[...ledger.entries,...ledgerEntries];
const approvalEvents=[...(ledger.approvalEvents||[]),{
 date:CHECKED_AT,
 answer:'Add disabled listings',
 scope:'catalogue-listing-only',
 instruction:'Human explicitly approved adding the exact 17 disabled DOS Zone listings to the catalogue. This overrides research-only publication for disabled catalogue listings only, not for playable reviews.',
 ids:ledgerEntries.map(e=>e.id),
 urls:ledgerEntries.map(e=>e.url),
 verificationLimit:'Approval covers disabled catalogue listings only. It is not a playable review and not a user gameplay verification. A playable release still requires separate assistant and explicit user verification.',
}];
ledger.approvalEvents=approvalEvents;

await writeFile('dist/games.json',JSON.stringify(games,null,2)+'\n');
await writeFile('docs/link-audit.json',JSON.stringify(audit,null,2)+'\n');
await writeFile('docs/dos-zone-catalogue-approval.json',JSON.stringify(ledger,null,2)+'\n');

const featured=games.filter(g=>g.featured).length;
console.log(`added ${newEntries.length} DOS Zone listings`);
console.log(`games.json: ${games.length} total (was 37)`);
console.log(`link-audit.json: ${audit.length} entries (+${newAudit.length})`);
console.log(`approval ledger: ${ledger.entries.length} entries (retained ${retained}, added ${ledgerEntries.length}); ${approvalEvents.length} approval event(s)`);
console.log(`featured slides: ${featured}`);
