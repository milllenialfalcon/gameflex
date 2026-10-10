import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist/assets', {recursive:true});
const games = {halo:976730,bo1:42700,quake:2310,quake2:2320,quake3:2200,rtcw:9010,cs:10};
await Promise.all(Object.entries(games).map(async([name,id])=>{
  try { const url=`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`; const r=await fetch(url); if(!r.ok) throw Error(r.status); await writeFile(`dist/assets/${name}.jpg`,Buffer.from(await r.arrayBuffer())); console.log(`${name}: artwork saved`); } catch(e){console.log(`${name}: ${e.message}`);}
}));
try {
  const r=await fetch('https://store.steampowered.com/api/appdetails?appids=976730'); const j=await r.json(); const shots=j['976730']?.data?.screenshots||[];
  // The collection's first screenshots feature Halo: Combat Evolved.
  const shot=shots[0]; if(shot){const img=await fetch(shot.path_full);if(img.ok){await writeFile('dist/assets/halo-hero.jpg',Buffer.from(await img.arrayBuffer()));await writeFile('docs/artwork.json',JSON.stringify({source:'Steam store publisher artwork',hero:shot.path_full,covers:games},null,2));console.log('hero saved');}}
}catch(e){console.log(`hero: ${e.message}`);}
for (const [name,font] of [['pixel','pixelifysans/PixelifySans%5Bwght%5D.ttf'],['body','spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf']]){
  const r=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${font}`);if(!r.ok)throw Error(`Font fetch failed: ${r.status}`);
  await writeFile(`dist/assets/${name}.ttf`,Buffer.from(await r.arrayBuffer()));
  const licence=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${font.split('/')[0]}/OFL.txt`);
  await writeFile(`dist/assets/${name}-license.txt`,await licence.text());
  console.log(`${name} font saved`);
}
