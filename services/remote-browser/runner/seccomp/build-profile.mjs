// Builds runner/seccomp/chromium-sandbox.json.
//
// Docker's default seccomp profile bounds a container but blocks the
// namespace-creating syscalls Chromium's own sandbox needs (it only permits
// clone() when *every* namespace flag is set, and does not permit unshare()).
// This script starts from Docker's shipped default profile and adds exactly the
// allowances the Chromium namespace sandbox requires, so the browser inside the
// container still runs WITH its sandbox enabled (never --no-sandbox).
//
//   node runner/seccomp/build-profile.mjs <path-to-docker-default.json>
//
// Source of the base profile: https://raw.githubusercontent.com/moby/moby/master/profiles/seccomp/default.json
import fs from 'node:fs';
import path from 'node:path';

const extra = [
  { names: ['unshare'], action: 'SCMP_ACT_ALLOW' },
  { names: ['setns'], action: 'SCMP_ACT_ALLOW' },
  { names: ['clone3'], action: 'SCMP_ACT_ALLOW' },
  // Chromium clones with a subset of namespace flags, which Docker's default
  // argument filter rejects.
  { names: ['clone'], action: 'SCMP_ACT_ALLOW' },
  // The sandbox mounts a fresh /proc and pivots root inside its own user+mount
  // namespace. Harmless outside that namespace: the container also runs with
  // --cap-drop ALL, so mount() cannot touch the host mount namespace.
  { names: ['mount', 'umount2', 'pivot_root', 'chroot'], action: 'SCMP_ACT_ALLOW' },
  { names: ['sethostname', 'setdomainname'], action: 'SCMP_ACT_ALLOW' },
];

const source = process.argv[2];
if (!source) {
  console.error('usage: node runner/seccomp/build-profile.mjs <docker-default-seccomp.json>');
  process.exit(2);
}

const base = JSON.parse(fs.readFileSync(source, 'utf8'));
const targeted = new Set(extra.flatMap((e) => e.names));
const kept = base.syscalls.filter((rule) => !rule.names.some((n) => targeted.has(n)));
const profile = {
  ...base,
  comment: 'Gameflex remote-browser runner: Docker default profile plus the namespace allowances the Chromium sandbox requires. Applied per session container via --security-opt seccomp=...',
  syscalls: [...kept, { comment: 'Chromium sandbox namespace setup', ...extra[0] }, ...extra.slice(1).map((e) => ({ comment: 'Chromium sandbox namespace setup', ...e }))],
};

const out = path.resolve('runner/seccomp/chromium-sandbox.json');
fs.writeFileSync(out, JSON.stringify(profile, null, 2) + '\n');
console.log(`wrote ${out}: ${profile.syscalls.length} rules (defaultAction=${profile.defaultAction})`);
