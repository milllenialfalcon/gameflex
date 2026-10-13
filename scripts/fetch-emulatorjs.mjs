#!/usr/bin/env node
/**
 * Vendors the pinned EmulatorJS runtime and phase-1 cores into dist/.
 *
 *   node scripts/fetch-emulatorjs.mjs           # download, verify, extract, report
 *   node scripts/fetch-emulatorjs.mjs --check   # verify the vendored tree, write nothing
 *
 * Sources are the npm registry tarballs named in emulator/emulatorjs-lock.json. Every
 * tarball is verified against its dist.integrity (sha512) before a single byte is
 * extracted, and the run aborts on any mismatch. Node 22+ only: fetch, node:zlib and a
 * small tar reader written here, so the repository gains no dependency.
 *
 * Phase 1 uses the non-threaded, non-legacy WASM builds: `<core>-wasm.data`. Threaded
 * cores need SharedArrayBuffer (the site is not cross-origin isolated) and the legacy
 * builds need WebGL1 only, which dist/emulator/play.html does not ask for.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOCK_FILE = path.join(ROOT, 'emulator', 'emulatorjs-lock.json');
const CHECK_ONLY = process.argv.includes('--check');
const CACHE_DIR = path.join(os.tmpdir(), 'gameflex-emulatorjs-cache');
const TAR_BLOCK = 512;

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) fail(`Node 22 or newer is required, found ${process.versions.node}`);

/* ------------------------------------------------------------------ integrity */

function parseIntegrity(integrity) {
  const match = /^(sha512)-([A-Za-z0-9+/=]+)$/.exec(String(integrity || '').trim());
  if (!match) fail(`unsupported integrity value: ${integrity}`);
  return { algorithm: match[1], digest: match[2] };
}

function digest(buffer, algorithm, encoding = 'base64') {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function verifyIntegrity(buffer, integrity, label) {
  const { algorithm, digest: expected } = parseIntegrity(integrity);
  const actual = digest(buffer, algorithm);
  if (actual !== expected) {
    fail(
      `${label}: integrity mismatch, aborting before extraction\n` +
        `  expected ${algorithm}-${expected}\n` +
        `  received ${algorithm}-${actual}\n` +
        '  the registry tarball changed; re-check emulator/emulatorjs-lock.json against `npm view`'
    );
  }
  return actual;
}

/* ---------------------------------------------------------------------- fetch */

async function fetchBytes(url, label) {
  const response = await fetch(url).catch(error => fail(`${label}: download failed (${error.message})`));
  if (!response.ok) fail(`${label}: download failed with HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Tarballs are cached by expected integrity, so a cached hit is always the pinned bytes. */
async function fetchTarball(entry) {
  const label = `${entry.package}@${entry.version}`;
  const cached = path.join(CACHE_DIR, digest(Buffer.from(entry.integrity), 'sha256', 'hex') + '.tgz');
  if (existsSync(cached)) {
    const body = await readFile(cached);
    if (digest(body, 'sha512') === parseIntegrity(entry.integrity).digest) return { body, source: 'cache' };
    await rm(cached, { force: true });
  }
  const body = await fetchBytes(entry.tarball, label);
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cached, body);
  return { body, source: 'registry' };
}

/* ------------------------------------------------------------------ tar reader */

const cString = (buffer, start, length) => {
  const field = buffer.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
};

/** npm tarballs are gzipped pax/short-name tars. Only what npm emits is handled here. */
function parseTar(buffer) {
  const entries = [];
  let offset = 0;
  let pendingLongName = null;
  let pendingPax = null;

  while (offset + TAR_BLOCK <= buffer.length) {
    const header = buffer.subarray(offset, offset + TAR_BLOCK);
    if (header.every(byte => byte === 0)) break;

    const sizeField = cString(header, 124, 12).trim();
    const size = sizeField ? Number.parseInt(sizeField, 8) : 0;
    if (!Number.isFinite(size) || size < 0) fail(`unreadable tar entry size at offset ${offset}`);
    const type = String.fromCharCode(header[156] || 48);
    const data = buffer.subarray(offset + TAR_BLOCK, offset + TAR_BLOCK + size);
    const prefix = cString(header, 345, 155);
    let name = prefix ? `${prefix}/${cString(header, 0, 100)}` : cString(header, 0, 100);

    if (type === 'x' || type === 'g') pendingPax = type === 'x' ? parsePax(data) : null;
    else if (type === 'L') pendingLongName = cString(data, 0, data.length);
    else {
      if (pendingPax?.path) name = pendingPax.path;
      if (pendingLongName) name = pendingLongName;
      pendingPax = null;
      pendingLongName = null;
      if (type === '0' || type === '\0' || type === '') entries.push({ name, size, data });
    }

    offset += TAR_BLOCK + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
  }

  if (!entries.length) fail('tarball contained no files');
  return entries;
}

function parsePax(data) {
  const text = data.toString('utf8');
  const records = {};
  let cursor = 0;
  while (cursor < text.length) {
    const space = text.indexOf(' ', cursor);
    if (space === -1) break;
    const length = Number.parseInt(text.slice(cursor, space), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = text.slice(space + 1, cursor + length - 1);
    const equals = record.indexOf('=');
    if (equals !== -1) records[record.slice(0, equals)] = record.slice(equals + 1);
    cursor += length;
  }
  return records;
}

/* ------------------------------------------------------------------- selection */

/** Runtime: the data/ tree, minus the cores placeholder and every locale but en-US. */
function selectRuntime(entries, target) {
  const selected = [];
  for (const entry of entries) {
    if (entry.name === 'package/LICENSE') selected.push({ file: path.join(target, 'LICENSE'), data: entry.data });
    if (!entry.name.startsWith('package/data/')) continue;
    const relative = entry.name.slice('package/data/'.length);
    if (relative.startsWith('cores/')) continue;
    if (relative.startsWith('localization/') && relative !== 'localization/en-US.json') continue;
    selected.push({ file: path.join(target, ...relative.split('/')), data: entry.data });
  }
  if (!selected.length) fail('runtime tarball did not contain the expected package/data tree');
  return selected;
}

function selectCore(entries, entry, target) {
  const match = entries.find(candidate => candidate.name === `package/${entry.dataFile}`);
  if (!match) {
    const found = entries.map(candidate => candidate.name).join(', ');
    fail(`${entry.package}: ${entry.dataFile} is missing from the tarball (found: ${found})`);
  }
  const files = [{ file: path.join(target, 'cores', entry.dataFile), data: match.data }];
  if (entry.reportFile) files.push(...selectReport(entries, entry, target));
  return files;
}

/**
 * The core's build report. The runtime fetches it as `cores/reports/<core>.json`
 * (data/src/emulator.js, downloadGameCore) and uses its `buildStart` as the IndexedDB cache
 * key; when the file is missing it logs `Could not fetch core report JSON! Core caching will
 * be disabled!` and re-downloads the whole core on every boot. The report is a tiny JSON
 * file inside the same core tarball, so it ships with the core it describes.
 */
function selectReport(entries, entry, target) {
  const match = entries.find(candidate => candidate.name === `package/${entry.reportFile}`);
  if (!match) {
    const found = entries.map(candidate => candidate.name).join(', ');
    fail(`${entry.package}: ${entry.reportFile} is missing from the tarball (found: ${found})`);
  }
  return [{ file: path.join(target, 'cores', 'reports', `${entry.core}.json`), data: match.data }];
}

/* ---------------------------------------------------------------------- writes */

async function writeIfChanged(file, data, results) {
  const bytes = Buffer.from(data);
  const hash = digest(bytes, 'sha256', 'hex');
  const current = await readFile(file).catch(() => null);
  const currentHash = current ? digest(current, 'sha256', 'hex') : null;
  const record = { file, bytes: bytes.length, changed: currentHash !== hash, existed: Boolean(current) };
  results.push(record);
  if (CHECK_ONLY || !record.changed) return record;
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  await rename(temporary, file);
  return record;
}

/* ------------------------------------------------------------------ validation */

/** The runtime's own script list is the source of truth for which files must be vendored. */
async function requiredFiles(target, lock) {
  const required = [
    path.join(target, 'loader.js'),
    path.join(target, 'emulator.css'),
    path.join(target, 'version.json'),
    path.join(target, 'localization', 'en-US.json'),
    path.join(target, 'compression', 'extract7z.js'),
    ...lock.packages.filter(entry => entry.kind === 'core').map(entry => path.join(target, 'cores', entry.dataFile)),
    ...lock.packages.filter(entry => entry.kind === 'core' && entry.reportFile).map(entry => path.join(target, 'cores', 'reports', `${entry.core}.json`)),
  ];
  const loader = await readFile(path.join(target, 'loader.js'), 'utf8').catch(() => null);
  if (!loader) return required;
  const block = /const scripts = \[([\s\S]*?)\]/.exec(loader);
  if (!block) fail('could not read the script list from loader.js');
  const scripts = [...block[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  if (!scripts.length) fail('loader.js listed no scripts');
  return [...required, ...scripts.map(script => path.join(target, 'src', script))];
}

/* ------------------------------------------------------------------------ main */

const mb = bytes => `${(bytes / 1048576).toFixed(2)} MB`;

async function main() {
  const lock = JSON.parse(await readFile(LOCK_FILE, 'utf8'));
  const target = path.join(ROOT, ...lock.runtime.split('/'));
  const licenceDir = path.join(ROOT, ...lock.licences.split('/'));
  const results = [];

  console.log(`gameflex emulatorjs vendor${CHECK_ONLY ? ' (check only)' : ''}`);
  console.log(`lock    emulator/emulatorjs-lock.json — EmulatorJS ${lock.version}`);

  for (const entry of lock.packages) {
    const label = `${entry.package}@${entry.version}`;
    const { body, source } = await fetchTarball(entry);
    const actual = verifyIntegrity(body, entry.integrity, label);
    const entries = parseTar(gunzipSync(body));
    const files = entry.kind === 'runtime' ? selectRuntime(entries, target) : selectCore(entries, entry, target);
    const written = [];
    for (const item of files) written.push(await writeIfChanged(item.file, item.data, results));
    const bytes = written.reduce((total, record) => total + record.bytes, 0);
    console.log(
      `${entry.kind.padEnd(7)} ${label} sha512 ${actual.slice(0, 12)}… — ${written.length} files, ${mb(bytes)} from ${source}` +
        (entry.kind === 'core' ? ` (${entry.dataFile})` : '')
    );

    if (entry.licenceSource) {
      const licence = await fetchBytes(entry.licenceSource, `${label} ${entry.licence}`);
      const licenceHash = digest(licence, 'sha256', 'hex');
      if (licenceHash !== entry.licenceSha256) {
        fail(
          `${label}: ${entry.licence} text does not match the pinned sha256\n` +
            `  expected ${entry.licenceSha256}\n  received ${licenceHash}\n` +
            `  ${entry.licenceSource} changed; review the licence, then re-pin the lock`
        );
      }
      const record = await writeIfChanged(path.join(licenceDir, `${entry.core}-${entry.licence}`), licence, results);
      console.log(
        `licence ${label} ${entry.licence} (${entry.licenceName}) sha256 ok — ${record.changed ? 'written' : 'current'}`
      );
    }
  }

  /* The loader decompresses <core>-wasm.data as a 7z archive; catch a wrong variant here. */
  for (const entry of lock.packages.filter(item => item.kind === 'core')) {
    const file = path.join(target, 'cores', entry.dataFile);
    const header = (await readFile(file).catch(() => null))?.subarray(0, 6);
    if (!header) fail(`${entry.dataFile} is missing after extraction`);
    if (header.toString('hex') !== '377abcaf271c') {
      fail(`${entry.dataFile} is not a 7z archive; EmulatorJS cannot decompress it as vendored`);
    }
  }

  const missing = (await requiredFiles(target, lock)).filter(file => !existsSync(file));
  if (missing.length) fail(`vendored tree is incomplete:\n  ${missing.join('\n  ')}`);

  /* A report the runtime cannot parse is as bad as no report: it disables core caching. */
  for (const entry of lock.packages.filter(item => item.kind === 'core' && item.reportFile)) {
    const file = path.join(target, 'cores', 'reports', `${entry.core}.json`);
    const report = JSON.parse(await readFile(file, 'utf8').catch(() => fail(`${entry.core}: core report is unreadable`)));
    if (report.core !== entry.core) fail(`${entry.core}: core report names a different core (${report.core})`);
    if (!report.buildStart) fail(`${entry.core}: core report has no buildStart, so core caching would stay off`);
  }

  const totalBytes = results.reduce((total, record) => total + record.bytes, 0);
  const changed = results.filter(record => record.changed);
  console.log(
    `${results.length} files, ${mb(totalBytes)} total — ${changed.length ? `${changed.length} written` : 'already current'}`
  );
  console.log(`target  ${path.relative(ROOT, target).replaceAll('\\', '/')}`);
  if (CHECK_ONLY && changed.length) fail(`${changed.length} file(s) differ from the lock; run without --check to refresh`);

  console.log(`cores   ${lock.packages.filter(item => item.kind === 'core').map(item => item.dataFile).join(', ')}`);
  console.log('next    node scripts/serve.mjs and open /emulator/play.html?id=<catalogue-id> (see docs/emulator.md)');
}

function fail(message) {
  console.error(`fetch-emulatorjs: ${message}`);
  process.exit(1);
}

await main();
