import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { freePort, root } from './runtime.mjs';

test('an unavailable backend makes the mandatory positive HTTP check exit nonzero', async () => {
  const port = await freePort();
  const result = spawnSync(process.execPath, ['tools/process-smoke.mjs', '--require-backend', `http://127.0.0.1:${port}`],
    { cwd: root, timeout: 5000, encoding: 'utf8', windowsHide: true });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /smoke FAILED/);
  assert.doesNotMatch(result.stdout, /check passed/);
});
