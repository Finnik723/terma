import assert from 'node:assert/strict';
import { deadline, freePort, requireLiveness, startJar, stop, waitForBackend } from './runtime.mjs';

async function exits(jar, args = [], environment = {}) {
  const processHandle = startJar(jar, args, environment);
  try {
    const result = await deadline(processHandle.exited, 30000, `JVM process timeout: ${jar}`);
    if (processHandle.failure) throw processHandle.failure;
    return { ...result, logs: processHandle.logs };
  } finally { await stop(processHandle); }
}

try {
  if (process.argv[2] === '--require-backend') {
    await requireLiveness(process.argv[3]);
    console.log('HTTP backend check passed (infrastructure NOT_CHECKED).');
  } else {
    const worker = await exits('worker/target/terma-worker.jar');
    assert.equal(worker.code, 0, worker.logs);
    assert.match(worker.logs, /WORKER_BOOTSTRAP_OK/);
    const invalidWorker = await exits('worker/target/terma-worker.jar', ['--spring.main.web-application-type=invalid']);
    assert.notEqual(invalidWorker.code, 0, 'Invalid worker configuration must fail');
    assert.doesNotMatch(invalidWorker.logs, /WORKER_BOOTSTRAP_OK/);
    console.log('Worker bootstrap: passed; invalid configuration: rejected; jobs NOT_IMPLEMENTED.');

    const port = await freePort();
    const backend = startJar('backend/target/terma-backend.jar', [], { SERVER_PORT: String(port), SERVER_ADDRESS: '127.0.0.1' });
    try {
      await waitForBackend(`http://127.0.0.1:${port}`, backend);
      const occupied = await exits('backend/target/terma-backend.jar', [`--server.port=${port}`]);
      assert.notEqual(occupied.code, 0, 'Occupied backend port must fail');
      const invalidPort = await exits('backend/target/terma-backend.jar', [], { SERVER_PORT: 'invalid' });
      assert.notEqual(invalidPort.code, 0, 'Invalid backend port must fail');
      const publicBind = await exits('backend/target/terma-backend.jar', ['--server.address=0.0.0.0']);
      assert.notEqual(publicBind.code, 0, 'Public scaffold bind must fail');
      console.log('Backend process / real HTTP liveness: passed; occupied port and invalid configuration: rejected.');
    } finally { await stop(backend); }
    console.log('PostgreSQL/Kafka availability and integrations: NOT_CONFIGURED / NOT_RUN.');
  }
} catch (error) {
  console.error(`Process/HTTP smoke FAILED: ${error.message}`);
  process.exitCode = 1;
}
