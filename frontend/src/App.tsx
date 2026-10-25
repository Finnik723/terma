import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'checking' | 'success' | 'error';
const messages: Record<Status, string> = {
  idle: 'Связь ещё не проверена',
  checking: 'Проверяем ответ backend…',
  success: 'Backend ответил на технический HTTP-запрос',
  error: 'Backend недоступен или вернул неожиданный ответ',
};

export function App() {
  const [status, setStatus] = useState<Status>('idle');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  async function checkConnection() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus('checking');
    // Race the request as well as aborting: a non-responsive transport must not leave the UI pending.
    let timer: ReturnType<typeof setTimeout>;
    try {
      const response = await Promise.race([
        fetch('/actuator/health/liveness', { signal: controller.signal, cache: 'no-store' }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Request timed out')); }, 5000);
        }),
      ]);
      if (!response.ok) throw new Error('HTTP check failed');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'UP') {
        throw new Error('Unexpected liveness response');
      }
      if (request.current === controller) setStatus('success');
    } catch {
      if (request.current === controller) setStatus('error');
    } finally {
      clearTimeout(timer!);
    }
  }

  return <main>
    <header><span className="brand">TERMA</span><span className="stage">Окружение разработки</span></header>
    <section className="intro"><p className="eyebrow">Термодинамическое моделирование</p>
      <h1>Технический каркас</h1><p>Научные расчёты недоступны. Этот экран проверяет только HTTP-связь с backend.</p></section>
    <section className="card" aria-labelledby="connection-title">
      <div><h2 id="connection-title">Связь с backend</h2><p>Ответ процесса не подтверждает готовность БД, брокера или расчётной подсистемы.</p></div>
      <p role="status" aria-live="polite" className={`status ${status}`}><span className="dot"/>{messages[status]}</p>
      <button onClick={checkConnection} disabled={status === 'checking'}>Проверить связь</button>
    </section>
    <section className="card" aria-labelledby="boundaries-title"><h2 id="boundaries-title">Границы проверки</h2>
      <dl><div><dt>PostgreSQL / Kafka</dt><dd>Не подключены / не проверены</dd></div>
        <div><dt>Worker</dt><dd>Не проверен из браузера</dd></div>
        <div><dt>Научная подсистема</dt><dd>Не реализована</dd></div></dl></section>
    <footer>Terma · Каркас приложения и окружение разработки</footer>
  </main>;
}
