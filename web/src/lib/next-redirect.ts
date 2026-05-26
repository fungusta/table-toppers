/**
 * Returns `raw` only if it is a same-origin relative path starting with `/`.
 * Defaults to `/`. Rejects:
 *   - null / empty
 *   - anything not starting with `/`
 *   - protocol-relative `//evil.com/...`
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}
