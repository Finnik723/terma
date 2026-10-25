import { defineConfig } from '@playwright/test';
import { e2eSettings } from './e2e/settings.ts';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: { baseURL: e2eSettings.frontendURL, browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run preview',
    url: e2eSettings.frontendURL,
    env: {
      TERMA_FRONTEND_PORT: String(e2eSettings.frontendPort),
      TERMA_BACKEND_URL: e2eSettings.backendURL,
    },
    reuseExistingServer: false,
    timeout: 30000,
  },
});
