import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const java = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';

export function startJar(relativePath, args = [], environment = {}) {
  const jar = resolve(root, relativePath);
  if (!existsSync(jar)) throw new Error(`Build the JVM artifacts first; missing ${relativePath}`);
  const child = spawn(java, ['-jar', jar, ...args], { cwd: root, env: { ...process.env, ...environment }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  let failure;
  const collect = chunk => { logs = (logs + chunk.toString()).slice(-16000); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const exited = new Promise(resolveExit => {
    child.once('error', error => { failure = error; resolveExit({ code: -1, signal: null }); });
    child.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  return { child, exited, get logs() { return logs; }, get failure() { return failure; } };
}

export async function deadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function stop(processHandle) {
  if (processHandle.child.exitCode === null && processHandle.child.signalCode === null) {
    processHandle.child.kill();
    try { await deadline(processHandle.exited, 10000, 'Process shutdown timeout'); }
    catch { processHandle.child.kill('SIGKILL'); await deadline(processHandle.exited, 5000, 'Process could not be killed'); }
  }
}

export async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const port = server.address().port;
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}

export async function requireLiveness(origin) {
  const response = await fetch(`${origin}/actuator/health/liveness`, { signal: AbortSignal.timeout(1500) });
  if (response.status !== 200 || (await response.json()).status !== 'UP') throw new Error('Backend liveness did not return HTTP 200 / UP');
}

export async function waitForBackend(origin, processHandle) {
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    if (processHandle.failure || processHandle.child.exitCode !== null || processHandle.child.signalCode !== null) {
      throw new Error(`Backend exited before readiness. ${processHandle.failure?.message ?? ''}\n${processHandle.logs}`);
    }
    try { await requireLiveness(origin); return; } catch { /* Wait only during bounded process startup. */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
  }
  throw new Error(`Backend startup timeout.\n${processHandle.logs}`);
}
