import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../src/App';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const button = () => screen.getByRole('button', { name: 'Проверить связь' });
const response = (body: string, status = 200) => new Response(body, { status });

test('initial state does not claim a successful check', () => {
  render(<App/>);
  expect(screen.getByRole('status').textContent).toContain('ещё не проверена');
  expect(screen.getByText('Не проверяются этим экраном')).toBeTruthy();
});

test('accepts UP only from a successful HTTP response and keeps infrastructure unverified', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response('{"status":"UP"}'));
  vi.stubGlobal('fetch', fetchMock);
  render(<App/>);
  fireEvent.click(button());
  await screen.findByText('Backend ответил на технический HTTP-запрос');
  expect(fetchMock.mock.calls[0][0]).toBe('/actuator/health/liveness');
  expect(screen.getByText('Не проверяются этим экраном')).toBeTruthy();
  expect(screen.getByText('Не проверен из браузера')).toBeTruthy();
});

test.each([
  ['HTTP failure', () => Promise.resolve(response('{"status":"UP"}', 503))],
  ['unexpected status', () => Promise.resolve(response('{"status":"DOWN"}'))],
  ['malformed body', () => Promise.resolve(response('not-json'))],
  ['network failure', () => Promise.reject(new Error('unavailable'))],
])('reports %s without success', async (_name, result) => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(result));
  render(<App/>);
  fireEvent.click(button());
  await screen.findByText('Backend недоступен или вернул неожиданный ответ');
});

test('shows waiting and times out even when the transport never resolves', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
  render(<App/>);
  fireEvent.click(button());
  expect((button() as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Проверяем');
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByRole('status').textContent).toContain('Backend недоступен');
  expect((button() as HTMLButtonElement).disabled).toBe(false);
});

test('clears previous success as soon as another check starts', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response('{"status":"UP"}'))
    .mockRejectedValueOnce(new Error('stopped'));
  vi.stubGlobal('fetch', fetchMock);
  render(<App/>);
  fireEvent.click(button());
  await screen.findByText('Backend ответил на технический HTTP-запрос');
  fireEvent.click(button());
  expect(screen.queryByText('Backend ответил на технический HTTP-запрос')).toBeNull();
  await screen.findByText('Backend недоступен или вернул неожиданный ответ');
});
