import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { startJar, stop, waitForBackend } from '../../tools/runtime.mjs';
import { e2eSettings } from './settings.ts';

async function login(page, username, password) {
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByText(username, { exact: true })).toBeVisible();
}

test('creates and reopens a project, clears it in the other tab on logout, and isolates accounts', async ({ page, context }) => {
  const first = process.env.TERMA_E2E_PASSWORD_1;
  const second = process.env.TERMA_E2E_PASSWORD_2;
  if (!first || !second) throw new Error('TERMA_E2E_PASSWORD_1 and TERMA_E2E_PASSWORD_2 are required for project E2E');
  const backend = startJar('backend/target/terma-backend.jar', [
    `--server.port=${e2eSettings.backendPort}`, `--server.address=${e2eSettings.host}`,
  ], { TERMA_DEMO_ACCOUNTS_ENABLED: 'true', TERMA_DEMO_PASSWORD_1: first, TERMA_DEMO_PASSWORD_2: second });
  try {
    await waitForBackend(e2eSettings.backendURL, backend);
    await page.goto('/');
    await login(page, 'demo1', first);
    await expect(page.getByRole('heading', { name: 'Проекты' })).toBeVisible();
    // The isolated CI database is reused by the second configuration-isolation run.
    const name = `Растворы ${randomUUID()}`;
    await page.getByLabel('Название проекта').fill(name);
    await page.getByRole('button', { name: 'Создать проект' }).click();
    const link = page.getByRole('link', { name });
    const detail = await link.getAttribute('href');
    expect(detail).toMatch(/^\/projects\/[a-f0-9-]{36}$/);
    await link.click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.locator('time')).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('link', { name: 'Все проекты' }).click();
    await expect(link).toBeVisible();

    const secondTab = await context.newPage();
    await secondTab.goto('/');
    await secondTab.getByRole('button', { name: 'Выйти' }).click();
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
    await expect(link).toHaveCount(0);
    await login(secondTab, 'demo2', second);
    await expect(page.getByText('demo2', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Название проекта')).toBeVisible();
    await expect(link).toHaveCount(0);
    await page.goto(detail);
    await expect(page.getByRole('alert')).toHaveText('Проект не найден или у вас нет доступа.');
    await expect(page.getByRole('heading', { name })).toHaveCount(0);
  } finally { await stop(backend); }
});
