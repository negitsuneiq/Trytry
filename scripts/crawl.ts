// Open Lemma crawler.
//
//   npm run crawl                      # every university in data/sources.json
//   npm run crawl -- --only mit,oxford # a subset
//   npm run crawl -- --max-pages 100   # cap HTML pages per university
//
// Output:
//   .cache/crawl/candidates.json   every PDF seen, with verdict and reasons (atomic write at the end)
//   .cache/crawl/candidates.jsonl  the same, appended one line at a time while crawling (survives a crash)
//   .cache/crawl/files/<sha>.pdf   cached copies of redistributable PDFs only
//   data/crawl-report.md           per-university counts and skip reasons
//
// Candidates are not published automatically. A person reviews them and lists
// the accepted ones in data/curation.json; `npm run curate` builds documents.json.
//
// Licence policy: a PDF is "host" only when a grant is found in its own text,
// or on the course page that links it (same origin, same directory, and the
// PDF carries no copyright notice of its own). Anything doubtful is "link".

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isRedistributable, MAX_HOSTED_FILE_BYTES, type License, type University } from '../src/lib/schema.ts';
import { politeFetch, readBody, isDenied, limiter, USER_AGENT } from './lib/http.ts';
import { pdfInfo, pdfText, isPdf } from './lib/pdf.ts';
import { detectLanguage } from './lib/lang.ts';
import { analysePage, detectLicense, findRestriction, hasCopyrightNotice, type LicenseFinding } from './lib/license.ts';
import { guessCourseCode, guessLevel, guessTopics, guessType, isTitleDuplicate, looksLikeStudentWork } from './lib/classify.ts';
import { inScope, normaliseScope, pageCovers, sharesScopeDomain } from './lib/scope.ts';
import { CACHE_DIR, DATA_DIR, readJson, writeJson, today } from './lib/io.ts';

export interface Source {
  university: string;
  /** Public pages to start from: course listings, course pages, faculty "teaching" pages. Must be inside `scope`. */
  seeds: string[];
  /** URL prefixes the crawler may walk through (matched on a URL boundary). PDFs may live on any host sharing a scope entry's registrable domain. */
  scope: string[];
  maxDepth?: number;
  maxPages?: number;
  notes?: string;
}

export type Verdict = 'host' | 'link' | 'skip';

export interface Candidate {
  url: string;
  final_url: string;
  university: string;
  parent: string;
  anchor: string;
  page_title: string;
  verdict: Verdict;
  reasons: string[];
  sha256: string | null;
  bytes: number | null;
  pages: number | null;
  language: string | null;
  language_confidence: number | null;
  license: License;
  license_scope: 'file' | 'page' | null;
  license_evidence: string | null;
  license_snippet: string | null;
  title: string | null;
  authors: string[];
  year: number | null;
  course_code: string | null;
  guess: { type: string; level: string; topics: string[] };
  duplicate_of: string | null;
  cached: string | null;
  checked_at: string;
}

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    'max-pages': { type: 'string' },
    'max-pdfs': { type: 'string' },
  },
});

const PDF_DOWNLOAD_LIMIT = 200 * 1024 * 1024;
const HTML_LIMIT = 5 * 1024 * 1024;
const SKIP_EXT = /\.(zip|gz|tgz|tar|ps|dvi|tex|bib|djvu|epub|mp4|mov|avi|mp3|wav|m4a|jpg|jpeg|png|gif|svg|webp|ppt|pptx|doc|docx|xls|xlsx|csv|ipynb|py|m|nb|sage|mw|exe|dmg|iso)$/i;
/** Query parameters that open endless variants of one page (calendars, sorting, printing …). */
const TRAP_PARAM = /^(sort|order|orderby|dir|date|day|month|year|view|cal|calendar|ical|format|print|lang|replytocom|filter|search|q|s)$/i;
const OCW_TERMS = /ocw\.mit\.edu\/terms(?![\w-])/i;

const OUT_DIR = join(CACHE_DIR, 'crawl');
const FILES_DIR = join(OUT_DIR, 'files');
const TMP_DIR = join(OUT_DIR, 'tmp');
const JSONL = join(OUT_DIR, 'candidates.jsonl');
const candPath = join(OUT_DIR, 'candidates.json');
mkdirSync(FILES_DIR, { recursive: true });
// Temporary inspection copies of PDFs we may not host: never leave any behind, not even after a crash.
rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(TMP_DIR, { recursive: true });
writeFileSync(JSONL, '');

const sources = readJson<Source[]>(join(DATA_DIR, 'sources.json'));
const universities = readJson<University[]>(join(DATA_DIR, 'universities.json'));
const only = args.only?.split(',').map((s) => s.trim());
const selected = sources.filter((s) => !only || only.includes(s.university));
const maxPagesArg = args['max-pages'] ? Number(args['max-pages']) : undefined;
const maxPdfs = args['max-pdfs'] ? Number(args['max-pdfs']) : 120;

// Read the earlier results now, so a corrupt file fails the run before hours of crawling, not after.
const previous: Candidate[] = existsSync(candPath) ? readJson<Candidate[]>(candPath).filter((c) => !selected.some((s) => s.university === c.university)) : [];

/** Big downloads are held in memory; keep only a few at a time. */
const downloadSlot = limiter(3);

interface UniStats {
  pages: number;
  fetches: number;
  pdfLinks: number;
  checked: number;
  host: number;
  link: number;
  skip: number;
  reasons: Map<string, number>;
  blocked: Map<string, number>;
}

function normalise(u: URL): string {
  const c = new URL(u.href);
  c.hash = '';
  for (const p of [...c.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/.test(p)) c.searchParams.delete(p);
  return c.href;
}

function extractLinks(html: string, base: string): { href: URL; text: string }[] {
  const out: { href: URL; text: string }[] = [];
  const re = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!raw || raw.startsWith('#') || /^(mailto|javascript|tel):/i.test(raw)) continue;
    try {
      const href = new URL(raw.replace(/&amp;/g, '&'), base);
      const text = m[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      out.push({ href, text });
    } catch {}
  }
  return out;
}

function looksLikePdf(u: URL, text: string) {
  return /\.pdf$/i.test(u.pathname) || /\[?\bpdf\b\]?/i.test(text) || /\/download\b|\/pdf\//i.test(u.pathname);
}

/** HTML pages with trap-like query strings are not followed. */
function isTrapUrl(u: URL) {
  let n = 0;
  for (const k of u.searchParams.keys()) {
    n++;
    if (TRAP_PARAM.test(k)) return true;
  }
  return n > 2;
}

function bump(m: Map<string, number>, k: string) {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function pickTitle(info: ReturnType<typeof pdfInfo>, firstPage: string, anchor: string, url: string): string {
  const bad = /^(untitled|microsoft word|document\d*|slide ?\d*|main|notes?|lecture ?\d*|hw ?\d*|\s*)$/i;
  const fromInfo = info.title?.replace(/^Microsoft Word - /, '').replace(/\.(tex|dvi|docx?)$/i, '').trim();
  if (fromInfo && fromInfo.length > 4 && !bad.test(fromInfo) && !fromInfo.includes('/')) return fromInfo;
  const lines = firstPage
    .split('\n')
    .map((l) => l.replace(/\s{2,}/g, ' ').trim())
    .filter((l) => l.length > 3 && l.length < 120 && /\p{L}{3}/u.test(l) && !/^(page|\d+$)/i.test(l));
  if (lines[0]) return lines.slice(0, lines[1] && lines[0].length < 30 ? 2 : 1).join(' — ');
  if (anchor) return anchor;
  const last = url.split('/').pop() ?? url;
  try {
    return decodeURIComponent(last).replace(/\.pdf$/i, '');
  } catch {
    return last.replace(/\.pdf$/i, '');
  }
}

interface PageContext {
  university: string;
  parent: string;
  anchor: string;
  pageTitle: string;
  pageLicense: LicenseFinding;
}

function newCandidate(url: URL, ctx: PageContext): Candidate {
  return {
    url: url.href,
    final_url: url.href,
    university: ctx.university,
    parent: ctx.parent,
    anchor: ctx.anchor,
    page_title: ctx.pageTitle,
    verdict: 'skip',
    reasons: [],
    sha256: null,
    bytes: null,
    pages: null,
    language: null,
    language_confidence: null,
    license: 'unknown',
    license_scope: null,
    license_evidence: null,
    license_snippet: null,
    title: null,
    authors: [],
    year: null,
    course_code: null,
    guess: { type: 'other', level: 'undergraduate', topics: [] },
    duplicate_of: null,
    cached: null,
    checked_at: today(),
  };
}

async function inspectPdf(url: URL, ctx: PageContext, c: Candidate): Promise<Candidate> {
  const skip = (why: string) => {
    c.verdict = 'skip';
    c.reasons.push(why);
    return c;
  };

  const r = await politeFetch(url.href);
  c.final_url = r.finalUrl;
  if (r.blocked) return skip(r.blocked);
  if (r.status !== 200) {
    await r.res?.body?.cancel().catch(() => {});
    return skip(`HTTP ${r.status}`);
  }
  // Only plausible PDF content types are downloaded (a /download link may be a zip or a video).
  if (!/^(application\/(pdf|x-pdf|octet-stream)|binary\/octet-stream|)(;|$)/.test(r.contentType.trim())) {
    await r.res?.body?.cancel().catch(() => {});
    return skip(`not a PDF (content-type ${r.contentType || 'none'})`);
  }
  const body = await downloadSlot(() => readBody(r.res!, { limit: PDF_DOWNLOAD_LIMIT, headCheck: isPdf }));
  if (body.reason === 'too-large') return skip('larger than 200 MB');
  if (body.reason === 'rejected') return skip('not a PDF (bad magic bytes)');
  if (!body.buf) return skip(`download failed (${body.reason}${body.error ? `: ${body.error}` : ''})`);
  const buf = body.buf;
  if (!isPdf(buf)) return skip('not a PDF (bad magic bytes)');

  c.bytes = buf.length;
  c.sha256 = createHash('sha256').update(buf).digest('hex');

  // Downloaded only to inspect; deleted below unless it may be hosted.
  const tmp = join(TMP_DIR, `${c.sha256}.pdf`);
  writeFileSync(tmp, buf);
  try {
    const info = pdfInfo(tmp);
    if (info.encrypted) return skip('encrypted PDF');
    c.pages = info.pages;
    c.year = info.year;
    const head = pdfText(tmp, 1, 3);
    const tail = info.pages && info.pages > 3 ? pdfText(tmp, Math.max(4, info.pages - 1), info.pages) : '';

    const lang = detectLanguage(head);
    c.language = lang.lang;
    c.language_confidence = Number(lang.confidence.toFixed(2));
    if (lang.tooShort) return skip(`too short to verify language (${lang.words} words in the first pages; scanned PDF without text?)`);
    if (lang.lang === 'unknown') return skip('language not confidently English');
    if (lang.lang !== 'en') return skip(`language: ${lang.lang}`);

    const context = `${ctx.anchor} ${ctx.pageTitle} ${head.slice(0, 1500)}`;
    if (looksLikeStudentWork(context)) return skip('looks like student work');

    c.title = pickTitle(info, head, ctx.anchor, url.href);
    if (info.author && !/^(user|admin|owner|unknown|\w+\d+)$/i.test(info.author.trim())) c.authors = info.author.split(/\s*(?:,|;| and |&)\s*/).filter(Boolean);
    c.course_code = guessCourseCode(`${ctx.pageTitle} ${ctx.anchor} ${c.title} ${url.pathname}`);
    c.guess = {
      type: guessType(`${ctx.anchor} ${c.title} ${url.pathname}`, c.pages),
      level: guessLevel(context, c.course_code, ctx.university),
      topics: guessTopics(`${ctx.pageTitle} ${ctx.anchor} ${c.title} ${head.slice(0, 3000)}`),
    };

    // ---- Licence: the file itself first, then (narrowly) the course page that links it.
    const fileText = `${head}\n${tail}`;
    const fileLic = detectLicense(fileText);
    const pageUrl = new URL(ctx.parent);
    const finalUrl = new URL(r.finalUrl);
    const pageApplies = pageCovers(pageUrl, url) && pageCovers(pageUrl, finalUrl);
    const isOcw = finalUrl.hostname === 'ocw.mit.edu';
    const fileSpoke = fileLic.license !== 'unknown' || fileLic.conflict || fileLic.ambiguous;
    const veto: string[] = [];

    if (fileLic.license !== 'unknown') {
      c.license = fileLic.license;
      c.license_scope = 'file';
      c.license_evidence = r.finalUrl;
      c.license_snippet = fileLic.snippet;
    } else if (fileSpoke) {
      c.reasons.push('licence mentioned in the file without a clear grant (or mentions disagree)');
    } else if (isOcw && OCW_TERMS.test(fileText)) {
      // OCW files point to the OCW terms (CC BY-NC-SA 4.0). Only for files really served by ocw.mit.edu.
      c.license = 'CC-BY-NC-SA-4.0';
      c.license_scope = 'file';
      c.license_evidence = 'https://ocw.mit.edu/pages/privacy-and-terms-of-use/';
      c.license_snippet = 'File footer references https://ocw.mit.edu/terms';
    } else if (pageApplies && ctx.pageLicense.license !== 'unknown' && !ctx.pageLicense.conflict) {
      if (hasCopyrightNotice(fileText)) c.reasons.push('course page licence not inherited: the PDF carries its own copyright notice without a grant');
      else {
        c.license = ctx.pageLicense.license;
        c.license_scope = 'page';
        c.license_evidence = ctx.parent;
        c.license_snippet = ctx.pageLicense.snippet;
      }
    }
    if (fileLic.excluded) veto.push('file says it is excluded from the open licence');
    if (pageApplies && ctx.pageLicense.excluded) veto.push('course page says some content is excluded from the open licence');
    if (pageApplies && ctx.pageLicense.restricted && c.license_scope === 'file') veto.push('course page carries a restriction notice that disagrees with the file');

    // ---- Full-text scan before anything is hosted: a restriction or third-party credit anywhere in the PDF means "link".
    if (isRedistributable(c.license) && !veto.length) {
      const full = pdfText(tmp, 1, info.pages ?? 100000);
      if (!full.trim()) veto.push('could not read the full text to check for exclusions');
      else {
        const hit = findRestriction(full);
        if (hit) veto.push(`restriction or third-party notice in the full text: ${hit.snippet.slice(0, 100)}`);
      }
    }
    for (const v of veto) c.reasons.push(v);

    const hostable = isRedistributable(c.license) && !veto.length;
    if (hostable && buf.length <= MAX_HOSTED_FILE_BYTES) {
      c.verdict = 'host';
      c.cached = join(FILES_DIR, `${c.sha256}.pdf`);
      writeFileSync(c.cached, buf);
    } else {
      c.verdict = 'link';
      if (veto.length) c.license = c.license === 'all-rights-reserved' ? c.license : 'unknown';
      if (hostable) c.reasons.push('over 50 MB: link only');
      else c.reasons.push(`licence ${c.license}: link only`);
    }
    return c;
  } finally {
    rmSync(tmp, { force: true });
  }
}

const allCandidates: Candidate[] = [];

function record(c: Candidate) {
  allCandidates.push(c);
  appendFileSync(JSONL, JSON.stringify(c) + '\n');
}

async function crawlUniversity(src: Source): Promise<UniStats> {
  const stats: UniStats = { pages: 0, fetches: 0, pdfLinks: 0, checked: 0, host: 0, link: 0, skip: 0, reasons: new Map(), blocked: new Map() };
  const maxDepth = src.maxDepth ?? 2;
  const maxPages = maxPagesArg ?? src.maxPages ?? 150;
  const maxFetches = maxPages * 3; // every HTML request counts, successful or not
  const scope = normaliseScope(src.scope);
  const queue: { url: URL; depth: number }[] = [];
  for (const s of src.seeds) {
    const u = new URL(s);
    if (inScope(u, scope)) queue.push({ url: u, depth: 0 });
    else bump(stats.blocked, 'seed outside scope');
  }
  const seenPages = new Set<string>();
  const seenPdfs = new Set<string>();
  const log = (m: string) => console.log(`[${src.university}] ${m}`);

  while (queue.length && stats.pages < maxPages && stats.fetches < maxFetches && stats.checked < maxPdfs) {
    const { url, depth } = queue.shift()!;
    const key = normalise(url);
    if (seenPages.has(key)) continue;
    seenPages.add(key);

    try {
      stats.fetches++;
      const r = await politeFetch(url.href);
      if (r.blocked) {
        bump(stats.blocked, r.blocked);
        continue;
      }
      if (r.status !== 200 || !r.contentType.includes('html')) {
        await r.res?.body?.cancel().catch(() => {});
        continue;
      }
      const final = new URL(r.finalUrl);
      if (!inScope(final, scope)) {
        await r.res?.body?.cancel().catch(() => {});
        bump(stats.blocked, 'redirected outside scope');
        continue;
      }
      const body = await readBody(r.res!, { limit: HTML_LIMIT });
      if (!body.buf) {
        bump(stats.blocked, `page not read (${body.reason})`);
        continue;
      }
      const html = body.buf.toString('utf8');
      stats.pages++;
      // A password field means a login form: leave immediately.
      if (/<input[^>]+type\s*=\s*["']?password/i.test(html)) {
        bump(stats.blocked, 'login form on page');
        continue;
      }
      const pageTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
      const pageLicense = analysePage(html);

      for (const { href, text } of extractLinks(html, r.finalUrl)) {
        const denied = isDenied(href);
        if (denied) {
          bump(stats.blocked, denied);
          continue;
        }
        if (looksLikePdf(href, text)) {
          if (!inScope(href, scope) && !sharesScopeDomain(href, scope)) {
            bump(stats.blocked, 'PDF link outside the university domain');
            continue;
          }
          const k = normalise(href);
          if (seenPdfs.has(k) || stats.checked >= maxPdfs) continue;
          seenPdfs.add(k);
          stats.pdfLinks++;
          stats.checked++;
          const ctx: PageContext = { university: src.university, parent: r.finalUrl, anchor: text, pageTitle, pageLicense };
          const c = newCandidate(href, ctx);
          try {
            await inspectPdf(href, ctx, c);
          } catch (e) {
            c.verdict = 'skip';
            if (c.cached) c.cached = null;
            c.reasons.push(`error while inspecting: ${(e as Error).message}`);
          }
          record(c);
          stats[c.verdict]++;
          for (const why of c.reasons) bump(stats.reasons, why.replace(/licence [\w.-]+:/, 'licence:'));
          log(`${c.verdict.padEnd(4)} ${c.license.padEnd(16)} ${(c.title ?? c.url).slice(0, 70)}${c.reasons.length ? `  (${c.reasons.join('; ')})` : ''}`);
        } else if (depth < maxDepth && inScope(href, scope) && !SKIP_EXT.test(href.pathname) && !isTrapUrl(href)) {
          queue.push({ url: href, depth: depth + 1 });
        }
      }
    } catch (e) {
      bump(stats.blocked, `page error: ${(e as Error).message}`);
    }
  }
  log(`done: ${stats.pages} pages (${stats.fetches} requests), ${stats.checked} PDFs → host ${stats.host}, link ${stats.link}, skip ${stats.skip}`);
  return stats;
}

/** Identical bytes: keep one record (host beats link, then crawl order); the others become skips. */
function dedupeBySha(all: Candidate[]) {
  const winner = new Map<string, Candidate>();
  const rank = (c: Candidate) => (c.verdict === 'host' ? 2 : 1);
  for (const c of all) {
    if (c.verdict === 'skip' || !c.sha256) continue;
    const w = winner.get(c.sha256);
    if (!w) {
      winner.set(c.sha256, c);
      continue;
    }
    const [win, lose] = rank(c) > rank(w) ? [c, w] : [w, c];
    winner.set(c.sha256, win);
    lose.verdict = 'skip';
    lose.duplicate_of = win.url;
    lose.reasons.push('duplicate (SHA-256)');
    // Same bytes share one cache file: only remove it when the winner does not use it.
    if (lose.cached && lose.cached !== win.cached) rmSync(lose.cached, { force: true });
    lose.cached = null;
  }
}

function dedupeByTitle(all: Candidate[]) {
  const kept = all.filter((c) => c.verdict !== 'skip' && c.title);
  const rank = (c: Candidate) => (c.verdict === 'host' ? 2 : 1) * 1e6 + (c.pages ?? 0);
  for (let i = 0; i < kept.length; i++)
    for (let j = i + 1; j < kept.length; j++) {
      const a = kept[i];
      const b = kept[j];
      if (a.verdict === 'skip' || b.verdict === 'skip' || a.university !== b.university) continue;
      if (!isTitleDuplicate({ title: a.title!, course_code: a.course_code }, { title: b.title!, course_code: b.course_code })) continue;
      const [win, lose] = rank(a) >= rank(b) ? [a, b] : [b, a];
      lose.verdict = 'skip';
      lose.duplicate_of = win.url;
      lose.reasons.push('duplicate (title similarity)');
      if (lose.cached && lose.cached !== win.cached) rmSync(lose.cached, { force: true });
      lose.cached = null;
    }
}

function report(results: Map<string, UniStats>, all: Candidate[]): string {
  const name = (slug: string) => universities.find((u) => u.slug === slug)?.name ?? slug;
  const lines = [
    '# Crawl report',
    '',
    `Run: ${new Date().toISOString()}  `,
    `User-Agent: \`${USER_AGENT}\`  `,
    'Policy: robots.txt obeyed; ≥ 2 s between requests per domain; no LMS/SSO/login pages; PDFs only; English only.',
    '',
    'Counts are crawl candidates. Only entries accepted in `data/curation.json` are published.',
    '',
    '| # | University | HTML pages | PDFs checked | Host-eligible | Link-only | Skipped |',
    '|---|---|---:|---:|---:|---:|---:|',
  ];
  let i = 1;
  for (const [slug, stats] of results) {
    const mine = all.filter((c) => c.university === slug);
    const n = (v: Verdict) => mine.filter((c) => c.verdict === v).length;
    lines.push(`| ${i++} | ${name(slug)} | ${stats.pages} | ${stats.checked} | ${n('host')} | ${n('link')} | ${n('skip')} |`);
  }
  const tot = (k: Verdict) => all.filter((c) => c.verdict === k).length;
  lines.push(`| | **Total** | | **${all.length}** | **${tot('host')}** | **${tot('link')}** | **${tot('skip')}** |`, '');
  lines.push('## Skip and link-only reasons', '');
  for (const [slug, stats] of results) {
    if (!stats.reasons.size && !stats.blocked.size) continue;
    lines.push(`### ${name(slug)}`, '');
    for (const [why, n] of [...stats.reasons].sort((a, b) => b[1] - a[1])) lines.push(`- ${why}: ${n}`);
    for (const [why, n] of [...stats.blocked].sort((a, b) => b[1] - a[1])) lines.push(`- not visited — ${why}: ${n}`);
    lines.push('');
  }
  return lines.join('\n');
}

const results = new Map<string, UniStats>();
let finalised = false;

function finalise(note?: string) {
  if (finalised) return;
  finalised = true;
  dedupeBySha(allCandidates);
  dedupeByTitle(allCandidates);
  writeJson(candPath, [...previous, ...allCandidates]);
  writeFileSync(join(DATA_DIR, 'crawl-report.md'), report(results, allCandidates) + (note ? `\n> ${note}\n` : '\n'));
  // Inspection copies must not outlive the run.
  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`\ncandidates → ${candPath}\nreport     → data/crawl-report.md${note ? `\n${note}` : ''}`);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    finalise(`Run interrupted by ${sig}: partial results.`);
    process.exit(130);
  });

// Universities run concurrently; requests to any single domain stay serialised and spaced.
const settled = await Promise.allSettled(selected.map(async (s) => [s.university, await crawlUniversity(s)] as const));
let failures = 0;
settled.forEach((r, i) => {
  if (r.status === 'fulfilled') results.set(r.value[0], r.value[1]);
  else {
    failures++;
    console.error(`[${selected[i].university}] crawl failed: ${r.reason}`);
    results.set(selected[i].university, { pages: 0, fetches: 0, pdfLinks: 0, checked: 0, host: 0, link: 0, skip: 0, reasons: new Map([[`crawl aborted: ${r.reason}`, 1]]), blocked: new Map() });
  }
});
finalise(failures ? `${failures} universit${failures === 1 ? 'y' : 'ies'} failed; partial results kept.` : undefined);
