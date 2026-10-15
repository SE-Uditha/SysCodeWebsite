/** Public project media URLs only; never use these values for a server-side fetch. */
export function isSafeProjectMediaUrl(value: string): boolean {
  if (!value) return true;
  if (value.length > 2048 || /[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
