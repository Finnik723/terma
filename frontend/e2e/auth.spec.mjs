import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { startJar, stop, waitForBackend } from '../../tools/runtime.mjs';
import { e2eSettings } from './settings.ts';

test('PostgreSQL login, reload, invalid credentials, CSRF, logout and second account', async ({ page, context }) => {
  // Shared only within this isolated CI job, so the second configuration-isolation run
  // can reuse the same accounts without resetting their passwords.
  const first = process.env.TERMA_E2E_PASSWORD_1;
  const second = process.env.TERMA_E2E_PASSWORD_2;
  if (!first || !second) throw new Error('TERMA_E2E_PASSWORD_1 and TERMA_E2E_PASSWORD_2 are required for authentication E2E');
  const backend = startJar('backend/target/terma-backend.jar', [
    `--server.port=${e2eSettings.backendPort}`, `--server.address=${e2eSettings.host}`,
  ], { TERMA_DEMO_ACCOUNTS_ENABLED: 'true', TERMA_DEMO_PASSWORD_1: first, TERMA_DEMO_PASSWORD_2: second });
  try {
    await waitForBackend(e2eSettings.backendURL, backend);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
    expect((await page.request.get('/api/auth/session')).status()).toBe(401);
    expect((await page.request.post('/api/auth/login', { form: { username: 'demo1', password: first } })).status()).toBe(403);
    await page.getByLabel('Имя пользователя').fill('demo1');
    await page.getByLabel('Пароль', { exact: true }).fill(randomUUID());
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByText('Неверное имя пользователя или пароль')).toBeVisible();
    await page.getByLabel('Пароль', { exact: true }).fill(first);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByText('demo1', { exact: true })).toBeVisible();
    const cookie = (await context.cookies()).find(cookie => cookie.name === 'JSESSIONID');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    await page.reload();
    await expect(page.getByText('demo1', { exact: true })).toBeVisible();
    expect((await page.request.post('/api/auth/logout')).status()).toBe(403);
    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
    expect((await page.request.get('/api/auth/session')).status()).toBe(401);
    await page.getByLabel('Имя пользователя').fill('demo2');
    await page.getByLabel('Пароль', { exact: true }).fill(second);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByText('demo2', { exact: true })).toBeVisible();
  } finally { await stop(backend); }
});
