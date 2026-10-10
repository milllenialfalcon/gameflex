import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';

// One throwaway container per session. Every flag below is a deliberate bound:
//  - no host mounts, no docker socket, no extra capabilities
//  - non-root (image user), read-only rootfs + tmpfs for /tmp
//  - CPU / memory / swap / pid caps and a bounded /dev/shm
//  - port published to loopback only (docker prints the random host port)
//  - Docker seccomp profile that permits Chromium's own sandbox to initialise
export function buildRunArgs({
  name, image, url, runnerToken, ttlMs, seccompProfilePath,
  viewerWidth = 960, viewerHeight = 540, frameQuality = 45, maxFrameFps = 12,
  memory = '1g', cpus = '1.5', pidsLimit = 256, shmSize = '512m',
  containerPort = 8080,
}) {
  const seccomp = path.resolve(seccompProfilePath);
  return [
    'run', '-d', '--rm',
    '--name', name,
    '--label', 'gameflex.remote-browser=1',
    '--network', 'bridge',
    '--memory', memory, '--memory-swap', memory,
    '--cpus', cpus,
    '--pids-limit', String(pidsLimit),
    '--shm-size', shmSize,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--security-opt', `seccomp=${seccomp}`,
    '--read-only',
    '--tmpfs', '/tmp:rw,size=256m,mode=1777',
    '-e', 'HOME=/tmp',
    '-e', 'NODE_ENV=production',
    '-e', `GAME_URL=${url}`,
    '-e', `RUNNER_TOKEN=${runnerToken}`,
    '-e', `RUNNER_TTL_MS=${ttlMs}`,
    '-e', `VIEWER_WIDTH=${viewerWidth}`,
    '-e', `VIEWER_HEIGHT=${viewerHeight}`,
    '-e', `FRAME_QUALITY=${frameQuality}`,
    '-e', `MAX_FRAME_FPS=${maxFrameFps}`,
    '-p', `127.0.0.1::${containerPort}`,
    image,
  ];
}

export function parsePublishedPort(output, containerPort = 8080) {
  // `docker port <name> 8080/tcp` -> "127.0.0.1:49153"
  const line = String(output).split('\n').map((s) => s.trim()).filter(Boolean)[0];
  if (!line) return null;
  const m = /^(?:127\.0\.0\.1|\[::1\]):(\d{1,5})$/.exec(line);
  if (!m) return null;
  const port = Number(m[1]);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

function run(bin, args) {
  return new Promise((resolve) => {
    const child = nodeSpawn(bin, args, { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err && err.message) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export function createDocker({ dockerBin = 'docker', log = () => {}, runCmd = run } = {}) {
  return {
    async start(opts) {
      const args = buildRunArgs(opts);
      const res = await runCmd(dockerBin, args);
      if (res.code !== 0) {
        return { ok: false, error: `docker run failed (${res.code}): ${res.stderr.trim().slice(0, 400)}` };
      }
      const containerId = res.stdout.trim().split('\n').pop().slice(0, 12);
      const portRes = await runCmd(dockerBin, ['port', opts.name, `${opts.containerPort ?? 8080}/tcp`]);
      const hostPort = portRes.code === 0 ? parsePublishedPort(portRes.stdout, opts.containerPort ?? 8080) : null;
      if (!hostPort) {
        await runCmd(dockerBin, ['rm', '-f', opts.name]);
        return { ok: false, error: `could not resolve published loopback port: ${portRes.stderr.trim().slice(0, 200)}` };
      }
      log(`[docker] started ${opts.name} (${containerId}) on 127.0.0.1:${hostPort}`);
      return { ok: true, containerId, hostPort };
    },
    async stop(name) {
      const res = await runCmd(dockerBin, ['rm', '-f', name]);
      if (res.code !== 0) log(`[docker] rm -f ${name} exited ${res.code}: ${res.stderr.trim().slice(0, 200)}`);
      return res.code === 0;
    },
    async version() {
      const res = await runCmd(dockerBin, ['version', '--format', '{{.Server.Version}}']);
      return res.code === 0 ? res.stdout.trim() : null;
    },
    async listManaged() {
      const res = await runCmd(dockerBin, ['ps', '-aq', '--filter', 'label=gameflex.remote-browser=1']);
      return res.code === 0 ? res.stdout.trim().split('\n').filter(Boolean) : [];
    },
  };
}

export async function waitForRunner(port, runnerToken, { timeoutMs = 25_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'timeout';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
        headers: { 'x-runner-token': runnerToken },
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) return { ok: true, body: await res.json() };
      // A 503 body carries the runner's phase or its SANDBOX_UNAVAILABLE reason.
      lastError = `healthz HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
    } catch (err) {
      lastError = String(err && err.message);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, error: lastError };
}
