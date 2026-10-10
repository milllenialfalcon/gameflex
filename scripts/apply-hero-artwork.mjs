// Wires the verified hero/cover artwork from docs/hero-artwork-refresh.json into dist/games.json.
//
// Scope is an explicit allow-list. Anything not listed is left exactly as it is, so the
// three rejected records (dos-prince-of-persia-1990, dos-civilization,
// dos-the-need-for-speed-sep-1995) can never be wired in by this script, even if a future
// receipt revision reintroduces them as targets.
//
// Every applied path is checked against the receipt's own sha256 before the catalogue is
// touched. A byte mismatch, a missing file, a receipt entry that disagrees with the
// allow-list, or a change to any untouched field aborts the run and leaves games.json alone.
import {readFile, writeFile, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const CATALOGUE = 'dist/games.json';
const RECEIPT = 'docs/hero-artwork-refresh.json';

// id -> role. hero = set heroArt (wide crop). cover = set art and drop artFit so the card
// uses the default centre crop instead of letterboxing the new landscape frame.
const APPLY = {
  halo: 'hero',
  bo1: 'hero',
  quake3: 'hero',
  surf: 'hero',
  diablo: 'hero',
  'dos-doom-dec-1993': 'hero',
  'dos-fallout': 'hero',
  'dos-theme-hospital': 'hero',
  skate: 'cover',
  pes6: 'cover',
  simpsons: 'cover',
  'dos-lemmings-1991': 'cover',
};

// Receipt records that must never be referenced by heroArt/art. Guarded both ways: the
// mapping must stay untouched, and the receipt must still carry them as rejected.
const MUST_STAY_UNWIRED = {
  'dos-prince-of-persia-1990': 'assets/refresh-dos-prince-of-persia-1990-hero.jpg',
  'dos-civilization': 'assets/refresh-dos-civilization-hero.png',
  'dos-the-need-for-speed-sep-1995': 'assets/refresh-dos-the-need-for-speed-sep-1995-hero.png',
};

const read = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };

const catalogue = await read(CATALOGUE);
const receipt = await read(RECEIPT);
const catalogueBefore = clone(catalogue);
const receiptSha = await hash(RECEIPT);

if (!Array.isArray(catalogue)) fail('dist/games.json is not an array');
const targets = Array.isArray(receipt.targets) ? receipt.targets : fail('receipt has no targets array');
const byId = id => targets.find(t => t.id === id);

// --- validate the receipt against the allow-list before touching anything -------------
for (const [id, role] of Object.entries(APPLY)) {
  const target = byId(id) ?? fail(`receipt has no target record for ${id}`);
  const path = role === 'hero' ? target.heroArt : target.art;
  if (typeof path !== 'string' || !path) fail(`${id}: receipt has no ${role === 'hero' ? 'heroArt' : 'art'} path`);
  if (target.local !== path) fail(`${id}: receipt local (${target.local}) disagrees with ${role === 'hero' ? 'heroArt' : 'art'} (${path})`);
  if (!/^assets\/[\w.-]+$/.test(path)) fail(`${id}: unexpected asset path ${path}`);
  await access('dist/' + path).catch(() => fail(`${id}: ${path} is missing from dist/`));
  const actual = await hash('dist/' + path);
  if (actual !== target.sha256) fail(`${id}: ${path} hashes ${actual}, receipt records ${target.sha256}`);
  if (target.httpStatus !== 200) fail(`${id}: receipt recorded HTTP ${target.httpStatus}`);
}

const rejected = Array.isArray(receipt.rejected) ? receipt.rejected : [];
for (const [id, asset] of Object.entries(MUST_STAY_UNWIRED)) {
  const record = rejected.find(r => r.id === id) ?? fail(`${id}: expected a rejected record in the receipt`);
  if (record.unreferencedAsset !== asset) fail(`${id}: rejected record points at ${record.unreferencedAsset}, expected ${asset}`);
}

const skipped = targets.filter(t => !APPLY[t.id]).map(t => t.id);
if (skipped.length) fail(`receipt contains targets outside the allow-list: ${skipped.join(', ')}`);

// --- apply ---------------------------------------------------------------------------
const withHeroArt = (game, path) => {
  const rebuilt = {};
  for (const [key, value] of Object.entries(game)) {
    if (key === 'heroArt') continue;
    rebuilt[key] = value;
    if (key === 'art') rebuilt.heroArt = path; // keep heroArt next to art
  }
  if (!('heroArt' in rebuilt)) rebuilt.heroArt = path;
  return rebuilt;
};

const applied = [];
for (let index = 0; index < catalogue.length; index++) {
  const id = catalogue[index].id;
  const role = APPLY[id];
  if (!role) continue;
  const target = byId(id);
  if (role === 'hero') {
    const path = target.heroArt;
    const previous = catalogue[index].heroArt ?? null;
    catalogue[index] = withHeroArt(catalogue[index], path);
    applied.push({id, role, field: 'heroArt', previous, applied: path, width: target.width, height: target.height, sha256: target.sha256, sourceUrl: target.sourceUrl, status: target.status});
  } else {
    const path = target.art;
    const previous = catalogue[index].art ?? null;
    const hadArtFit = 'artFit' in catalogue[index];
    const next = clone(catalogue[index]);
    delete next.artFit;
    next.art = path;
    catalogue[index] = next;
    applied.push({id, role, field: 'art', previous, applied: path, removedFields: hadArtFit ? ['artFit'] : [], width: target.width, height: target.height, sha256: target.sha256, sourceUrl: target.sourceUrl, status: target.status});
  }
}

// --- post-conditions ------------------------------------------------------------------
const changed = new Set(applied.map(a => a.id));
for (let index = 0; index < catalogue.length; index++) {
  const after = catalogue[index];
  if (changed.has(after.id)) continue;
  if (JSON.stringify(after) !== JSON.stringify(catalogueBefore[index])) fail(`${after.id} changed but is not in the allow-list`);
}
if (catalogue.length !== catalogueBefore.length) fail(`entry count changed: ${catalogueBefore.length} -> ${catalogue.length}`);
for (const [id, asset] of Object.entries(MUST_STAY_UNWIRED)) {
  const entry = catalogue.find(g => g.id === id) ?? fail(`${id} disappeared from the catalogue`);
  if (entry.heroArt === asset || entry.art === asset) fail(`${id} now points at a rejected asset`);
  const before = catalogueBefore.find(g => g.id === id);
  if (JSON.stringify(entry) !== JSON.stringify(before)) fail(`${id} (rejected) must stay untouched`);
}
const countOf = key => catalogue.filter(g => g[key]).length;
if (countOf('featured') !== catalogueBefore.filter(g => g.featured).length) fail('featured count changed');
if (countOf('spotlight') !== catalogueBefore.filter(g => g.spotlight).length) fail('spotlight count changed');
const pendingBefore = catalogueBefore.filter(g => g.availability).length;
if (catalogue.filter(g => g.availability).length !== pendingBefore) fail('availability count changed');
if (catalogue.filter(g => g.artFit).length !== 0) fail('artFit still present after cover replacement');

await writeFile(CATALOGUE, JSON.stringify(catalogue, null, 2) + '\n');

// --- read back what actually landed ---------------------------------------------------
const written = await read(CATALOGUE);
for (const item of applied) {
  const entry = written.find(g => g.id === item.id) ?? fail(`${item.id} missing after write`);
  if (entry[item.field] !== item.applied) fail(`${item.id}.${item.field} did not persist as ${item.applied}`);
  if (item.role === 'cover' && 'artFit' in entry) fail(`${item.id}.artFit did not persist as removed`);
  await access('dist/' + entry[item.field]).catch(() => fail(`${item.id}: written pointer ${entry[item.field]} does not resolve on disk`));
}

console.log(JSON.stringify({
  catalogue: CATALOGUE,
  receipt: {path: RECEIPT, sha256: receiptSha, correctedAt: receipt.correctedAt},
  games: written.length,
  featured: written.filter(g => g.featured).length,
  spotlight: written.filter(g => g.spotlight).length,
  availability: written.filter(g => g.availability).length,
  applied,
}, null, 2));
