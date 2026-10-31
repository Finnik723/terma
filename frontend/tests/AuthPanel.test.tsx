import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AuthPanel } from '../src/AuthPanel';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const token = { headerName: 'X-CSRF-TOKEN', token: 'masked-token' };
async function fillLogin() {
  await screen.findByRole('button', { name: 'Войти' });
  fireEvent.change(screen.getByLabelText('Имя пользователя'), { target: { value: 'demo1' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'ephemeral-ui-input' } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
}

test('restores an existing session on mount and logs out with a fresh CSRF token', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response({ username: 'demo2' }))
    .mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(null, 204))
    .mockResolvedValueOnce(response(null, 401));
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthPanel/>);
  expect(screen.getByText('Проверяем сессию…')).toBeTruthy();
  await screen.findByText('demo2');
  fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
  await screen.findByRole('button', { name: 'Войти' });
  expect(fetchMock.mock.calls[2][0]).toBe('/api/auth/logout');
  expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-TOKEN': token.token } });
});

test('anonymous login sends CSRF and restores server identity, then re-mount reads the session again', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response(null, 401))
    .mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(null, 204))
    .mockImplementation(() => Promise.resolve(response({ username: 'demo1' })));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<AuthPanel/>);
  await fillLogin();
  await screen.findByText('demo1');
  expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-TOKEN': token.token } });
  expect(String(fetchMock.mock.calls[2][1].body)).toBe('username=demo1&password=ephemeral-ui-input');
  view.unmount();
  render(<AuthPanel/>);
  await screen.findByText('demo1');
  expect(fetchMock.mock.lastCall?.[0]).toBe('/api/auth/session');
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test('wrong password stays anonymous and clears the password field', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(null, 401))
    .mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(null, 401)));
  render(<AuthPanel/>);
  await fillLogin();
  await screen.findByText('Неверное имя пользователя или пароль');
  expect((screen.getByLabelText('Пароль') as HTMLInputElement).value).toBe('');
  expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull();
});

test('expired session/CSRF reconciles identity without resubmitting the password', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response(null, 401))
    .mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(null, 403))
    .mockResolvedValueOnce(response(null, 401));
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthPanel/>);
  await fillLogin();
  await screen.findByText('Сессия изменилась. Повторите действие.');
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect((screen.getByLabelText('Пароль') as HTMLInputElement).value).toBe('');
});

test('network failure during restore can be retried without showing a false login state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(null, 401)));
  render(<AuthPanel/>);
  await screen.findByText('Состояние сессии недоступно');
  expect(screen.queryByRole('button', { name: 'Войти' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить проверку сессии' }));
  await screen.findByRole('button', { name: 'Войти' });
});

test('failed logout never claims that the server invalidated the session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ username: 'demo1' }))
    .mockResolvedValueOnce(response(token)).mockRejectedValueOnce(new Error('offline')));
  render(<AuthPanel/>);
  fireEvent.click(await screen.findByRole('button', { name: 'Выйти' }));
  await screen.findByText('Состояние сессии недоступно');
  expect(screen.queryByRole('button', { name: 'Войти' })).toBeNull();
});

test('blocks double submission while the login request is pending', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(null, 401))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(response(null, 401)));
  render(<AuthPanel/>);
  await fillLogin();
  expect((screen.getByRole('button', { name: 'Входим…' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish(response(token)));
  await waitFor(() => expect(screen.getByText('Неверное имя пользователя или пароль')).toBeTruthy());
});

test.each([
  { action: 'login', failure: 'post', authenticated: true },
  { action: 'login', failure: 'session', authenticated: true },
  { action: 'login', failure: 'post', authenticated: false },
  { action: 'logout', failure: 'post', authenticated: false },
  { action: 'logout', failure: 'session', authenticated: false },
  { action: 'logout', failure: 'post', authenticated: true },
])('restores actual identity after uncertain $action ($failure failure, authenticated=$authenticated)', async ({ action, failure, authenticated }) => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response(action === 'login' ? null : { username: 'demo1' }, action === 'login' ? 401 : 200))
    .mockResolvedValueOnce(response(token));
  if (failure === 'post') fetchMock.mockRejectedValueOnce(new Error('response lost'));
  else fetchMock.mockResolvedValueOnce(response(null, 204)).mockRejectedValueOnce(new Error('session read failed'));
  fetchMock.mockResolvedValueOnce(response(authenticated ? { username: 'demo1' } : null, authenticated ? 200 : 401));
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthPanel/>);
  if (action === 'login') await fillLogin();
  else fireEvent.click(await screen.findByRole('button', { name: 'Выйти' }));
  await screen.findByText('Состояние сессии недоступно');
  expect(screen.queryByRole('button', { name: 'Войти' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить проверку сессии' }));
  await screen.findByRole('button', { name: authenticated ? 'Выйти' : 'Войти' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText('Состояние сессии недоступно')).toBeNull();
  expect(fetchMock.mock.lastCall?.[0]).toBe('/api/auth/session');
  expect(fetchMock.mock.calls.filter(([path]) => path === `/api/auth/${action}`)).toHaveLength(1);
  if (!authenticated) expect((screen.getByLabelText('Пароль') as HTMLInputElement).value).toBe('');

  // The next explicit mutation also completes normally: no stale failed/pending state.
  fetchMock.mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(null, 204))
    .mockResolvedValueOnce(response(authenticated ? null : { username: 'demo1' }, authenticated ? 401 : 200));
  if (authenticated) fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
  else await fillLogin();
  await screen.findByRole('button', { name: authenticated ? 'Войти' : 'Выйти' });
  expect(screen.queryByRole('alert')).toBeNull();
});
