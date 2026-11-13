// Polite HTTP client shared by the crawler and the link checker.
//
// - Identifies itself with a descriptive User-Agent.
// - Obeys robots.txt (including Crawl-delay) for every host it touches.
//   robots.txt redirects are followed; 401/403/429, 5xx, timeouts and
//   unresolved redirects mean "disallow everything" (retried, and re-tried
//   after 10 minutes); only 404/410 and other plain 4xx mean "no robots.txt".
// - At most one request per registrable domain every MIN_INTERVAL_MS (2 s),
//   across all callers; scheme, port and subdomain do not create new buckets.
// - Follows redirects by hand so every hop is checked against robots.txt and
//   the login/LMS deny list. Nothing behind a login is ever requested.
// - Never throws on network trouble: failures come back as `blocked`.
//
// Behind an HTTPS proxy, run Node with NODE_USE_ENV_PROXY=1 so fetch uses it.

import { createRequire } from 'node:module';
import { registrableDomain } from './scope.ts';

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
const ROBOTS_RETRY_MS = Number(process.env.OL_ROBOTS_RETRY_MS ?? 5000);
const ROBOTS_FAIL_TTL_MS = 10 * 60_000;
const MAX_CRAWL_DELAY_S = 60;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 6;

/** Hosts that are learning-management systems, SSO, student portals, shared drives or paywalls. */
const DENY_HOST = [
  /(^|\.)instructure\.com$/,
  /(^|\.)canvas\./,
  /^canvas\b/,
  /(^|\.)moodle\./,
  /^moodle\b/,
  /(^|\.)blackboard\./,
  /^blackboard\b/,
  /(^|\.)learn\.(?:[a-z0-9-]+\.)+(?:edu|ac\.[a-z]{2}|edu\.[a-z]{2}|ch|fr|de|nl)$/,
  /(^|\.)d2l\.com$/,
  /(^|\.)brightspace\./,
  /(^|\.)(?:sakai|ctools)\./,
  /(^|\.)(?:lms|elearning|e-learning|ulearn|ilearn)\./,
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
  /(^|\.)(?:auth|authn|shib|shibboleth|cosign|adfs|weblogin|webauth)\./,
  /(^|\.)idp\./,
  /(^|\.)cas\./,
  /(^|\.)okta\.com$/,
  /(^|\.)microsoftonline\.com$/,
  /(^|\.)sharepoint\.com$/,
  /(^|\.)onedrive\.live\.com$/,
  /(^|\.)1drv\.ms$/,
  /(^|\.)box\.com$/,
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

/** Path segments that mean login, SSO, portals or restricted areas. An extension other than .pdf is ignored ("Login.aspx"); "internal.pdf" is a file, not an area. */
const DENY_SEGMENT = new Set([
  'login', 'logon', 'signin', 'sign-in', 'sign_in', 'log-in', 'log_in', 'sso', 'saml', 'saml2', 'shibboleth', 'oauth', 'oauth2', 'auth', 'authn', 'cas',
  'idp', 'webauth', 'cosign', 'pubcookie', 'adfs', 'portal', 'intranet', 'internal', 'private', 'restricted', 'wp-admin', 'wp-login', 'cookieauth',
]);
/** LMS-specific URL shapes (Moodle, Blackboard, D2L, Canvas and Sakai on custom domains). */
const DENY_PATH = /\/(?:pluginfile\.php|mod\/(?:resource|folder|page|url|assign)\/|course\/view\.php|webapps\/|d2l\/|courses\/\d+\/(?:files|modules|assignments|pages|quizzes)|portal\/site\/)/i;
const DENY_QUERY_KEYS = ['SAMLRequest', 'SAMLResponse', 'RelayState', 'service', 'redirect_uri', 'wa', 'wtrealm'];

export function isDenied(u: URL): string | null {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'non-http scheme';
  if (u.username || u.password) return 'credentials in URL';
  const host = u.hostname.toLowerCase();
  for (const re of DENY_HOST) if (re.test(host)) return `deny-listed host (${host})`;
  for (const seg of u.pathname.split('/')) {
    const base = seg.toLowerCase().replace(/\.(?!pdf$)[a-z0-9]{2,5}$/, '');
    if (DENY_SEGMENT.has(base)) return 'login/portal path';
  }
  if (DENY_PATH.test(u.pathname)) return 'LMS path';
  for (const k of DENY_QUERY_KEYS) if (u.searchParams.has(k)) return 'login/SSO query';
  return null;
}

// ------------------------------------------------------------------ throttling

const nextSlot = new Map<string, number>();
const crawlDelay = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reserve the next request slot for a registrable domain; serialises per domain. */
async function throttle(u: URL) {
  const key = registrableDomain(u.hostname);
  const interval = Math.max(MIN_INTERVAL_MS, (crawlDelay.get(key) ?? 0) * 1000);
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(key) ?? 0);
  nextSlot.set(key, at + interval);
  if (at > now) await sleep(at - now);
}

async function rawFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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

// ------------------------------------------------------------------ robots.txt

interface RobotsResult {
  robots: Robots;
  failed: boolean;
}
const robotsCache = new Map<string, { p: Promise<RobotsResult>; at: number; failed: boolean }>();

const denyAll = (url: string) => robotsParser(url, 'User-agent: *\nDisallow: /');
const allowAll = (url: string) => robotsParser(url, '');

async function fetchRobots(origin: string): Promise<RobotsResult> {
  const url = `${origin}/robots.txt`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(ROBOTS_RETRY_MS * attempt);
    let res: Response | undefined;
    try {
      let cur = new URL(url);
      for (let hop = 0; hop <= 5; hop++) {
        await throttle(cur);
        res = await rawFetch(cur.href);
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
          await res.body?.cancel();
          cur = new URL(loc, cur);
          if (cur.protocol !== 'http:' && cur.protocol !== 'https:') return { robots: denyAll(url), failed: false };
          res = undefined;
          continue;
        }
        break;
      }
    } catch {
      res = undefined;
    }
    if (!res) continue; // network error, timeout, redirect loop: transient
    const s = res.status;
    if (s === 200) {
      const body = await readBody(res, { limit: 512 * 1024, idleMs: 15_000, totalMs: 30_000 });
      if (!body.buf) continue;
      const robots = robotsParser(url, body.buf.toString('utf8'));
      const d = robots.getCrawlDelay(BOT_TOKEN);
      if (d && d > MAX_CRAWL_DELAY_S) return { robots: denyAll(url), failed: false };
      if (d) {
        const key = registrableDomain(new URL(url).hostname);
        crawlDelay.set(key, Math.max(crawlDelay.get(key) ?? 0, d));
      }
      return { robots, failed: false };
    }
    await res.body?.cancel().catch(() => {});
    if (s === 404 || s === 410 || (s >= 400 && s < 500 && s !== 401 && s !== 403 && s !== 429)) return { robots: allowAll(url), failed: false };
    if (s === 401 || s === 403) return { robots: denyAll(url), failed: false };
    // 429, 5xx, unresolved 3xx: retry, then disallow
  }
  return { robots: denyAll(url), failed: true };
}

async function robotsFor(origin: string): Promise<Robots> {
  const hit = robotsCache.get(origin);
  if (hit && !(hit.failed && Date.now() - hit.at > ROBOTS_FAIL_TTL_MS)) return (await hit.p).robots;
  const entry = { p: fetchRobots(origin), at: Date.now(), failed: false };
  entry.p.then((r) => {
    entry.failed = r.failed;
    entry.at = Date.now();
  });
  robotsCache.set(origin, entry);
  return (await entry.p).robots;
}

export async function robotsAllows(u: URL): Promise<boolean> {
  const r = await robotsFor(u.origin);
  return r.isAllowed(u.href, BOT_TOKEN) !== false;
}

// ------------------------------------------------------------------- fetching

export interface PoliteResponse {
  ok: boolean;
  status: number;
  finalUrl: string;
  redirected: boolean;
  contentType: string;
  contentLength: number | null;
  /** Present when the request was refused locally or failed (robots, deny list, loop, network). */
  blocked?: string;
  res?: Response;
}

/**
 * GET (or HEAD) a URL politely. The caller must consume or cancel `res.body`.
 */
export async function politeFetch(url: string, opts: { method?: 'GET' | 'HEAD'; headers?: Record<string, string> } = {}): Promise<PoliteResponse> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return { ok: false, status: 0, finalUrl: url, redirected: false, contentType: '', contentLength: null, blocked: 'invalid URL' };
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const denied = isDenied(current);
    if (denied) return blocked(current, denied, hop > 0);
    if (!(await robotsAllows(current))) return blocked(current, 'disallowed by robots.txt', hop > 0);
    await throttle(current);
    let res: Response;
    try {
      res = await rawFetch(current.href, { method: opts.method ?? 'GET', headers: opts.headers });
    } catch (e) {
      return { ok: false, status: 0, finalUrl: current.href, redirected: hop > 0, contentType: '', contentLength: null, blocked: `network: ${(e as Error).message}` };
    }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel().catch(() => {});
      try {
        current = new URL(loc, current);
      } catch {
        return blocked(current, 'bad redirect location', true);
      }
      continue;
    }
    const len = res.headers.get('content-length');
    return {
      ok: res.status === 200,
      status: res.status,
      finalUrl: current.href,
      redirected: hop > 0,
      contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
      contentLength: len && /^\d+$/.test(len) ? Number(len) : null,
      res,
    };
  }
  return blocked(current, 'too many redirects', true);
}

function blocked(at: URL, why: string, redirected: boolean): PoliteResponse {
  return { ok: false, status: 0, finalUrl: at.href, redirected, contentType: '', contentLength: null, blocked: why };
}

// --------------------------------------------------------------- body reading

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface BodyResult {
  buf: Buffer | null;
  reason: 'ok' | 'too-large' | 'rejected' | 'timeout' | 'error';
  error?: string;
}

/**
 * Read a body with a size cap, an idle timeout per chunk and a total timeout. Never throws.
 * `headCheck` sees the first 1 KiB (or the whole body if shorter); returning false aborts the download.
 */
export async function readBody(
  res: Response,
  opts: { limit: number; idleMs?: number; totalMs?: number; headCheck?: (head: Buffer) => boolean },
): Promise<BodyResult> {
  const idleMs = opts.idleMs ?? 30_000;
  const totalMs = opts.totalMs ?? 15 * 60_000;
  if (!res.body) return { buf: Buffer.alloc(0), reason: 'ok' };
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > opts.limit) {
    await res.body.cancel().catch(() => {});
    return { buf: null, reason: 'too-large' };
  }
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let checked = !opts.headCheck;
  const started = Date.now();
  const abort = async (reason: BodyResult['reason'], error?: string): Promise<BodyResult> => {
    await reader.cancel().catch(() => {});
    return { buf: null, reason, error };
  };
  try {
    for (;;) {
      if (Date.now() - started > totalMs) return await abort('timeout', 'total time limit');
      const { done, value } = await withTimeout(reader.read(), idleMs);
      if (done) break;
      total += value.byteLength;
      if (total > opts.limit) return await abort('too-large');
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      if (!checked && total >= 1024) {
        checked = true;
        if (!opts.headCheck!(Buffer.concat(chunks))) return await abort('rejected');
      }
    }
    const buf = Buffer.concat(chunks);
    if (!checked && !opts.headCheck!(buf)) return { buf: null, reason: 'rejected' };
    return { buf, reason: 'ok' };
  } catch (e) {
    const msg = (e as Error).message;
    return await abort(msg === 'timeout' ? 'timeout' : 'error', msg);
  }
}

/** Compatibility wrapper: the body, or null when it is larger than `limit` or the transfer failed. */
export async function readCapped(res: Response, limit: number): Promise<Buffer | null> {
  return (await readBody(res, { limit })).buf;
}

/** First `n` bytes of a body (cancelling the rest). `error` is set when the transfer failed before any byte arrived. */
export async function readPrefix(res: Response, n: number): Promise<{ buf: Buffer; error?: string }> {
  if (!res.body) return { buf: Buffer.alloc(0) };
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (total < n) {
      const { done, value } = await withTimeout(reader.read(), 30_000);
      if (done) break;
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      total += value.byteLength;
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    return { buf: Buffer.concat(chunks), error: total ? undefined : (e as Error).message };
  }
  await reader.cancel().catch(() => {});
  return { buf: Buffer.concat(chunks).subarray(0, n) };
}

/** Tiny concurrency limiter (used to keep at most a few big PDFs in memory at once). */
export function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
