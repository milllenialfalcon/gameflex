// Downloads per-game artwork for the dos.zone catalogue zone.
// Writes ONLY: dist/assets/dos-<id>.{webp,jpg,png} and docs/dos-zone-artwork.json
//
// Rules enforced here:
//  - rollercoaster-tycoon-deluxe (expansion bundle) and command-conquer-sep-26-1995
//    (incomplete GDI video-stripped build) are skipped.
//  - The generic dos.zone seo_image.jpg / 3dfx.png / hubicon placeholders are never used.
//  - Every download is validated: HTTP 200, non-empty body, MIME type and magic-byte
//    signature must agree with an actual image (or the bytes are rejected).
//  - Lemmings' first imageUrl is the generic SEO placeholder, so a genuine original
//    cover is sourced from a reputable host instead (see LEMMINGS_CANDIDATES).
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const SKIP = new Set([
  'rollercoaster-tycoon-deluxe',      // expansion bundle (Deluxe = base + 2 expansions)
  'command-conquer-sep-26-1995',      // cc_gdi_novid.jsdos: incomplete GDI, video-stripped build
]);
const SKIP_HOST_PATTERNS = [
  /seo_image\.jpg/i,                  // generic dos.zone SEO placeholder
  /3dfx\.png/i,                       // site chrome, not game art
  /hubicon/i,                         // site chrome, not game art
];
// Lemmings: the dos.zone listing's first imageUrl is the generic site SEO placeholder,
// so a genuine original cover is sourced from a reputable host (en.wikipedia, fair-use
// file description page). The box scan is preferred; the Amiga original screenshot is
// the fallback. Licence status is recorded honestly in the receipt, not implied.
const LEMMINGS_CANDIDATES = [
  { url: 'https://upload.wikimedia.org/wikipedia/en/0/0c/Lemmings-BoxScan.jpg', note: 'Original 1991 DMA Design/Psygnosis box art scan; en.wikipedia file page File:Lemmings-BoxScan.jpg (non-free fair use, 293x339).' },
  { url: 'https://upload.wikimedia.org/wikipedia/en/8/89/Amiga_Lemmings.png', note: 'Original 1991 Amiga gameplay screenshot; en.wikipedia file page File:Amiga Lemmings.png (non-free fair use, 320x200).' },
];

const SIGS = [
  { ext: 'png',  mime: 'image/png',  magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'jpg',  mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { ext: 'webp', mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF????WEBP
  { ext: 'gif',  mime: 'image/gif',  magic: [0x47, 0x49, 0x46, 0x38] },
];

function identify(buf) {
  for (const s of SIGS) {
    if (s.magic.every((b, i) => buf[i] === b)) {
      if (s.ext === 'webp' && buf.slice(8, 12).toString('latin1') !== 'WEBP') continue;
      return s;
    }
  }
  return null;
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' }, redirect: 'follow' });
  const buf = Buffer.from(await res.arrayBuffer());
  const sig = identify(buf);
  const ctype = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const entry = {
    requestUrl: url,
    finalUrl: res.url,
    status: res.status,
    contentLengthHeader: res.headers.get('content-length') ?? null,
    bytes: buf.length,
    contentType: ctype || null,
    signature: sig ? sig.ext : null,
  };
  if (!res.ok) return { ok: false, entry, reason: `HTTP ${res.status}` };
  if (!buf.length) return { ok: false, entry, reason: 'empty body (0 bytes)' };
  if (!sig) return { ok: false, entry, reason: 'bytes are not a recognised image signature' };
  if (ctype && !ctype.startsWith('image/')) return { ok: false, entry, reason: `content-type ${ctype} is not image/*` };
  if (ctype && !ctype.includes(sig.ext === 'jpg' ? 'jpeg' : sig.ext)) {
    return { ok: false, entry, reason: `content-type ${ctype} disagrees with ${sig.ext} signature` };
  }
  entry.sha256 = (await import('node:crypto')).createHash('sha256').update(buf).digest('hex');
  return { ok: true, entry, buf, ext: sig.ext, sig };
}

const selection = JSON.parse(await readFile('docs/dos-zone-selection.json', 'utf8'));
await mkdir('dist/assets', { recursive: true });

const results = [];
for (const e of selection.entries) {
  if (SKIP.has(e.id)) {
    results.push({ id: e.id, title: e.title, status: 'skipped', reason: 'excluded by instruction' });
    continue;
  }
  let candidates;
  if (e.id === 'lemmings-1991') {
    candidates = LEMMINGS_CANDIDATES;
  } else {
    candidates = (e.imageUrls || [])
      .filter(u => !SKIP_HOST_PATTERNS.some(p => p.test(u)))
      .map(url => ({ url, note: null }));
  }
  if (!candidates.length) {
    results.push({ id: e.id, title: e.title, status: 'no-candidate', reason: 'no game-specific imageUrl after filtering placeholders' });
    console.log(`${e.id}: NO CANDIDATE`);
    continue;
  }
  let done = false;
  const attempts = [];
  for (const c of candidates) {
    const url = c.url;
    try {
      const d = await download(url);
      attempts.push({ ...d.entry, accepted: d.ok, rejectedBecause: d.ok ? null : d.reason, note: c.note });
      if (!d.ok) { console.log(`${e.id}: reject ${url} -> ${d.reason}`); continue; }
      const file = `dist/assets/dos-${e.id}.${d.ext}`;
      await writeFile(file, d.buf);
      results.push({
        id: e.id,
        title: e.title,
        status: 'downloaded',
        localAssetPath: file,
        sourceUrl: d.entry.requestUrl,
        finalUrl: d.entry.finalUrl,
        bytes: d.entry.bytes,
        contentType: d.entry.contentType,
        signature: d.entry.signature,
        sha256: d.entry.sha256,
        sourceNote: c.note,
        imageUrlsInSelection: e.imageUrls,
        attempts,
      });
      console.log(`${e.id}: OK ${file} ${d.entry.bytes}b ${d.entry.contentType} ${d.ext}`);
      done = true;
      break;
    } catch (err) {
      attempts.push({ requestUrl: url, accepted: false, error: String(err && err.message || err) });
      console.log(`${e.id}: error ${url} -> ${err.message}`);
    }
  }
  if (!done) {
    results.push({ id: e.id, title: e.title, status: 'failed', reason: 'no candidate passed validation', attempts });
    console.log(`${e.id}: FAILED`);
  }
}

const receipt = {
  generatedAt: new Date().toISOString(),
  scope: 'Per-game artwork for the dos.zone catalogue zone. Base-game listings only.',
  worktreeScopeNote:
    'This run wrote only dist/assets/dos-<id>.<ext>, docs/dos-zone-artwork.json and scripts/fetch-dos-artwork.mjs inside the catalogue-dos worktree. Unrelated changes to dist/app.js, dist/games.json, dist/index.html, dist/style.css, scripts/check-catalog.mjs and the untracked *-cover.* / catalogue-artwork files appeared in the same worktree from a different concurrent worker and are NOT part of this run.',
  rules: [
    'Only dist/assets/dos-<id>.<ext> and docs/dos-zone-artwork.json were written by this script.',
    'rollercoaster-tycoon-deluxe skipped: Deluxe edition bundles both expansion packs (not a base-game listing).',
    'command-conquer-sep-26-1995 skipped: cc_gdi_novid.jsdos is a GDI-only, video-stripped incomplete build.',
    'Generic dos.zone placeholders (seo_image.jpg, 3dfx.png, hubicon_2.png) are never accepted as artwork.',
    'lemmings-1991: first imageUrl was the generic dos.zone SEO placeholder, so a genuine original cover was sourced from a reputable host instead.',
    'Every accepted file passed HTTP 200 + non-empty body + MIME/signature agreement checks.',
    'No generative/derivative art was produced; no unrelated-edition covers were used.',
  ],
  verificationLimits: [
    'These assets are thumbnails only. Downloading an image does not verify gameplay, emulation, or any right to host, stream, frame or monetise the game.',
    'Content-type/signature checks prove the bytes are a real image of the stated format; they do not prove the image depicts the specific game beyond the source page it was published on.',
    'No assistant or user review is recorded here. Discovery is not approval.',
  ],
  entries: results,
  counts: {
    considered: selection.entries.length,
    downloaded: results.filter(r => r.status === 'downloaded').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
  },
};
await writeFile('docs/dos-zone-artwork.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(`\n${receipt.counts.downloaded} downloaded, ${receipt.counts.skipped} skipped, ${receipt.counts.failed} failed`);
