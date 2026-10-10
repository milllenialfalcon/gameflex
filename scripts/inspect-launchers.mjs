import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('artifacts/launchers',{recursive:true});
const urls={halo:'https://mitchellhynes.com/halo/halo.html',diablo:'https://johnimril.github.io/diablo_web/',webxash:'https://x8bitrain.github.io/webXash/assets/index-qQhwzMp6.js',simpsons:'https://shar-wasm.cjoseph.workers.dev/assets/index-zBlXHWNX.js',bo1:'https://vel.gg/bo1z/landing.js'};
for(const[name,url]of Object.entries(urls)){try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});const t=await r.text();await writeFile(`artifacts/launchers/${name}.txt`,t);console.log(name,r.status,t.length,t.match(/<title[^>]*>(.*?)<\/title>/)?.[1]||'');}catch(e){console.log(name,e.message);}}
const art={surf:'https://surfd.net/social/surfd-card-v2.png',vicecity:'https://joncodeofficial.github.io/gta-vice-city-wasm/cover.png',diablo:'https://johnimril.github.io/diablo_web/og-image.png',zombies:'https://vel.gg/bo1z/art/og-mapselect.png'};
for(const[name,url]of Object.entries(art)){try{const r=await fetch(url);if(r.ok){await writeFile(`dist/assets/${name}.png`,Buffer.from(await r.arrayBuffer()));console.log('art',name);}}catch{}}
