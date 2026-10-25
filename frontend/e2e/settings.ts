// Test-owned endpoints. Developer environment and .env files must not select them.
const host = '127.0.0.1';
const frontendPort = 5173;
const backendPort = 8080;

export const e2eSettings = Object.freeze({
  host,
  frontendPort,
  backendPort,
  frontendURL: `http://${host}:${frontendPort}`,
  backendURL: `http://${host}:${backendPort}`,
});
