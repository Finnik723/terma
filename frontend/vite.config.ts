import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'TERMA_');
  const portText = process.env.TERMA_FRONTEND_PORT ?? env.TERMA_FRONTEND_PORT ?? '5173';
  if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
    throw new Error('TERMA_FRONTEND_PORT must be an integer from 1 to 65535.');
  }
  let target: URL;
  try {
    target = new URL(process.env.TERMA_BACKEND_URL ?? env.TERMA_BACKEND_URL ?? 'http://127.0.0.1:8080');
  } catch {
    throw new Error('TERMA_BACKEND_URL must be a valid loopback HTTP origin.');
  }
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('TERMA_BACKEND_URL must be a loopback HTTP origin without credentials, path, query or fragment.');
  }
  const proxy = { '^/actuator/health/liveness$': { target: target.origin } };
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: Number(portText), strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: Number(portText), strictPort: true, proxy },
  };
});
