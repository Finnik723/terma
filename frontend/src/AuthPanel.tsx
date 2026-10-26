import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

type Session = { username: string };
type Csrf = { headerName: string; token: string };

// Neither credentials nor the CSRF token are persisted in browser storage.
export function AuthPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const active = useRef<AbortController | null>(null);

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
    setState('loading');
    setError('');
    try {
      const current = await readSession(AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
      if (!controller.signal.aborted) { setSession(current); setState('ready'); }
    } catch {
      if (!controller.signal.aborted) setState('error');
    }
  }

  useEffect(() => {
    void restore();
    return () => { active.current?.abort(); };
  }, []);

  async function mutate(action: 'login' | 'logout') {
    if (busy) return;
    setBusy(true);
    setError('');
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
        setSession(null); setError('Неверное имя пользователя или пароль'); return;
      }
      if (response.status === 403) {
        // Reconcile a session changed/expired in another tab. Never retry credentials automatically.
        setSession(await readSession(signal));
        setError('Сессия изменилась. Повторите действие.'); return;
      }
      if (response.status !== 204) throw new Error('Authentication request failed');
      setSession(await readSession(signal));
    } catch {
      if (!controller.signal.aborted) {
        setError('Не удалось подтвердить состояние сессии. Проверьте соединение.');
        setState('error');
      }
    } finally {
      if (!controller.signal.aborted) { setPassword(''); setBusy(false); }
    }
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate('login');
  }

  return <section className="card" aria-labelledby="auth-title">
    <h2 id="auth-title">Учётная запись</h2>
    {state === 'loading' && <p>Проверяем сессию…</p>}
    {state === 'error' && <><p role="alert">Состояние сессии недоступно</p><button onClick={() => void restore()}>Повторить проверку сессии</button></>}
    {state === 'ready' && (session
      ? <div className="session"><p>Вы вошли как <strong>{session.username}</strong></p>
          <button disabled={busy} onClick={() => void mutate('logout')}>Выйти</button></div>
      : <form onSubmit={login}>
          <p>Вход для заранее созданных учётных записей</p>
          <label htmlFor="username">Имя пользователя</label>
          <input id="username" name="username" autoComplete="username" required maxLength={64} value={username}
            disabled={busy} onChange={event => setUsername(event.target.value)}/>
          <label htmlFor="password">Пароль</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required value={password}
            disabled={busy} onChange={event => setPassword(event.target.value)}/>
          <button disabled={busy} type="submit">{busy ? 'Входим…' : 'Войти'}</button>
        </form>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
