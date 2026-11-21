import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { csrfHeaders } from './csrf';

type Project = { id: string; name: string; createdBy: string; createdAt: string; updatedAt: string };
type Resource<T> = { status: 'loading' | 'missing' | 'failed' } | { status: 'ready'; data: T };
type Submission = { status: 'idle' | 'pending' } | { status: 'failed'; message: string };
type Props = { username: string; onSessionChanged: () => void };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dates = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const invalidName = 'Введите название длиной от 1 до 120 символов без управляющих символов.';
const missingProject = 'Проект не найден или у вас нет доступа.';
const expectedUsername = 'X-Expected-Username';

function projectData(value: unknown): Project {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !uuid.test(value.id)
      || !('name' in value) || typeof value.name !== 'string' || !('createdBy' in value) || typeof value.createdBy !== 'string'
      || !('createdAt' in value) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || !('updatedAt' in value) || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error('Unexpected project response');
  }
  return { id: value.id, name: value.name, createdBy: value.createdBy, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

function projectListData(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Unexpected project list');
  return value.map(projectData);
}

function useProjectResource<T>(url: string, parse: (value: unknown) => T, { username, onSessionChanged }: Props) {
  const [resource, setResource] = useState<Resource<T>>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    async function load() {
      try {
        const response = await fetch(url, {
          credentials: 'same-origin', cache: 'no-store', signal, headers: { [expectedUsername]: username },
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 409) {
          onSessionChanged();
          return;
        }
        if (response.status === 404) {
          setResource({ status: 'missing' });
          return;
        }
        if (!response.ok) throw new Error('Project request failed');
        const data = parse(await response.json());
        if (!controller.signal.aborted) setResource({ status: 'ready', data });
      } catch {
        if (!controller.signal.aborted) setResource({ status: 'failed' });
      }
    }
    void load();
    return () => controller.abort();
  }, [url, parse, username, onSessionChanged, revision]);

  function reload() {
    setResource({ status: 'loading' });
    setRevision(previous => previous + 1);
  }

  return { resource, reload };
}

function ProjectList(props: Props) {
  const { username, onSessionChanged } = props;
  const { resource, reload } = useProjectResource('/api/projects', projectListData, props);
  const [name, setName] = useState('');
  const [submission, setSubmission] = useState<Submission>({ status: 'idle' });
  const active = useRef<AbortController | null>(null);
  const attempt = useRef<{ name: string; key: string } | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || resource.status !== 'ready') return;
    const normalized = name.replace(/^\p{White_Space}+|(?<!\p{White_Space})\p{White_Space}+$/gu, '');
    if (!normalized || Array.from(normalized).length > 120 || /[\p{Cc}\p{Cs}]/u.test(normalized)) {
      setSubmission({ status: 'failed', message: invalidName });
      return;
    }

    const controller = new AbortController();
    active.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    setSubmission({ status: 'pending' });
    let submitted = false;
    try {
      const headers = await csrfHeaders(signal);
      const key = attempt.current?.name === normalized ? attempt.current.key : crypto.randomUUID();
      attempt.current = { name: normalized, key };
      submitted = true;
      const response = await fetch('/api/projects', {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { ...headers, 'Content-Type': 'application/json', [expectedUsername]: username, 'Idempotency-Key': key },
        body: JSON.stringify({ name: normalized }),
      });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403 || response.status === 409) {
        onSessionChanged();
      } else if (response.status === 400) {
        setSubmission({ status: 'failed', message: invalidName });
      } else if (response.status === 404) {
        setSubmission({ status: 'failed', message: missingProject });
      } else if (response.status === 201) {
        attempt.current = null;
        setName('');
        setSubmission({ status: 'idle' });
        reload();
      } else {
        throw new Error('Project creation failed');
      }
    } catch {
      if (!controller.signal.aborted) {
        setSubmission({ status: 'failed', message: submitted
          ? 'Не удалось подтвердить создание. Проверьте соединение и повторите отправку.'
          : 'Не удалось отправить запрос. Проверьте соединение.' });
      }
    } finally {
      active.current = null;
    }
  }

  return <section className="card project-workspace" aria-labelledby="projects-title">
    <h1 id="projects-title">Проекты</h1>
    {resource.status === 'loading' && <p role="status">Загружаем проекты…</p>}
    {(resource.status === 'failed' || resource.status === 'missing') && <>
      <p role="alert">Не удалось загрузить проекты. Проверьте соединение.</p>
      <button type="button" onClick={reload}>Повторить загрузку</button>
    </>}
    {resource.status === 'ready' && (resource.data.length === 0
      ? <p>У вас пока нет доступных проектов. Создайте первый проект.</p>
      : <ul className="project-list" aria-label="Доступные проекты">
        {resource.data.map(project => <li key={project.id}>
          <a href={`/projects/${project.id}`}>{project.name}</a>
          <span>Автор: {project.createdBy}</span>
          <span>Изменён <time dateTime={project.updatedAt}>{dates.format(new Date(project.updatedAt))}</time></span>
        </li>)}
      </ul>)}
    {resource.status === 'ready' && <form className="project-form" onSubmit={create}>
      <label htmlFor="project-name">Название проекта</label>
      <input id="project-name" name="name" required value={name} aria-describedby="project-name-hint"
        disabled={submission.status === 'pending'} onChange={event => setName(event.target.value)}/>
      <p id="project-name-hint">От 1 до 120 символов</p>
      {submission.status === 'failed' && <p role="alert">{submission.message}</p>}
      <button type="submit" disabled={submission.status === 'pending'}>
        {submission.status === 'pending' ? 'Создаём…' : 'Создать проект'}
      </button>
    </form>}
  </section>;
}

function ProjectDetail({ id, ...props }: Props & { id: string }) {
  const { resource, reload } = useProjectResource(`/api/projects/${id}`, projectData, props);
  return <>
    <a className="project-back" href="/">Все проекты</a>
    <section className="card project-workspace" aria-labelledby="project-title">
      <h1 id="project-title">{resource.status === 'ready' ? resource.data.name : 'Проект'}</h1>
      {resource.status === 'loading' && <p role="status">Открываем проект…</p>}
      {resource.status === 'missing' && <p role="alert">{missingProject}</p>}
      {resource.status === 'failed' && <>
        <p role="alert">Не удалось открыть проект. Проверьте соединение.</p>
        <button type="button" onClick={reload}>Повторить загрузку</button>
      </>}
      {resource.status === 'ready' && <dl>
        <div><dt>Автор</dt><dd>{resource.data.createdBy}</dd></div>
        <div><dt>Создан</dt><dd><time dateTime={resource.data.createdAt}>{dates.format(new Date(resource.data.createdAt))}</time></dd></div>
        <div><dt>Изменён</dt><dd><time dateTime={resource.data.updatedAt}>{dates.format(new Date(resource.data.updatedAt))}</time></dd></div>
      </dl>}
    </section>
  </>;
}

export function ProjectWorkspace(props: Props) {
  const path = window.location.pathname;
  if (path === '/' || path === '/projects' || path === '/projects/') return <ProjectList {...props}/>;
  const id = /^\/projects\/([^/]+)\/?$/.exec(path)?.[1];
  if (id && uuid.test(id)) return <ProjectDetail id={id} {...props}/>;
  return <>
    <a className="project-back" href="/">Все проекты</a>
    <section className="card project-workspace" aria-labelledby="project-title">
      <h1 id="project-title">Проект</h1>
      <p role="alert">{missingProject}</p>
    </section>
  </>;
}
