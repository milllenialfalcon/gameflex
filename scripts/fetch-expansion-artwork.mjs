#!/usr/bin/env node
// Artwork sourcing pass for the dos.zone top-games expansion candidates.
//
// Scope of this run (worktree D:\AI\Gameflex\.worktrees\hero-refresh):
//   reads  research/dos-top-expansion.json
//   writes dist/assets/refresh-candidate-<id>.<ext> and research/dos-expansion-artwork.json
//   never writes dist/games.json, research/candidates.json, any UI file or any doc.
//
// These assets are STAGING for a possible future, separately approved, disabled listing set.
// Downloading an image proves nothing about gameplay, hosting, framing, streaming, monetisation
// or any right to publish the game. Discovery and artwork are not approval.
//
// Rules enforced here:
//   * One art source per candidate: the artUrl recorded in research/dos-top-expansion.json
//     (the host's own og:image/background asset for that exact game page). Nothing is
//     substituted, generated or upscaled.
//   * dos-command-and-conquer is excluded: its bundle (cc_gdi_novid.jsdos) is an incomplete
//     GDI, video-stripped build. The exclusion is recorded with its reason, not silently dropped.
//   * Every download is validated: HTTP status, image/* content type, file signature (magic
//     bytes), header pixel dimensions, landscape orientation and the catalogue cover ratio.
//     A file that fails any hard check is never written; the failure is recorded with evidence.
//   * Ratio is recorded, not "fixed": a source that is landscape but not exactly the catalogue
//     1200x630 cover ratio is kept and the deviation is stated, because object-fit:cover is
//     how the UI renders covers. A source that is not landscape at all is rejected.
//
// Usage: node scripts/fetch-expansion-artwork.mjs [--only id,id]

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'research', 'dos-top-expansion.json');
const assetsDir = path.join(root, 'dist', 'assets');
const reportPath = path.join(root, 'research', 'dos-expansion-artwork.json');
const livePath = path.join(root, 'dist', 'games.json');
const USER_AGENT = 'gameflex-expansion-artwork/1.0 (+artwork provenance check; contact: project owner)';

// Excluded by instruction, with the reason that produced the exclusion.
const EXCLUDED = {
  'dos-command-and-conquer': 'cc_gdi_novid.jsdos is an incomplete GDI, video-stripped build of Command & Conquer. Excluded from this expansion batch by instruction; the incomplete bundle is not staged.',
};

// The published dos.zone covers in dist/assets are all 1200x630 (ratio 1.905); the catalogue
// card CSS renders art at aspect-ratio 1.88 and the detail dialog at 2. These are the numbers
// the ratio column is measured against.
const COVER_RATIO = 1200 / 630;
const CARD_RATIO = 1.88;
const RATIO_TOLERANCE = 0.15;

// Stated on every record in this batch, because it is true of every record in this batch.
const BATCH_LIMITS = [
  'Version/edition of the hosted bundle is unknown for every candidate: the .jsdos file was checked with HEAD only and was never downloaded or executed, so shareware/retail content, language and patch level are unconfirmed.',
  'Only the host page and its launch markup were observed. No emulator session was started, so gameplay, controls, saves and performance are unverified.',
  'The art asset is the host page\'s own artwork (og:image/background). Licence to reuse it in the Gameflex catalogue is not established by this download; treat the file as staging until review decides.',
];

const SIGNATURES = [
  { type: 'jpeg', ext: 'jpg', mime: 'jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'png', ext: 'png', mime: 'png', test: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'gif', ext: 'gif', mime: 'gif', test: b => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { type: 'webp', ext: 'webp', mime: 'webp', test: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

const describe = bytes => SIGNATURES.find(s => s.test(bytes))?.type ?? 'unknown';

// Pixel dimensions straight from the file header, so the receipt states what the bytes really are
// rather than what the content-type header claimed.
function dimensions(bytes, type) {
  try {
    if (type === 'png') return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    if (type === 'gif') return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
    if (type === 'webp') {
      const chunk = bytes.subarray(12, 16).toString('latin1');
      if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
      if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const bits = bytes.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
    if (type === 'jpeg') {
      let offset = 2;
      while (offset < bytes.length - 9) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const marker = bytes[offset + 1];
        const length = bytes.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
    }
  } catch { /* fall through */ }
  return null;
}

async function attempt(url) {
  let response;
  let buffer;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'image/*,*/*;q=0.8' },
      signal: AbortSignal.timeout(30000),
    });
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    return { ok: false, httpStatus: null, finalUrl: url, reason: `request failed: ${error.message}` };
  }
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const declaredLength = response.headers.get('content-length');
  const type = describe(buffer);
  const size = dimensions(buffer, type);
  const receipt = {
    httpStatus: response.status,
    finalUrl: response.url,
    contentType: contentType || null,
    contentLengthHeader: declaredLength,
    detectedType: type,
    bytes: buffer.length,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
  receipt.aspect = size ? Number((size.width / size.height).toFixed(3)) : null;
  receipt.landscape = size ? size.width > size.height : null;
  if (!response.ok) return { ...receipt, ok: false, reason: `source returned HTTP ${response.status}` };
  if (!contentType.startsWith('image/')) return { ...receipt, ok: false, reason: `content type ${contentType || '(missing)'} is not an image` };
  if (type === 'unknown') return { ...receipt, ok: false, reason: 'file signature does not match a supported image format' };
  const expected = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp' }[contentType.split('/')[1]];
  if (expected && expected !== type) return { ...receipt, ok: false, reason: `content type ${contentType} disagrees with file signature (${type})` };
  if (!size) return { ...receipt, ok: false, reason: 'pixel dimensions could not be read from the file header' };
  if (!receipt.landscape) return { ...receipt, ok: false, reason: `image is ${size.width}x${size.height} — not landscape, so it cannot serve as a catalogue cover` };
  if (buffer.length < 3000) return { ...receipt, ok: false, reason: `image is only ${buffer.length} bytes` };
  receipt.ratioDelta = Number((receipt.aspect - COVER_RATIO).toFixed(3));
  receipt.ratioNote =
    Math.abs(receipt.ratioDelta) <= RATIO_TOLERANCE
      ? `Landscape ${size.width}x${size.height}; ratio ${receipt.aspect} matches the catalogue cover ratio ${COVER_RATIO.toFixed(3)} (1200x630) within ${RATIO_TOLERANCE}.`
      : `Landscape ${size.width}x${size.height}; ratio ${receipt.aspect} differs from the 1200x630 cover ratio ${COVER_RATIO.toFixed(3)} by ${receipt.ratioDelta}. Card CSS uses aspect-ratio ${CARD_RATIO} with object-fit:cover, so the source is not resized here — flag for the primary agent to confirm cropping.`;
  return { ...receipt, ok: true, buffer };
}

async function main() {
  const only = process.argv.includes('--only')
    ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',').map(v => v.trim()))
    : null;

  const candidates = JSON.parse(await readFile(sourcePath, 'utf8'));
  if (!Array.isArray(candidates)) throw Error('research/dos-top-expansion.json must be an array');
  const liveBefore = createHash('sha256').update(await readFile(livePath)).digest('hex');

  const report = {
    generatedAt: new Date().toISOString(),
    scope: `Artwork staging for the dos.zone top-games expansion candidates in research/dos-top-expansion.json (${candidates.length} records, ${Object.keys(EXCLUDED).length} excluded).`,
    status: 'staging only — not an active game, not an approved listing, not in dist/games.json',
    method: 'The artUrl recorded for each candidate page in research/dos-top-expansion.json is downloaded once and byte-validated: HTTP status, image/* content type, file signature (magic bytes), pixel dimensions read from the file header, landscape orientation, and aspect ratio against the catalogue cover standard (1200x630). Files are written through a temp file + rename so an interrupted run cannot leave a partial asset. Nothing is generated, upscaled, recoloured or substituted; a candidate whose art fails validation is recorded as a failure with its evidence.',
    pagesWritten: [
      'dist/assets/refresh-candidate-<id>.<ext>',
      'research/dos-expansion-artwork.json',
    ],
    batchLimits: BATCH_LIMITS,
    coverStandard: { width: 1200, height: 630, ratio: Number(COVER_RATIO.toFixed(3)), cardCssAspect: CARD_RATIO, tolerance: RATIO_TOLERANCE },
    excluded: Object.entries(EXCLUDED).map(([id, reason]) => ({ id, reason })),
    entries: [],
    failures: [],
  };

  for (const candidate of candidates) {
    if (EXCLUDED[candidate.id]) { console.log(`SKIP ${candidate.id} (excluded by instruction)`); continue; }
    if (only && !only.has(candidate.id)) continue;
    if (!candidate.artUrl) {
      report.failures.push({ id: candidate.id, title: candidate.title, reason: 'no artUrl in the candidate record', evidence: [] });
      console.log(`FAIL ${candidate.id} — no artUrl in the candidate record`);
      continue;
    }
    const outcome = await attempt(candidate.artUrl);
    const base = {
      id: candidate.id,
      title: candidate.title,
      playUrl: candidate.playUrl,
      jsDosBundle: candidate.jsDosBundle ?? null,
      artSourcePage: candidate.playUrl,
      artUrl: candidate.artUrl,
    };
    if (!outcome.ok) {
      report.failures.push({
        ...base,
        status: 'art-not-staged',
        reason: outcome.reason,
        evidence: [`${candidate.artUrl} -> ${outcome.reason}`, `HTTP ${outcome.httpStatus ?? 'n/a'} · content-type ${outcome.contentType ?? 'n/a'} · ${outcome.bytes ?? 0} bytes · ${outcome.width ?? '?'}x${outcome.height ?? '?'}`],
      });
      console.log(`FAIL ${candidate.id} — ${outcome.reason}`);
      continue;
    }
    const ext = SIGNATURES.find(s => s.type === outcome.detectedType).ext;
    const assetName = `refresh-candidate-${candidate.id}.${ext}`;
    const target = path.join(assetsDir, assetName);
    const sha256 = createHash('sha256').update(outcome.buffer).digest('hex');
    let onDiskSha = null;
    try { onDiskSha = createHash('sha256').update(await readFile(target)).digest('hex'); } catch { /* new asset */ }
    let status = 'downloaded';
    if (onDiskSha === sha256) status = 'verified-unchanged';
    else {
      await mkdir(assetsDir, { recursive: true });
      const temp = path.join(assetsDir, `.${assetName}.tmp`);
      await writeFile(temp, outcome.buffer);
      await rename(temp, target);
      status = onDiskSha ? 'replaced' : 'downloaded';
    }
    report.entries.push({
      ...base,
      status,
      localAsset: `assets/${assetName}`,
      httpStatus: outcome.httpStatus,
      finalUrl: outcome.finalUrl,
      contentType: outcome.contentType,
      contentLengthHeader: outcome.contentLengthHeader,
      detectedType: outcome.detectedType,
      bytes: outcome.bytes,
      width: outcome.width,
      height: outcome.height,
      aspect: outcome.aspect,
      landscape: outcome.landscape,
      ratioVsCoverStandard: outcome.ratioDelta,
      ratioNote: outcome.ratioNote,
      sha256,
      editionNote: candidate.year ? `Host page states ${candidate.year} in its own description; bundle contents still unconfirmed.` : 'Host page states no release year, so no year is claimed here; bundle contents unconfirmed.',
      candidateIssues: candidate.issues ?? [],
      year: candidate.year ?? null,
      yearNote: candidate.yearNote ?? null,
      mobileClaimOnHostPage: candidate.mobileClaimOnHostPage ?? null,
    });
    console.log(`OK   ${candidate.id} -> dist/assets/${assetName} (${outcome.width}x${outcome.height}, ratio ${outcome.aspect}, ${outcome.bytes} bytes, ${status})`);
    if (Math.abs(outcome.ratioDelta) > RATIO_TOLERANCE) console.log(`     ratio flagged: ${outcome.ratioNote}`);
  }

  const liveAfter = createHash('sha256').update(await readFile(livePath)).digest('hex');
  report.liveCatalogueUnchanged = liveBefore === liveAfter;
  report.counts = {
    considered: candidates.length,
    staged: report.entries.length,
    excluded: Object.keys(EXCLUDED).length,
    failed: report.failures.length,
  };
  if (!report.liveCatalogueUnchanged) throw Error('dist/games.json changed during this run — refusing to write the receipt');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nreceipt: ${path.relative(root, reportPath).replace(/\\/g, '/')}`);
  console.log(`staged ${report.counts.staged} · excluded ${report.counts.excluded} · failed ${report.counts.failed} · dist/games.json unchanged: ${report.liveCatalogueUnchanged}`);
}

await main();
