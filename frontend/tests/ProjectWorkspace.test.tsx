import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import { ProjectWorkspace } from '../src/ProjectWorkspace';

const project = {
  id: 'c3ae5166-7749-4bb2-914e-d2fb56c3d61a', name: 'Термодинамика растворов', createdBy: 'demo1',
  createdAt: '2026-11-21T08:00:00Z', updatedAt: '2026-11-21T08:00:00Z',
};
const csrf = { headerName: 'X-CSRF-TOKEN', token: 'masked-token' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

test('starts with projects after restoring a session, validates the name, and creates with CSRF', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ username: 'demo1' })).mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(json(csrf)).mockResolvedValueOnce(json(project, 201)).mockResolvedValueOnce(json([project]));
  vi.stubGlobal('fetch', fetchMock);
  render(<App/>);
  await screen.findByRole('heading', { name: 'Проекты' });
  await screen.findByText('У вас пока нет доступных проектов. Создайте первый проект.');
  const name = screen.getByLabelText('Название проекта');
  fireEvent.change(name, { target: { value: ' \u00a0 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Создать проект' }));
  expect(screen.getByRole('alert').textContent).toContain('Введите название');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fireEvent.change(name, { target: { value: `  ${project.name}  ` } });
  fireEvent.click(screen.getByRole('button', { name: 'Создать проект' }));
  const link = await screen.findByRole('link', { name: project.name });
  expect(link.getAttribute('href')).toBe(`/projects/${project.id}`);
  expect(fetchMock.mock.calls[2][0]).toBe('/api/auth/csrf');
  expect(fetchMock.mock.calls[3]).toEqual(['/api/projects', expect.objectContaining({
    method: 'POST', headers: { 'X-CSRF-TOKEN': csrf.token, 'Content-Type': 'application/json',
      'X-Expected-Username': 'demo1', 'Idempotency-Key': expect.any(String) },
    body: JSON.stringify({ name: project.name }),
  })]);
});

test('list failure leaves a retry, and retrying after a lost create response reuses the key', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(json(csrf)).mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce(json(csrf)).mockResolvedValueOnce(json(project, 201)).mockResolvedValueOnce(json([project]));
  vi.stubGlobal('fetch', fetchMock);
  render(<ProjectWorkspace username="demo1" onSessionChanged={vi.fn()}/>);
  await screen.findByText('Не удалось загрузить проекты. Проверьте соединение.');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
  const name = await screen.findByLabelText('Название проекта');
  fireEvent.change(name, { target: { value: project.name } });
  fireEvent.click(screen.getByRole('button', { name: 'Создать проект' }));
  await screen.findByText('Не удалось подтвердить создание. Проверьте соединение и повторите отправку.');
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Создать проект' }));
  await screen.findByRole('link', { name: project.name });
  const writes = fetchMock.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(writes).toHaveLength(2);
  expect(writes[1][1]).toMatchObject({ headers: { 'Idempotency-Key': writes[0][1].headers['Idempotency-Key'] } });
});

test('opens a project by URL after session restoration, and shows no project data on 404', async () => {
  window.history.replaceState({}, '', `/projects/${project.id}`);
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ username: 'demo1' })).mockResolvedValueOnce(json(project));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<App/>);
  await screen.findByRole('heading', { name: project.name });
  expect(fetchMock.mock.calls[1][0]).toBe(`/api/projects/${project.id}`);
  expect(screen.getByRole('link', { name: 'Все проекты' }).getAttribute('href')).toBe('/');
  view.unmount();

  fetchMock.mockResolvedValueOnce(json({ username: 'demo2' })).mockResolvedValueOnce(new Response(null, { status: 404 }));
  render(<App/>);
  await screen.findByText('Проект не найден или у вас нет доступа.');
  expect(screen.queryByRole('heading', { name: project.name })).toBeNull();
});

test('discards the project view when the backend session has expired', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ username: 'demo1' }))
    .mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({}, 401));
  vi.stubGlobal('fetch', fetchMock);
  render(<App/>);
  await screen.findByRole('button', { name: 'Войти' });
  expect(screen.getByRole('alert').textContent).toBe('Сессия завершилась. Войдите снова.');
  expect(screen.queryByRole('heading', { name: 'Проекты' })).toBeNull();
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/auth/session', '/api/projects', '/api/auth/session']);
});

test.each([403, 409])('rechecks the account after a rejected create (%s) without retrying the write', async status => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ username: 'demo1' })).mockResolvedValueOnce(json([project]))
    .mockResolvedValueOnce(json(csrf)).mockResolvedValueOnce(json({}, status)).mockResolvedValueOnce(json({ username: 'demo2' }))
    .mockResolvedValueOnce(json([]));
  vi.stubGlobal('fetch', fetchMock);
  render(<App/>);
  fireEvent.change(await screen.findByLabelText('Название проекта'), { target: { value: 'Другой проект' } });
  fireEvent.click(screen.getByRole('button', { name: 'Создать проект' }));
  await screen.findByText('demo2');
  expect(screen.queryByRole('link', { name: project.name })).toBeNull();
  await screen.findByText('У вас пока нет доступных проектов. Создайте первый проект.');
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(fetchMock.mock.lastCall?.[1].headers).toEqual({ 'X-Expected-Username': 'demo2' });
});
