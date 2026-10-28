import type { Lang } from '../i18n/strings';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Base-aware absolute path for a static asset in public/. */
export function asset(path: string): string {
  return `${BASE}/${path.replace(/^\//, '')}`;
}

/** Base- and language-aware link, always with a trailing slash. */
export function href(lang: Lang, path = ''): string {
  const p = path.replace(/^\/|\/$/g, '');
  return `${BASE}/${lang}/${p ? p + '/' : ''}`;
}

/** Same page in the other language. */
export function swapLang(pathname: string, to: Lang): string {
  // The 404 page exists once, not per language: switch to that language's home.
  const rest = pathname
    .slice(BASE.length)
    .replace(/^\/(en|tr)(?=\/|$)/, '')
    .replace(/^\/404(?:\.html)?\/?$/, '');
  return `${BASE}/${to}${rest || '/'}`;
}
