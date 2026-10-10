import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = process.env.GAMEFLEX_RESEARCH_DIR || path.join(project, 'research');
await mkdir(directory, { recursive: true });
const sourcePath = path.join(directory, 'candidates.json');
const [command = 'build', ...args] = process.argv.slice(2);
const pending = () => ({ status: 'pending', reviewedAt: null, notes: '', evidence: '' });
const canonicalUrl = value => {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw Error('Only HTTP(S) candidate URLs allowed');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href.replace(/\/$/, '');
};
const cleanText = value => String(value ?? '').trim();
const ready = game => game.assistantReview.status === 'verified' && game.userReview.status === 'verified';
let candidates;
try { candidates = JSON.parse(await readFile(sourcePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; candidates = []; }
if (!Array.isArray(candidates)) throw Error('candidates.json must be an array');

if (command === 'import') {
  if (!args[0]) throw Error('Usage: node scripts/research-db.mjs import research/discoveries.json');
  const incoming = JSON.parse(await readFile(path.resolve(args[0]), 'utf8'));
  if (!Array.isArray(incoming)) throw Error('Discovery input must be an array');
  const live = JSON.parse(await readFile(path.join(project, 'dist/games.json'), 'utf8'));
  const liveUrls = new Set(live.map(g => canonicalUrl(g.url)));
  const existingUrls = new Map(candidates.map(g => [canonicalUrl(g.playUrl), g]));
  const ids = new Set(candidates.map(g => g.id));
  let added = 0, existing = 0, skippedLive = 0;
  for (const game of incoming) {
    const url = canonicalUrl(game.playUrl);
    if (liveUrls.has(url)) { skippedLive++; continue; }
    if (existingUrls.has(url)) { existing++; continue; } // Preserve all existing metadata and decisions.
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id || '') || ids.has(game.id)) throw Error(`Invalid or duplicate candidate ID: ${game.id}`);
    if (!cleanText(game.title) || !cleanText(game.browserEvidence) || !Array.isArray(game.sourceUrls) || !game.sourceUrls.length) throw Error(`${game.id}: title, research evidence and sources required`);
    const entry = {
      id: game.id, title: cleanText(game.title), playUrl: url,
      sourceUrls: [...new Set(game.sourceUrls.map(canonicalUrl))],
      genre: cleanText(game.genre), description: cleanText(game.description),
      browserEvidence: cleanText(game.browserEvidence), researchedAt: cleanText(game.researchedAt),
      ownFiles: typeof game.ownFiles === 'boolean' ? game.ownFiles : null,
      requirements: cleanText(game.requirements),
      multiplayer: typeof game.multiplayer === 'boolean' ? game.multiplayer : null,
      mobile: typeof game.mobile === 'boolean' ? game.mobile : null,
      issues: Array.isArray(game.issues) ? game.issues.map(cleanText) : [],
      researchMethod: cleanText(game.researchMethod),
      assistantReview: pending(), userReview: pending(), reviewEvents: [],
    };
    candidates.push(entry); existingUrls.set(url, entry); ids.add(entry.id); added++;
  }
  console.log(JSON.stringify({added,alreadyQueued:existing,alreadyLive:skippedLive}));
} else if (command === 'review') {
  const [id, actor, status, notes, evidence] = args;
  if (!id || !['assistant', 'user'].includes(actor) || !['verified', 'rejected', 'pending'].includes(status) || !notes || !evidence) throw Error('Usage: research-db.mjs review ID assistant|user verified|rejected|pending "notes" "evidence URL or explicit human instruction reference"');
  const game = candidates.find(g => g.id === id);
  if (!game) throw Error(`Unknown candidate ${id}`);
  const review = { status, reviewedAt: new Date().toISOString(), notes, evidence };
  game[`${actor}Review`] = review;
  game.reviewEvents.push({actor,...review});
  console.log(`${id}: ${actor} ${status}. Ready for catalogue: ${ready(game)}. No catalogue changed.`);
} else if (!['build', 'list', 'ready'].includes(command)) throw Error(`Unknown command ${command}`);

const knownIds = new Set(), knownUrls = new Set();
for (const game of candidates) {
  if (knownIds.has(game.id) || knownUrls.has(canonicalUrl(game.playUrl))) throw Error('Duplicate ID or play URL in source database');
  knownIds.add(game.id); knownUrls.add(canonicalUrl(game.playUrl));
  for (const actor of ['assistant','user']) {
    const review = game[`${actor}Review`];
    if (!review || !['pending','verified','rejected'].includes(review.status)) throw Error(`Invalid ${actor} review for ${game.id}`);
    if (review.status !== 'pending' && (!review.notes || !review.evidence || !review.reviewedAt)) throw Error(`${game.id}: completed reviews require notes, evidence and time`);
  }
}
candidates.sort((a,b)=>a.title.localeCompare(b.title));
if (command === 'import' || command === 'review' || !(await readFile(sourcePath).catch(()=>null))) {
  const temporary = sourcePath + '.tmp';
  await writeFile(temporary, JSON.stringify(candidates,null,2)+'\n');
  await rename(temporary, sourcePath);
}

// SQLite is a reproducible local projection; the reviewable JSON and event history are versioned.
const db = new DatabaseSync(path.join(directory, 'gameflex-candidates.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, play_url TEXT NOT NULL UNIQUE, genre TEXT,
  own_files INTEGER, requirements TEXT, browser_evidence TEXT,
  assistant_status TEXT NOT NULL CHECK(assistant_status IN ('pending','verified','rejected')),
  user_status TEXT NOT NULL CHECK(user_status IN ('pending','verified','rejected')),
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_events (candidate_id TEXT NOT NULL REFERENCES candidates(id), actor TEXT NOT NULL CHECK(actor IN ('assistant','user')), status TEXT NOT NULL CHECK(status IN ('pending','verified','rejected')), reviewed_at TEXT NOT NULL, notes TEXT NOT NULL, evidence TEXT NOT NULL);
CREATE VIEW IF NOT EXISTS ready_for_catalogue AS SELECT * FROM candidates WHERE assistant_status='verified' AND user_status='verified';`);
db.exec('PRAGMA foreign_keys=ON; BEGIN; DELETE FROM review_events; DELETE FROM candidates;');
try {
  const insert=db.prepare('INSERT INTO candidates VALUES (?,?,?,?,?,?,?,?,?,?)');
  const event=db.prepare('INSERT INTO review_events VALUES (?,?,?,?,?,?)');
  for(const game of candidates) {
    insert.run(game.id,game.title,game.playUrl,game.genre,game.ownFiles===null?null:Number(game.ownFiles),game.requirements,game.browserEvidence,game.assistantReview.status,game.userReview.status,JSON.stringify(game));
    for(const review of game.reviewEvents) event.run(game.id,review.actor,review.status,review.reviewedAt,review.notes,review.evidence);
  }
  db.exec('COMMIT');
} catch(error) { db.exec('ROLLBACK'); throw error; }
const eligible=db.prepare('SELECT id,title,play_url FROM ready_for_catalogue').all();db.close();

const quote = value => '"'+String(value ?? '').replace(/"/g,'""')+'"';
const csvSafe = value => /^[=+@\-\t\r]/.test(String(value ?? '')) ? "'"+value : value;
const csvColumns=['id','title','playUrl','genre','ownFiles','requirements','browserEvidence','sourceUrls','issues','assistantStatus','userStatus','readyForCatalogue'];
const csv=[csvColumns.join(','),...candidates.map(g=>[g.id,g.title,g.playUrl,g.genre,g.ownFiles===null?'Unknown':g.ownFiles?'Yes':'No',g.requirements,g.browserEvidence,g.sourceUrls.join(' | '),g.issues.join(' | '),g.assistantReview.status,g.userReview.status,ready(g)?'Yes':'No'].map(v=>quote(csvSafe(v))).join(','))].join('\r\n')+'\r\n';
await writeFile(path.join(directory,'candidates.csv'),csv);
const md = value => String(value ?? '').replace(/[|]/g,'\\|').replace(/\r?\n/g,' ');
const queue=['# Browser-game review queue','',`${candidates.length} candidates · ${eligible.length} cleared by both reviewers. None are published by this database.`,'','Research evidence is a lead, not a verified gameplay result. Assistant and user decisions stay separate.','', '| ID | Game / play link | Genre | Original files | Assistant | User |', '|---|---|---|---|---|---|',...candidates.map(g=>`| ${md(g.id)} | [${md(g.title)}](<${g.playUrl}>) | ${md(g.genre)} | ${g.ownFiles===null?'Unknown':g.ownFiles?'Required':'No'} | ${g.assistantReview.status} | ${g.userReview.status} |`),'','## Research evidence','',...candidates.flatMap(g=>[`### ${md(g.title)} (${g.id})`,'',g.description,'',`Evidence: ${g.browserEvidence}`,'',`Requirements: ${g.requirements || 'Not yet established.'}`,'',`Sources: ${g.sourceUrls.map((url,i)=>`[Source ${i+1}](<${url}>)`).join(', ')}`,'',...(g.issues.length?[`Open questions: ${g.issues.join('; ')}`,'']:[])] )].join('\n');
await writeFile(path.join(directory,'review-queue.md'),queue+'\n');
if(command==='list'||command==='ready') console.log(JSON.stringify(command==='ready'?eligible:candidates.map(g=>({id:g.id,title:g.title,assistant:g.assistantReview.status,user:g.userReview.status,ready:ready(g)})),null,2));
else console.log(`Database built: ${candidates.length} candidates, ${eligible.length} ready for catalogue. Live games unchanged.`);
