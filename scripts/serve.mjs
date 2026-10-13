/**
 * gameflex local preview server.
 *
 *   node scripts/serve.mjs                      # serve dist/ on http://127.0.0.1:4173
 *   node scripts/serve.mjs --test-roms          # dev only: add the local test-ROM shelf
 *   node scripts/serve.mjs --port 4300
 *   node scripts/serve.mjs --tls-cert c.pem --tls-key k.pem   # used by scripts/emulator-qa.mjs
 *
 * The test shelf is a development tool. It is off unless --test-roms is passed, it binds the
 * loopback interface only, and it never writes to dist/: the extra listings exist in the two
 * JSON responses this process builds from files on this machine.
 *
 * It scans, in this order:
 *   D:\AI\Gameflex\test-roms\<system>\                  (override the root with GAMEFLEX_TEST_ROMS)
 *   <this checkout>\artifacts\roms\<system>\            (the git-ignored research downloads)
 *
 * A file whose extension the matching core does not accept is skipped and named in the startup
 * banner, so a stray .txt in a folder can never reach the emulator.
 */
import http from 'node:http';
import https from 'node:https';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve('dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.data': 'application/octet-stream' };

/** Folder in test-roms/, the EmulatorJS system id, its vendored core, and that core's extensions. */
const SYSTEMS = {
  nes: { system: 'nes', core: 'fceumm', extensions: ['nes', 'fds', 'unf', 'unif'] },
  snes: { system: 'snes', core: 'snes9x', extensions: ['sfc', 'smc', 'swc', 'fig', 'bs', 'st'] },
  gb: { system: 'gb', core: 'gambatte', extensions: ['gb', 'gbc', 'dmg'] },
  gbc: { system: 'gbc', core: 'gambatte', extensions: ['gb', 'gbc', 'dmg'] },
  gba: { system: 'gba', core: 'mgba', extensions: ['gba', 'gb', 'gbc'] },
  segaMD: { system: 'segaMD', core: 'genesis_plus_gx', extensions: ['bin', 'md', 'gen', 'smd', '68k', 'sgd', 'm3u', 'mdx'] },
  segaMS: { system: 'segaMS', core: 'genesis_plus_gx', extensions: ['sms', 'bin', 'sg'] },
  segaGG: { system: 'segaGG', core: 'genesis_plus_gx', extensions: ['gg', 'bin'] },
  sega32x: { system: 'sega32x', core: 'picodrive', extensions: ['32x', 'bin', 'gen', 'smd', 'md', '68k'] },
  psx: { system: 'psx', core: 'pcsx_rearmed', extensions: ['chd', 'pbp', 'bin', 'img'] },
  n64: { system: 'n64', core: 'mupen64plus_next', extensions: ['n64', 'v64', 'z64', 'bin', 'u1', 'ndd'] },
  nds: { system: 'nds', core: 'desmume2015', extensions: ['nds', 'bin'] },
  pce: { system: 'pce', core: 'mednafen_pce', extensions: ['pce', 'cue', 'ccd', 'iso', 'img', 'bin', 'chd'] },
  atari2600: { system: 'atari2600', core: 'stella2014', extensions: ['a26', 'bin', 'zip'] },
  atari7800: { system: 'atari7800', core: 'prosystem', extensions: ['a78', 'bin'] },
  arcade: { system: 'arcade', core: 'fbneo', extensions: ['zip', '7z'] },
};

/** The port actually bound; set when the listener comes up, so --port 0 works. */
let activePort = 0;
const SHELF_PREFIX = '__test-roms/';
const PLACEHOLDER_ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 215" role="img" aria-label="Local test ROM"><rect width="460" height="215" fill="#37452b"/><text x="24" y="104" fill="#c4fa53" font-family="monospace" font-size="26" font-weight="bold">LOCAL TEST ROM</text><text x="24" y="146" fill="#f4f4eb" font-family="monospace" font-size="16">never published</text></svg>';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};
const port = Number(value('--port', process.env.PORT || 4173));
const testRoms = argv.includes('--test-roms');
const certFile = value('--tls-cert', '');
const keyFile = value('--tls-key', '');
const certificate = certFile && keyFile ? { cert: await readFile(certFile), key: await readFile(keyFile) } : null;

/* -------------------------------------------------------------- test ROM shelf */

const shelfRoots = () => [
  process.env.GAMEFLEX_TEST_ROMS || 'D:\\AI\\Gameflex\\test-roms',
  path.resolve('artifacts', 'roms'),
];

const hashCache = new Map();
async function sha256(file, info) {
  const key = `${info.size}:${info.mtimeMs}`;
  const cached = hashCache.get(file);
  if (cached?.key === key) return cached.value;
  const value = createHash('sha256').update(await readFile(file)).digest('hex');
  hashCache.set(file, { key, value });
  return value;
}

const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'rom';

/** Rescans both roots on every config request, so a dropped file appears on the next refresh. */
async function shelfEntries() {
  const entries = {};
  const skipped = [];
  for (const [folder, mapping] of Object.entries(SYSTEMS)) {
    for (const base of shelfRoots()) {
      const names = await readdir(path.join(base, folder)).catch(() => []);
      for (const name of names) {
        const file = path.join(base, folder, name);
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) continue;
        const extension = (/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase() || '';
        if (!mapping.extensions.includes(extension)) { skipped.push(`${folder}/${name}`); continue; }
        const id = `test-${folder}-${slug(name.replace(/\.[a-z0-9]+$/i, ''))}`.slice(0, 64);
        const title = `${name.replace(/\.[a-z0-9]+$/i, '')} · ${mapping.system} test`;
        entries[id] = {
          id,
          title,
          rom: `${SHELF_PREFIX}${folder}/${name}`,
          file,
          listing: {
            id,
            title,
            url: `http://127.0.0.1:${activePort || port}/#play/${id}`,
            genre: 'Local test ROM',
            category: 'test-roms',
            tag: 'LOCAL ONLY',
            art: `${SHELF_PREFIX}placeholder.svg`,
            color: '#37452b',
            symbol: '+',
            platform: mapping.system,
            description: `Local test file from ${path.basename(path.dirname(base))}/${folder}. This listing exists only while the dev server runs with --test-roms.`,
            requirements: 'Dev shelf only. Drop the file in test-roms with the dev server running, then refresh.',
            tags: ['test-roms', mapping.system, mapping.core],
            checkedAt: new Date().toISOString().slice(0, 10),
          },
          player: {
            mode: 'emulator',
            system: mapping.system,
            core: mapping.core,
            rom: `${SHELF_PREFIX}${folder}/${name}`,
            sha256: await sha256(file, info),
            licence: 'Local test file — not published',
            title,
          },
        };
      }
    }
  }
  return { entries, skipped };
}

/* --------------------------------------------------------------------- server */

async function respond(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const shelf = testRoms ? await shelfEntries() : { entries: {}, skipped: [] };

  if (testRoms && pathname === `${SHELF_PREFIX}placeholder.svg`) {
    response.writeHead(200, { 'Content-Type': mime['.svg'], 'Cache-Control': 'no-cache' });
    response.end(PLACEHOLDER_ART);
    return;
  }
  if (testRoms && pathname.startsWith(`/${SHELF_PREFIX}`)) {
    const match = Object.values(shelf.entries).find(entry => entry.rom === pathname.slice(1));
    if (!match) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(await readFile(match.file));
    return;
  }
  if (testRoms && pathname === '/player-config.json') {
    const config = JSON.parse(await readFile(path.join(root, 'player-config.json'), 'utf8'));
    for (const entry of Object.values(shelf.entries)) config.games[entry.id] = entry.player;
    response.writeHead(200, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-cache' });
    response.end(JSON.stringify(config, null, 2));
    return;
  }
  if (testRoms && pathname === '/games.json') {
    const games = JSON.parse(await readFile(path.join(root, 'games.json'), 'utf8'));
    const known = new Set(games.map(game => game.id));
    for (const entry of Object.values(shelf.entries)) if (!known.has(entry.id)) games.push(entry.listing);
    response.writeHead(200, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-cache' });
    response.end(JSON.stringify(games, null, 2));
    return;
  }

  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  const data = await readFile(target);
  response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  response.end(data);
}

const server = (certificate ? https : http).createServer(certificate || {}, (request, response) => {
  respond(request, response).catch(() => { response.writeHead(404); response.end('Not found'); });
});

server.listen(port, '127.0.0.1', async () => {
  // The banner reports the port actually bound, so --port 0 (let the OS choose) works.
  const bound = server.address().port;
  activePort = bound;
  console.log(`Local: ${certificate ? 'https' : 'http'}://127.0.0.1:${bound}${certificate ? ' (self-signed certificate)' : ''}`);
  if (!testRoms) return;
  const { entries, skipped } = await shelfEntries();
  const list = Object.values(entries);
  console.log(`Test ROM shelf: ${list.length} file${list.length === 1 ? '' : 's'} from ${shelfRoots().join(' and ')}`);
  for (const entry of list) console.log(`  ${entry.id}  ${entry.player.core}  ${entry.file}`);
  if (skipped.length) console.log(`Skipped (extension the mapped core does not accept): ${skipped.join(', ')}`);
});
