import type { Lang } from '../i18n/strings';

export function bytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function date(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function country(code: string, lang: Lang): string {
  try {
    return new Intl.DisplayNames([lang === 'tr' ? 'tr' : 'en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

export function authorsLine(a: string[]): string {
  if (a.length <= 2) return a.join(' & ');
  return `${a.slice(0, -1).join(', ')} & ${a.at(-1)}`;
}
