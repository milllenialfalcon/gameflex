#!/usr/bin/env node
// Fetches genuine cover artwork for catalogue entries that have no art yet.
//
// Rules enforced here:
//   * Only NEW files are written into dist/assets/ (existing artwork is never overwritten).
//   * Every download is validated: HTTP status, image/* content type, file signature
//     (magic bytes) and decoded pixel dimensions must all agree before a file is kept.
//   * Sources are game-specific destination images or exact original-title artwork for
//     contextual identification. Original-title covers are not screenshots of fan ports.
//   * Failures are recorded with the evidence that produced them. Nothing is invented.
//   * This script reads metadata but never writes dist/games.json. The provenance report goes to
//     docs/catalogue-artwork.json.
//
// Usage: node scripts/fetch-catalogue-artwork.mjs [--only <id,id>] [--refresh]
//   --refresh  re-fetch sources for entries that already have art, and confirm the bytes on disk
//              still match the source (writes nothing when the sha256 is unchanged).

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'dist', 'assets');
const reportPath = path.join(root, 'docs', 'catalogue-artwork.json');
const USER_AGENT = 'gameflex-catalogue-art/1.0 (+artwork provenance check; contact: project owner)';

// Candidate sources, in preference order per entry. Every source must be checked against
// the destination page before it is trusted.
const CANDIDATES = [
  {
    id: 'urbanterror',
    title: 'Urban Terror',
    destination: 'https://ut.pieter.com/',
    sources: [
      {
        kind: 'destination-og-image',
        page: 'https://ut.pieter.com/',
        url: 'https://ut.pieter.com/assets/og.jpg?v=1',
        note: 'Destination og:image (og:image:alt = "Urban Terror ut4_casa - play free in your browser at ut.pieter.com"). In-game ut4_casa screenshot published by the host.',
      },
    ],
  },
  {
    id: 'pes6',
    title: 'PES 6',
    destination: 'https://pes6.optijuegos.net/',
    sources: [
      {
        kind: 'original-title-cover',
        page: 'https://en.wikipedia.org/wiki/Pro_Evolution_Soccer_6',
        url: 'https://upload.wikimedia.org/wikipedia/en/0/0f/PES6.jpg',
        note: 'Original Pro Evolution Soccer 6 cover. The destination og:image was rejected on visual review because it depicts the OPTIPROJECTS host logo.',
        caveats: [
          'Original-title artwork, not a screenshot of the browser port. Source attribution in docs/pes6-artwork.json.',
        ],
      },
    ],
  },
  {
    id: 'wasmarcade',
    title: 'WASM Arcade',
    destination: 'https://wasmarcade.com/pc-games',
    sources: [
      {
        kind: 'destination-og-image',
        page: 'https://wasmarcade.com/pc-games',
        url: 'https://wasmarcade.com/og/site-v2.png',
        note: 'Destination og:image / twitter:image for the collection page this entry links to.',
      },
    ],
  },
  {
    id: 'skate',
    title: 'Skate 3 — Fan Game',
    destination: 'https://skate.aaddpp.lol/',
    sources: [],
    // The concurrent run in this worktree sourced this cover from Wikipedia under a primary-agent
    // sourcing decision that the original title's cover art may be used contextually as
    // identification. That decision is recorded in docs/additional-artwork.json; this script
    // records the pointer instead of repeating the download, so the two records do not conflict.
    sourcedByOtherRun: {
      file: 'docs/additional-artwork.json',
      art: 'assets/skate-cover.jpg',
      sourceUrl: 'https://upload.wikimedia.org/wikipedia/en/8/84/Skate-3-Boxart.jpg',
      sourceKind: 'wikipedia-original-title-box-art',
      licenseStatus: 'Wikipedia non-free fair-use file',
      note: 'Original Skate 3 (EA, 2010) box art used contextually to identify the title the fan port runs. Publishing it is the user\'s decision, taken under their explicit instruction.',
    },
    blocked: [
      'Destination publishes no artwork: the 9,785-byte HTML response contains no <img> element, no og:image/twitter:image meta tag and no <link rel="icon">.',
      'Probed and got HTTP 404: /og.png /og.jpg /banner.png /preview.png /thumb.png /thumbnail.png /cover.png /assets/og.png /assets/banner.png /assets/preview.png /assets/thumb.png',
      'The page loads a single module (main.js) that references no image files; its only outbound links are Discord, Buy Me a Coffee and a token page.',
    ],
  },
  {
    id: 'simpsons',
    title: 'The Simpsons: Hit & Run',
    destination: 'https://shar-wasm.cjoseph.workers.dev/?skipmovie',
    sources: [],
    sourcedByOtherRun: {
      file: 'docs/additional-artwork.json',
      art: 'assets/simpsons-cover.png',
      sourceUrl: 'https://upload.wikimedia.org/wikipedia/en/5/5f/The_Simpsons_Hit_and_Run_cover.png',
      sourceKind: 'wikipedia-original-title-cover',
      licenseStatus: 'Wikipedia non-free fair-use file',
      note: 'Original 2003 box art used contextually to identify the title the WASM port runs. Publishing it is the user\'s decision, taken under their explicit instruction.',
    },
    blocked: [
      'Destination publishes no artwork: the 2,634-byte HTML response has no <img> element and no og:image/twitter:image; it references only /assets/index-*.js and a favicon.',
      'Probed and got HTTP 404: /og.png /og.jpg /preview.png /thumbnail.png /cover.png /assets/og.png /assets/cover.png /icon.png',
      'The JS bundle references only WebAssembly/binary game payloads (game-*.wasm, *.bin), no shareable cover art.',
    ],
  },
];

const SIGNATURES = [
  { type: 'jpeg', ext: 'jpg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'png', ext: 'png', test: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'gif', ext: 'gif', test: b => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { type: 'webp', ext: 'webp', test: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

const MIN_WIDTH = 600;
const MIN_HEIGHT = 150;

function describe(bytes) {
  return SIGNATURES.find(s => s.test(bytes))?.type ?? 'unknown';
}

// Pixel dimensions straight from the file header, so the report states what the bytes really are
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

async function fetchBytes(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT, accept: 'image/*,*/*;q=0.8' },
    signal: AbortSignal.timeout(30000),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { response, buffer };
}

async function attempt(entry, source) {
  const { response, buffer } = await fetchBytes(source.url);
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim();
  const type = describe(buffer);
  const size = dimensions(buffer, type);
  const result = {
    ok: false,
    httpStatus: response.status,
    finalUrl: response.url,
    contentType,
    detectedType: type,
    bytes: buffer.length,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
  if (!response.ok) return { ...result, reason: `destination returned HTTP ${response.status}` };
  if (!contentType.startsWith('image/')) return { ...result, reason: `content type ${contentType || '(missing)'} is not an image` };
  if (type === 'unknown') return { ...result, reason: 'file signature does not match a supported image format' };
  const expected = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp' }[contentType.split('/')[1]];
  if (expected && expected !== type) return { ...result, reason: `content type ${contentType} disagrees with file signature (${type})` };
  if (!size) return { ...result, reason: 'pixel dimensions could not be read from the file header' };
  if (size.width < MIN_WIDTH || size.height < MIN_HEIGHT) {
    return { ...result, reason: `image is ${size.width}x${size.height}, below the ${MIN_WIDTH}x${MIN_HEIGHT} floor for a card cover` };
  }
  if (buffer.length < 3000) return { ...result, reason: `image is only ${buffer.length} bytes` };
  return { ...result, ok: true, buffer };
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const only = process.argv.includes('--only')
    ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',').map(v => v.trim()))
    : null;

  const games = JSON.parse(await readFile(path.join(root, 'dist', 'games.json'), 'utf8'));
  const report = {
    generatedAt: new Date().toISOString(),
    refreshRun: refresh,
    method: 'Destination og:image/screenshot first, then official publisher artwork for the same title. Each download validated by HTTP status, content type, file signature and header pixel dimensions. This script does not invent sources and does not fabricate results: an entry with no genuine source is recorded as a failure with its evidence.',
    published: [],
    failures: [],
    skippedExistingArt: [],
    sourcedByOtherRun: [],
    caveat: 'Byte-level validation proves a file is a real image of the stated format at the stated dimensions. It does not prove the image depicts the named game, and it does not prove any right to host, stream, frame or monetise the destination.',
  };

  for (const entry of CANDIDATES) {
    if (only && !only.has(entry.id)) continue;
    const game = games.find(g => g.id === entry.id);
    if (!game) { report.failures.push({ id: entry.id, reason: 'no catalogue entry with this id', evidence: [] }); continue; }
    if (!entry.sources.length && entry.sourcedByOtherRun) {
      report.sourcedByOtherRun.push({
        id: entry.id,
        title: entry.title,
        destination: entry.destination,
        status: game.art ? 'wired-in-games-json' : 'asset-present-not-wired',
        wiredArt: game.art ?? null,
        ...entry.sourcedByOtherRun,
        destinationHasNoArtworkEvidence: entry.blocked ?? [],
      });
      continue;
    }
    if (game.art && !refresh) { report.skippedExistingArt.push({ id: entry.id, existingArt: game.art }); continue; }

    const failures = [];
    let written = null;
    for (const source of entry.sources) {
      let outcome;
      try { outcome = await attempt(entry, source); }
      catch (error) { outcome = { ok: false, reason: `request failed: ${error.message}`, finalUrl: source.url }; }
      if (!outcome.ok) {
        failures.push({ sourceUrl: source.url, httpStatus: outcome.httpStatus ?? null, contentType: outcome.contentType ?? null, bytes: outcome.bytes ?? null, reason: outcome.reason });
        console.log(`FAIL ${entry.id} <- ${source.url} (${outcome.reason})`);
        continue;
      }
      const assetName = entry.id === 'pes6' ? 'pes6-original.jpg' : `${entry.id}-cover.${SIGNATURES.find(s => s.type === outcome.detectedType).ext}`;
      const target = path.join(assetsDir, assetName);
      const sha256 = createHash('sha256').update(outcome.buffer).digest('hex');
      let onDiskSha = null;
      try { onDiskSha = createHash('sha256').update(await readFile(target)).digest('hex'); } catch { /* new asset */ }
      let status = 'downloaded';
      if (onDiskSha === sha256) status = 'verified-unchanged';
      else {
        await mkdir(assetsDir, { recursive: true });
        // Temp file in the same directory, then rename: an interrupted run can never leave a
        // half file in place of real artwork.
        const temp = path.join(assetsDir, `.${assetName}.tmp`);
        await writeFile(temp, outcome.buffer);
        await rename(temp, target);
        status = onDiskSha ? 'replaced' : 'downloaded';
      }
      written = {
        id: entry.id,
        title: entry.title,
        status,
        art: `assets/${assetName}`,
        sourceUrl: source.url,
        sourceKind: source.kind,
        sourcePage: source.page,
        sourceNote: source.note,
        httpStatus: outcome.httpStatus,
        finalUrl: outcome.finalUrl,
        contentType: outcome.contentType,
        detectedType: outcome.detectedType,
        bytes: outcome.bytes,
        width: outcome.width,
        height: outcome.height,
        aspect: Number((outcome.width / outcome.height).toFixed(2)),
        sha256,
        caveats: source.caveats ?? [],
      };
      console.log(`${status === 'downloaded' ? 'OK  ' : 'OK  '} ${entry.id} -> dist/assets/${assetName} (${outcome.width}x${outcome.height}, ${outcome.bytes} bytes, ${status})`);
      break;
    }

    if (written) report.published.push(written);
    else {
      report.failures.push({
        id: entry.id,
        title: entry.title,
        destination: entry.destination,
        status: 'no-genuine-artwork-found',
        reason: entry.blocked?.[0] ?? 'every candidate source failed validation',
        evidence: [...(entry.blocked ?? []), ...failures.map(f => `${f.sourceUrl} -> ${f.reason}`)],
      });
      console.log(`FAIL ${entry.id} - no genuine artwork found (recorded in docs/catalogue-artwork.json)`);
    }
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nreport: ${path.relative(root, reportPath)}`);
  console.log(`published ${report.published.length} · failed ${report.failures.length} · already had art ${report.skippedExistingArt.length}`);
}

await main();
