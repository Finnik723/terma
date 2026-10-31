import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

type Session = { username: string };
type Csrf = { headerName: string; token: string };
type Identity = { status: 'unknown' } | { status: 'anonymous' } | { status: 'authenticated'; session: Session };
type Operation = { status: 'idle' } | { status: 'pending' } | { status: 'failed'; message: string };

// Neither credentials nor the CSRF token are persisted in browser storage.
export function AuthPanel() {
  const [identity, setIdentity] = useState<Identity>({ status: 'unknown' });
  const [operation, setOperation] = useState<Operation>({ status: 'pending' });
  const busy = operation.status === 'pending';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const active = useRef<AbortController | null>(null);

  function acceptSession(session: Session | null) {
    setIdentity(session ? { status: 'authenticated', session } : { status: 'anonymous' });
  }

  async function readSession(signal: AbortSignal) {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('Session unavailable');
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || !('username' in value) || typeof value.username !== 'string') {
      throw new Error('Unexpected session');
    }
    return { username: value.username };
  }

  async function restore() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setOperation({ status: 'pending' });
    try {
      const current = await readSession(AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
      if (!controller.signal.aborted) {
        acceptSession(current);
        setOperation({ status: 'idle' });
      }
    } catch {
      if (!controller.signal.aborted) {
        setIdentity({ status: 'unknown' });
        setOperation({ status: 'failed', message: 'Не удалось проверить сессию. Проверьте соединение.' });
      }
    }
  }

  useEffect(() => {
    void restore();
    return () => { active.current?.abort(); };
  }, []);

  async function mutate(action: 'login' | 'logout') {
    if (busy) return;
    setOperation({ status: 'pending' });
    const controller = new AbortController();
    active.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    try {
      // Obtain a fresh token before each mutation: login/logout rotate the session/token.
      const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store', signal });
      if (!tokenResponse.ok) throw new Error('CSRF unavailable');
      const csrf = await tokenResponse.json() as Csrf;
      if (csrf.headerName !== 'X-CSRF-TOKEN' || typeof csrf.token !== 'string') throw new Error('Invalid CSRF response');
      const response = await fetch(`/api/auth/${action}`, {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { [csrf.headerName]: csrf.token, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: action === 'login' ? new URLSearchParams({ username, password }) : undefined,
      });
      if (action === 'login') setPassword('');
      if (response.status === 401 && action === 'login') {
        acceptSession(null);
        setOperation({ status: 'failed', message: 'Неверное имя пользователя или пароль' }); return;
      }
      if (response.status === 403) {
        // Reconcile a session changed/expired in another tab. Never retry credentials automatically.
        acceptSession(await readSession(signal));
        setOperation({ status: 'failed', message: 'Сессия изменилась. Повторите действие.' }); return;
      }
      if (response.status !== 204) throw new Error('Authentication request failed');
      const current = await readSession(signal);
      if (!controller.signal.aborted) {
        acceptSession(current);
        setOperation({ status: 'idle' });
      }
    } catch {
      if (!controller.signal.aborted) {
        setIdentity({ status: 'unknown' });
        setOperation({ status: 'failed', message: 'Не удалось подтвердить состояние сессии. Проверьте соединение.' });
      }
    } finally {
      if (!controller.signal.aborted) setPassword('');
    }
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate('login');
  }

  return <section className="card" aria-labelledby="auth-title">
    <h2 id="auth-title">Учётная запись</h2>
    {identity.status === 'unknown' && (busy
      ? <p>Проверяем сессию…</p>
      : <><p>Состояние сессии недоступно</p><button onClick={() => void restore()}>Повторить проверку сессии</button></>)}
    {identity.status === 'authenticated' &&
      <div className="session"><p>Вы вошли как <strong>{identity.session.username}</strong></p>
          <button disabled={busy} onClick={() => void mutate('logout')}>Выйти</button></div>
    }
    {identity.status === 'anonymous' && <form onSubmit={login}>
          <p>Вход для заранее созданных учётных записей</p>
          <label htmlFor="username">Имя пользователя</label>
          <input id="username" name="username" autoComplete="username" required maxLength={64} value={username}
            disabled={busy} onChange={event => setUsername(event.target.value)}/>
          <label htmlFor="password">Пароль</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required value={password}
            disabled={busy} onChange={event => setPassword(event.target.value)}/>
          <button disabled={busy} type="submit">{busy ? 'Входим…' : 'Войти'}</button>
        </form>}
    {operation.status === 'failed' && <p role="alert">{operation.message}</p>}
  </section>;
}
