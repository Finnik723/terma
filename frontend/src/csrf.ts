export async function csrfHeaders(signal: AbortSignal) {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) throw new Error('CSRF unavailable');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('headerName' in value) || value.headerName !== 'X-CSRF-TOKEN'
      || !('token' in value) || typeof value.token !== 'string') {
    throw new Error('Invalid CSRF response');
  }
  return { 'X-CSRF-TOKEN': value.token };
}
