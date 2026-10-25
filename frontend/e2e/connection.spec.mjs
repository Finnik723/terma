import { test, expect } from '@playwright/test';
import { startJar, stop, waitForBackend } from '../../tools/runtime.mjs';
import { e2eSettings } from './settings.ts';

test('built frontend receives real backend UP and reports failure after backend stops', async ({ page }) => {
  const backend = startJar('backend/target/terma-backend.jar', [
    `--server.port=${e2eSettings.backendPort}`,
    `--server.address=${e2eSettings.host}`,
  ]);
  try {
    await waitForBackend(e2eSettings.backendURL, backend);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Технический каркас' })).toBeVisible();
    await page.getByRole('button', { name: 'Проверить связь' }).click();
    await expect(page.getByRole('status')).toHaveText('Backend ответил на технический HTTP-запрос');
    await expect(page.getByText('Не подключены / не проверены')).toBeVisible();
    await stop(backend);
    await page.getByRole('button', { name: 'Проверить связь' }).click();
    await expect(page.getByRole('status')).toHaveText('Backend недоступен или вернул неожиданный ответ');
  } finally { await stop(backend); }
});
