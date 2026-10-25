import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { deadline, root } from './runtime.mjs';

async function rejectedConfiguration(overrides) {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview'], {
    cwd: join(root, 'frontend'), env: { ...process.env, ...overrides }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  try {
    const code = await deadline(new Promise((resolveExit, reject) => {
      child.once('error', reject); child.once('close', resolveExit);
    }), 10000, 'Frontend should have rejected this configuration');
    assert.notEqual(code, 0, output);
    return output;
  } finally { if (child.exitCode === null) child.kill(); }
}

test('invalid frontend port is rejected', async () => {
  assert.match(await rejectedConfiguration({ TERMA_FRONTEND_PORT: 'invalid' }), /TERMA_FRONTEND_PORT must/);
});

test('unsafe proxy URL is rejected without printing embedded credentials', async () => {
  const output = await rejectedConfiguration({ TERMA_BACKEND_URL: 'http://user:synthetic-test-secret@127.0.0.1:8080' });
  assert.match(output, /TERMA_BACKEND_URL must/);
  assert.doesNotMatch(output, /synthetic-test-secret/);
});

test('occupied frontend port fails instead of silently changing the port', async () => {
  const server = createServer();
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  try {
    const output = await rejectedConfiguration({ TERMA_FRONTEND_PORT: String(server.address().port) });
    assert.match(output, /already in use/);
  } finally { await new Promise(resolveClose => server.close(resolveClose)); }
});
