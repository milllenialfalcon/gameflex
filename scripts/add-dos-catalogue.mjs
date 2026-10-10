import {readFile,writeFile,access} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const selection=await read('docs/dos-zone-selection.json');
const artwork=await read('docs/dos-zone-artwork.json');
const games=await read('dist/games.json');
const audit=await read('docs/link-audit.json');
const rejected=new Set(['rollercoaster-tycoon-deluxe','command-conquer-sep-26-1995']);
const entries=selection.entries.filter(g=>!rejected.has(g.id));
const copy={
 'doom-dec-1993':['DOOM','The original demon-filled corridors and shotgun blasts.','shooters'],
 'doom-ii-oct-10-1994':['DOOM II','Back to Earth, with a super shotgun.','shooters'],
 'wolfenstein-3d-may-05-1992':['Wolfenstein 3D','Find the secrets. Escape the castle.','shooters'],
 'duke-nukem-3d-1996':['Duke Nukem 3D','Explosive firefights across a very strange Los Angeles.','shooters'],
 'prince-of-persia-1990':['Prince of Persia','Precise jumps, sword fights, and one ticking clock.','platformers'],
 'civilization':['Civilization','Build a civilisation, one turn at a time.','strategy'],
 'warcraft-orcs-humans':['Warcraft: Orcs & Humans','Build your base and command the original Warcraft armies.','strategy'],
 'settlers2':['The Settlers II','Roads, resources, and a settlement worth watching.','strategy'],
 'sim-city-1989':['SimCity','Plan the streets. Balance the budget. Watch the city grow.','simulation'],
 'lemmings-1991':['Lemmings','A tiny crowd, a dangerous route, and a limited set of tools.','puzzle'],
 'jazz-jackrabbit':['Jazz Jackrabbit','Fast platforming with a green rabbit and a big blaster.','platformers'],
 'commander-keen4':['Commander Keen 4','Pogo through alien worlds in Secret of the Oracle.','platformers'],
 'descent':['Descent','Six degrees of freedom deep inside hostile mines.','shooters'],
 'fallout':['Fallout','Explore the wasteland in the original turn-based RPG.','rpg'],
 'heroes-of-might-and-magic-ii':['Heroes of Might and Magic II','Gather an army. Explore the map. Take one more turn.','strategy'],
 'worms-1995':['Worms','Tiny teams, destructible terrain, and very large explosions.','strategy'],
 'the-need-for-speed-sep-1995':['The Need for Speed','The original road racer, before the series became a household name.','racing'],
 'mortal-kombat-1993':['Mortal Kombat','The original tournament, brought to DOS.','fighting'],
 'street-fighter-2':['Street Fighter II','Classic arcade matchups in the DOS release.','fighting'],
 'dune-2-dos-1992':['Dune II','Command a house and fight for control of Arrakis.','strategy'],
 'theme-hospital':['Theme Hospital','Build a hospital for some very unusual patients.','simulation'],
};
const sources=Array.isArray(artwork)?artwork:artwork.entries||artwork.artwork||artwork.assets;
const receipts=[];
for(const g of entries){
 const asset=Array.isArray(sources)?sources.find(a=>a.id===g.id):sources?.[g.id];
 const art=typeof asset==='string'?asset:asset?.localAssetPath||asset?.path||asset?.localPath||asset?.art||asset?.file;
 if(!art)throw Error(`Missing artwork receipt for ${g.id}`);
 const local=art.replaceAll('\\','/').replace(/^dist\//,'');await access('dist/'+local);
 const [title,description,category]=copy[g.id];
 const id='dos-'+g.id;
 const featured=['doom-dec-1993','prince-of-persia-1990','civilization','the-need-for-speed-sep-1995','fallout','theme-hospital'].includes(g.id);
 const entry={id,title,url:g.url,genre:g.genre,category,provider:'dos-zone',art:local,...(g.id==='lemmings-1991'?{artFit:'contain'}:{}),featured,tag:'DOS CLASSIC',description,ownFiles:false,availability:'sandbox-pending',requirements:'Not playable in Gameflex yet. Sandbox integration is pending. '+g.requirements+' First launch downloads game data. Hosted edition, controls and saves have not been fully tested.',checkedAt:'2026-10-10',verificationLevel:'launch-page',tags:['DOS','DOS Zone',title]};
 const index=games.findIndex(v=>v.id===id);if(index<0)games.push(entry);else games[index]=entry;
 const a={title,url:g.url,finalUrl:g.url,status:200,browserGameEvidence:g.browserEvidence,prerequisites:entry.requirements,include:true,reason:'Mainstream original-title listing with a js-dos bundle reference. Listed as sandbox-pending, with no outbound play fallback. No complete gameplay verification is claimed.',checkedAt:'2026-10-10',framing:'blocked',verificationLevel:'launch-page'};
 const ai=audit.findIndex(v=>v.url===g.url);if(ai<0)audit.push(a);else audit[ai]=a;
 receipts.push({id,url:g.url});
}
await writeFile('dist/games.json',JSON.stringify(games,null,2)+'\n');
await writeFile('docs/link-audit.json',JSON.stringify(audit,null,2)+'\n');
await writeFile('docs/dos-zone-catalogue-approval.json',JSON.stringify({date:'2026-10-10',scope:'catalogue-listing-only',instruction:'Meanwhile, use games from https://dos.zone/ only the mainstream titles and not mods/forks and add them to gameflex catalog. Also find and put relevant thumbnails that some games are missing. And add more games in the hero slider after dos zone games are done.',verificationLimit:'Direct user instruction approves this disabled catalogue batch. It is not a user gameplay verification. Existing candidate review decisions remain untouched. A playable release still requires assistant and explicit user verification.',entries:receipts,excluded:[{id:'rollercoaster-tycoon-deluxe',reason:'Expansion compilation rather than a base release.'},{id:'command-conquer-sep-26-1995',reason:'GDI-only build with videos removed; omitted under original-release preference.'},...selection.excludedCandidates]},null,2)+'\n');
console.log(`${entries.length} DOS Zone listings added; ${games.length} total. All new listings sandbox-pending.`);
