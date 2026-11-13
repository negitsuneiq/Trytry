// URL helpers shared by the crawler and the HTTP client: registrable domains
// (rate-limit buckets), crawl scope matching and page-licence coverage.

/** Second-level labels that form a two-part public suffix under a 2-letter ccTLD (ac.uk, edu.au, co.jp …). */
const SECOND_LEVEL = new Set(['ac', 'co', 'edu', 'com', 'org', 'gov', 'net', 'or', 'ne', 'go', 'gv', 'sch', 'mil', 'ltd', 'plc', 'nhs', 'id']);

/** Last two labels of a host; last three under a two-part public suffix. IPs and single labels are returned as is. */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || !h.includes('.')) return h;
  const labels = h.split('.');
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const n = tld.length === 2 && SECOND_LEVEL.has(sld) && labels.length >= 3 ? 3 : 2;
  return labels.slice(-n).join('.');
}

/** Normalise scope entries so a bare origin gets its trailing slash. */
export function normaliseScope(list: string[]): string[] {
  return list.map((p) => new URL(p).href);
}

/** Prefix match on a URL boundary: scope "https://x.edu/math" matches "/math/…" but not "/mathematics" or "x.edu.evil". */
export function inScope(u: URL, scope: string[]): boolean {
  return scope.some((p) => {
    if (!u.href.startsWith(p)) return false;
    if (p.endsWith('/')) return true;
    const next = u.href[p.length];
    return next === undefined || next === '/' || next === '?' || next === '#';
  });
}

/** True when the URL's registrable domain is the registrable domain of some scope entry. */
export function sharesScopeDomain(u: URL, scope: string[]): boolean {
  const d = registrableDomain(u.hostname);
  return scope.some((p) => registrableDomain(new URL(p).hostname) === d);
}

/** A course page's licence may only cover files on the same origin under the page's own directory (never the site root). */
export function pageCovers(page: URL, file: URL): boolean {
  if (page.origin !== file.origin) return false;
  const dir = page.pathname.slice(0, page.pathname.lastIndexOf('/') + 1);
  if (dir === '/' || dir === '') return false;
  return file.pathname.startsWith(dir);
}
