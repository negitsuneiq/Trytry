// Polite HTTP client shared by the crawler and the link checker.
//
// - Identifies itself with a descriptive User-Agent.
// - Obeys robots.txt (including Crawl-delay) for every host it touches.
// - At most one request per host every MIN_INTERVAL_MS (2 s), across all callers.
// - Follows redirects by hand so every hop is checked against robots.txt and
//   the login/LMS deny list. Nothing behind a login is ever requested.
//
// Behind an HTTPS proxy, run Node with NODE_USE_ENV_PROXY=1 so fetch uses it.

import { createRequire } from 'node:module';

interface Robots {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getCrawlDelay(ua?: string): number | undefined;
}
// robots-parser is CommonJS (module.exports = fn); require it directly so the
// call signature is right under NodeNext resolution.
const robotsParser: (url: string, txt: string) => Robots = createRequire(import.meta.url)('robots-parser');

export const USER_AGENT = 'OpenLemmaBot/1.0 (+https://github.com/negitsuneiq/Trytry; non-commercial open-course-material index)';
export const BOT_TOKEN = 'OpenLemmaBot';
const MIN_INTERVAL_MS = Number(process.env.OL_MIN_INTERVAL_MS ?? 2000);
const TIMEOUT_MS = 30_000;
const TRANSFER_TIMEOUT_MS = 5 * 60_000;
const MAX_REDIRECTS = 6;

/** Hosts and paths that are learning-management systems, SSO or student portals. */
const DENY_HOST = [
  /(^|\.)instructure\.com$/,
  /(^|\.)canvas\./,
  /^canvas\b/,
  /(^|\.)moodle\./,
  /^moodle\b/,
  /(^|\.)blackboard\./,
  /^blackboard\b/,
  /(^|\.)learn\.[a-z0-9-]+\.(edu|ac\.uk|ch|fr)$/,
  /(^|\.)piazza\.com$/,
  /(^|\.)gradescope\.com$/,
  /(^|\.)edstem\.org$/,
  /(^|\.)courseworks\./,
  /(^|\.)stellar\.mit\.edu$/,
  /(^|\.)canvas\.mit\.edu$/,
  /(^|\.)vle\./,
  /(^|\.)weblearn\./,
  /(^|\.)myuni\./,
  /(^|\.)sso\./,
  /(^|\.)login\./,
  /(^|\.)idp\./,
  /(^|\.)shibboleth\./,
  /(^|\.)cas\./,
  /(^|\.)okta\.com$/,
  /(^|\.)microsoftonline\.com$/,
  /(^|\.)accounts\.google\.com$/,
  /(^|\.)drive\.google\.com$/,
  /(^|\.)docs\.google\.com$/,
  /(^|\.)dropbox\.com$/,
  /(^|\.)jstor\.org$/,
  /(^|\.)springer\.com$/,
  /(^|\.)sciencedirect\.com$/,
  /(^|\.)wiley\.com$/,
  /(^|\.)cambridge\.org$/,
  /(^|\.)oup\.com$/,
  /(^|\.)ams\.org$/,
];

const DENY_PATH = /\/(login|logon|signin|sign-in|sso|saml|shibboleth|auth|oauth|cas\/login|idp|webauth|user\/login|accounts?\/login|portal|my\.|intranet|internal|private|restricted|wp-admin|wp-login)(\/|\.|\?|$)/i;

export function isDenied(u: URL): string | null {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'non-http scheme';
  if (u.username || u.password) return 'credentials in URL';
  const host = u.hostname.toLowerCase();
  for (const re of DENY_HOST) if (re.test(host)) return `deny-listed host (${host})`;
  if (DENY_PATH.test(u.pathname + u.search)) return 'login/portal path';
  return null;
}

const robotsCache = new Map<string, Promise<Robots | null>>();
const nextSlot = new Map<string, number>();
const crawlDelay = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reserve the next request slot for a host; serialises per host. */
async function throttle(origin: string) {
  const interval = Math.max(MIN_INTERVAL_MS, (crawlDelay.get(origin) ?? 0) * 1000);
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(origin) ?? 0);
  nextSlot.set(origin, at + interval);
  if (at > now) await sleep(at - now);
}

async function rawFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  // Headers must arrive within TIMEOUT_MS. The body keeps the same signal, so
  // a download that stalls is aborted at TRANSFER_TIMEOUT_MS instead of hanging.
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  setTimeout(() => ctrl.abort(), TRANSFER_TIMEOUT_MS).unref();
  try {
    return await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', 'Accept-Language': 'en', ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function robotsFor(origin: string): Promise<Robots | null> {
  let p = robotsCache.get(origin);
  if (!p) {
    p = (async () => {
      const url = `${origin}/robots.txt`;
      await throttle(origin);
      try {
        const res = await rawFetch(url);
        // 4xx: no robots.txt → allowed. 5xx/network: be conservative → disallow all.
        if (res.status >= 500) return robotsParser(url, 'User-agent: *\nDisallow: /');
        const text = res.status === 200 ? await res.text() : '';
        const r = robotsParser(url, text);
        const d = r.getCrawlDelay(BOT_TOKEN);
        if (d) crawlDelay.set(origin, Math.min(d, 30));
        return r;
      } catch {
        return robotsParser(url, 'User-agent: *\nDisallow: /');
      }
    })();
    robotsCache.set(origin, p);
  }
  return p;
}

export async function robotsAllows(u: URL): Promise<boolean> {
  const r = await robotsFor(u.origin);
  return r ? r.isAllowed(u.href, BOT_TOKEN) !== false : true;
}

export interface PoliteResponse {
  ok: boolean;
  status: number;
  finalUrl: string;
  redirected: boolean;
  contentType: string;
  contentLength: number | null;
  /** Present when the request was refused locally (robots, deny list, loop). */
  blocked?: string;
  res?: Response;
}

/**
 * GET (or HEAD) a URL politely. The caller must consume or cancel `res.body`.
 */
export async function politeFetch(url: string, opts: { method?: 'GET' | 'HEAD'; headers?: Record<string, string> } = {}): Promise<PoliteResponse> {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const denied = isDenied(current);
    if (denied) return blocked(url, current, denied, hop > 0);
    if (!(await robotsAllows(current))) return blocked(url, current, 'disallowed by robots.txt', hop > 0);
    await throttle(current.origin);
    let res: Response;
    try {
      res = await rawFetch(current.href, { method: opts.method ?? 'GET', headers: opts.headers });
    } catch (e) {
      return { ok: false, status: 0, finalUrl: current.href, redirected: hop > 0, contentType: '', contentLength: null, blocked: `network: ${(e as Error).message}` };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel();
      current = new URL(res.headers.get('location')!, current);
      continue;
    }
    const len = res.headers.get('content-length');
    return {
      ok: res.status === 200,
      status: res.status,
      finalUrl: current.href,
      redirected: hop > 0,
      contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
      contentLength: len ? Number(len) : null,
      res,
    };
  }
  return blocked(url, current, 'too many redirects', true);
}

function blocked(_orig: string, at: URL, why: string, redirected: boolean): PoliteResponse {
  return { ok: false, status: 0, finalUrl: at.href, redirected, contentType: '', contentLength: null, blocked: why };
}

/** Read a body up to `limit` bytes; returns null if it is larger. */
export async function readCapped(res: Response, limit: number): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > limit) {
      await res.body.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
