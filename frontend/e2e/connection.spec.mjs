import { test, expect } from '@playwright/test';
import { startJar, stop, waitForBackend } from '../../tools/runtime.mjs';

test('built frontend receives real backend UP and reports failure after backend stops', async ({ page }) => {
  const backend = startJar('backend/target/terma-backend.jar', ['--server.port=8080']);
  try {
    await waitForBackend('http://127.0.0.1:8080', backend);
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
