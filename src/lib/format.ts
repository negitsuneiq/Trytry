import type { Lang } from '../i18n/strings';

/** File size with the language's decimal separator ("3,1 MB" / "3.1 MB"). */
export function bytes(n: number | null, lang: Lang = 'en'): string {
  if (n == null) return '—';
  const loc = lang === 'tr' ? 'tr-TR' : 'en-GB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024).toLocaleString(loc)} KB`;
  return `${(n / 1024 ** 2).toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

/**
 * The course year of a document, or null. The crawler falls back to the year it
 * accessed the page when it finds none, so a year equal to the access year is
 * not a real course year and is never shown.
 */
export function realYear(year: number | null | undefined, accessedAt: string | null | undefined): number | null {
  if (!year) return null;
  if (accessedAt && year === Number(accessedAt.slice(0, 4))) return null;
  return year;
}

/** "2019" or "2014–2019" over the real years of some documents; null when there are none. */
export function yearRange(docs: { year: number | null; accessed_at: string }[]): string | null {
  const ys = docs.map((d) => realYear(d.year, d.accessed_at)).filter((y): y is number => y != null);
  if (!ys.length) return null;
  const [a, b] = [Math.min(...ys), Math.max(...ys)];
  return a === b ? String(a) : `${a}–${b}`;
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
