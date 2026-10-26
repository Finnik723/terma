import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadline, startJar, stop } from './runtime.mjs';

test('both packaged applications fail startup when PostgreSQL is not configured', async () => {
  for (const module of ['backend', 'worker']) {
    const processHandle = startJar(`${module}/target/terma-${module}.jar`, ['--server.port=0'], {
      SPRING_DATASOURCE_URL: '', SPRING_DATASOURCE_USERNAME: '', SPRING_DATASOURCE_PASSWORD: '',
    });
    try {
      const result = await deadline(processHandle.exited, 30000, `${module} startup did not fail within deadline`);
      assert.ifError(processHandle.failure);
      assert.notEqual(result.code, 0);
      assert.match(processHandle.logs, /Missing required configuration: spring.datasource.url/);
      assert.doesNotMatch(processHandle.logs, /WORKER_BOOTSTRAP_OK|Started BackendApplication/);
    } finally { await stop(processHandle); }
  }
});
