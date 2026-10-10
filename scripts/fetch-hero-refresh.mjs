// Restore reviewed image bytes without reviving rejected editions or changing receipts.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const receipt=JSON.parse(await readFile(path.join(root,'docs/hero-artwork-refresh.json'),'utf8'));
const games=JSON.parse(await readFile(path.join(root,'dist/games.json'),'utf8'));
const active=new Set(games.flatMap(g=>[g.art,g.heroArt]).filter(Boolean));
let count=0;
for(const entry of receipt.targets){
  if(!entry.local||!active.has(entry.local)||!entry.sourceUrl||!entry.sha256)continue;
  const target=path.resolve(root,'dist',entry.local);
  if(!target.startsWith(path.join(root,'dist','assets')+path.sep))throw Error('Invalid artwork path');
  const response=await fetch(entry.sourceUrl);
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error(`Image fetch failed: ${entry.id}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error(`Source changed; review required: ${entry.id}`);
  await writeFile(target,bytes);count++;
}
console.log(`Restored ${count} reviewed images; receipts and rejected assets unchanged.`);
