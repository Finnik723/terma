import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 30000 },
});
