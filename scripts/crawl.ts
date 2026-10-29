// Open Lemma crawler.
//
//   npm run crawl                      # every university in data/sources.json
//   npm run crawl -- --only mit,oxford # a subset
//   npm run crawl -- --max-pages 100   # cap HTML pages per university
//   npm run crawl -- --max-pdfs 50     # cap PDFs checked per university
//
// Output:
//   .cache/crawl/candidates.json   every PDF seen, with verdict and reasons
//   .cache/crawl/files/<sha>.pdf   cached copies of redistributable PDFs only
//   data/crawl-report.md           per-university counts and skip reasons
//
// Candidates are not published automatically. A person reviews them and lists
// the accepted ones in data/curation.json; `npm run curate` builds documents.json.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isRedistributable, MAX_HOSTED_FILE_BYTES, type License, type University } from '../src/lib/schema.ts';
import { politeFetch, readCapped, isDenied, USER_AGENT } from './lib/http.ts';
import { pdfInfo, pdfText, isPdf } from './lib/pdf.ts';
import { detectLanguage } from './lib/lang.ts';
import { detectLicense, mainText, relLicense } from './lib/license.ts';
import { guessCourseCode, guessLevel, guessTopics, guessType, looksLikeStudentWork, titleSimilarity } from './lib/classify.ts';
import { CACHE_DIR, DATA_DIR, readJson, writeJson, today } from './lib/io.ts';

export interface Source {
  university: string;
  /** Public pages to start from: course listings, course pages, faculty "teaching" pages. */
  seeds: string[];
  /** URL prefixes the crawler may walk through. PDFs may live anywhere not deny-listed. */
  scope: string[];
  maxDepth?: number;
  maxPages?: number;
  maxPdfs?: number;
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
const HTML_NOT_PDF = 'not a PDF (HTML response)';
// Apache directory-index sort links (?C=N;O=D) re-list the same directory.
const DIR_SORT = /^\?C=[NMSD];O=[AD]$/;
const SKIP_EXT = /\.(zip|gz|tgz|tar|ps|dvi|tex|bib|djvu|epub|mp4|mov|avi|mp3|wav|m4a|jpg|jpeg|png|gif|svg|webp|ppt|pptx|doc|docx|xls|xlsx|csv|ipynb|py|m|nb|sage|mw|exe|dmg|iso)$/i;

const OUT_DIR = join(CACHE_DIR, 'crawl');
const FILES_DIR = join(OUT_DIR, 'files');
const TMP_DIR = join(OUT_DIR, 'tmp');
mkdirSync(FILES_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

const sources = readJson<Source[]>(join(DATA_DIR, 'sources.json'));
const universities = readJson<University[]>(join(DATA_DIR, 'universities.json'));
const only = args.only?.split(',').map((s) => s.trim());
const selected = sources.filter((s) => !only || only.includes(s.university));
const maxPagesArg = args['max-pages'] ? Number(args['max-pages']) : undefined;
const maxPdfsArg = args['max-pdfs'] ? Number(args['max-pdfs']) : undefined;

const seenSha = new Map<string, string>();

interface UniStats {
  pages: number;
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
  return anchor || decodeURIComponent(url.split('/').pop() ?? url).replace(/\.pdf$/i, '');
}

async function inspectPdf(
  url: URL,
  ctx: { university: string; parent: string; anchor: string; pageTitle: string; pageLicense: ReturnType<typeof detectLicense>; pageRel: string | null },
): Promise<Candidate> {
  const c: Candidate = {
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
  const skip = (why: string) => {
    c.verdict = 'skip';
    c.reasons.push(why);
    return c;
  };

  const r = await politeFetch(url.href);
  c.final_url = r.finalUrl;
  if (r.blocked) return skip(r.blocked);
  if (r.status !== 200) {
    await r.res?.body?.cancel();
    return skip(`HTTP ${r.status}`);
  }
  if (r.contentType.includes('text/html')) {
    await r.res?.body?.cancel();
    return skip(HTML_NOT_PDF);
  }
  const buf = await readCapped(r.res!, PDF_DOWNLOAD_LIMIT).catch(() => undefined);
  if (buf === undefined) return skip('download failed or stalled');
  if (!buf) return skip('larger than 200 MB');
  if (!isPdf(buf)) return skip('not a PDF (bad magic bytes)');

  c.bytes = buf.length;
  c.sha256 = createHash('sha256').update(buf).digest('hex');
  const dup = seenSha.get(c.sha256);
  if (dup) {
    c.duplicate_of = dup;
    return skip('duplicate (SHA-256)');
  }
  seenSha.set(c.sha256, url.href);

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

    let lang = detectLanguage(head);
    // Title pages and tables of contents carry little prose: read further into longer files.
    if (lang.lang === 'unknown' && info.pages && info.pages > 3) {
      lang = detectLanguage(`${head}\n${pdfText(tmp, 4, Math.min(info.pages, 10))}`);
    }
    c.language = lang.lang;
    c.language_confidence = Number(lang.confidence.toFixed(2));
    if (lang.lang === 'unknown') return skip(lang.words < 60 ? 'no extractable text (scanned?)' : 'language not confidently English');
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

    // Licence: the file itself first, then the course page that links it.
    const fileText = `${head}\n${tail}`;
    const fileLic = detectLicense(fileText);
    if (/ocw\.mit\.edu\/terms/i.test(fileText) && fileLic.license === 'unknown') {
      // OCW files point to the OCW terms (CC BY-NC-SA 4.0) on every page footer.
      c.license = 'CC-BY-NC-SA-4.0';
      c.license_scope = 'file';
      c.license_evidence = 'https://ocw.mit.edu/pages/privacy-and-terms-of-use/';
      c.license_snippet = 'File footer references https://ocw.mit.edu/terms';
    } else if (fileLic.license !== 'unknown') {
      c.license = fileLic.license;
      c.license_scope = 'file';
      c.license_evidence = r.finalUrl;
      c.license_snippet = fileLic.snippet;
    } else if (ctx.pageLicense.license !== 'unknown') {
      c.license = ctx.pageLicense.license;
      c.license_scope = 'page';
      c.license_evidence = ctx.parent;
      c.license_snippet = ctx.pageLicense.snippet;
    } else if (ctx.pageRel) {
      const rel = detectLicense(ctx.pageRel);
      if (rel.license !== 'unknown') {
        c.license = rel.license;
        c.license_scope = 'page';
        c.license_evidence = ctx.parent;
        c.license_snippet = `rel="license" → ${ctx.pageRel}`;
      }
    }
    if (fileLic.excluded) c.reasons.push('file says it is excluded from the open licence');

    const hostable = isRedistributable(c.license) && !fileLic.excluded;
    if (hostable && buf.length <= MAX_HOSTED_FILE_BYTES) {
      c.verdict = 'host';
      c.cached = join(FILES_DIR, `${c.sha256}.pdf`);
      writeFileSync(c.cached, buf);
    } else {
      c.verdict = 'link';
      if (hostable) c.reasons.push('over 50 MB: link only');
      else c.reasons.push(`licence ${c.license}: link only`);
    }
    return c;
  } finally {
    rmSync(tmp, { force: true });
  }
}

async function crawlUniversity(src: Source): Promise<{ candidates: Candidate[]; stats: UniStats }> {
  const stats: UniStats = { pages: 0, pdfLinks: 0, checked: 0, host: 0, link: 0, skip: 0, reasons: new Map(), blocked: new Map() };
  const candidates: Candidate[] = [];
  const maxDepth = src.maxDepth ?? 2;
  const maxPages = maxPagesArg ?? src.maxPages ?? 150;
  const maxPdfs = maxPdfsArg ?? src.maxPdfs ?? 120;
  const queue: { url: URL; depth: number }[] = src.seeds.map((s) => ({ url: new URL(s), depth: 0 }));
  const seenPages = new Set<string>();
  const seenPdfs = new Set<string>();
  const inScope = (u: URL) => src.scope.some((p) => u.href.startsWith(p));
  const log = (m: string) => console.log(`[${src.university}] ${m}`);

  while (queue.length && stats.pages < maxPages && stats.checked < maxPdfs) {
    const { url, depth } = queue.shift()!;
    const key = normalise(url);
    if (seenPages.has(key)) continue;
    seenPages.add(key);

    const r = await politeFetch(url.href);
    if (r.blocked) {
      bump(stats.blocked, r.blocked);
      continue;
    }
    if (r.status !== 200 || !r.contentType.includes('html')) {
      await r.res?.body?.cancel();
      continue;
    }
    const body = await readCapped(r.res!, HTML_LIMIT).catch(() => null);
    if (!body) continue;
    const html = body.toString('utf8');
    stats.pages++;
    // A password field means a login form: leave immediately.
    if (/<input[^>]+type=["']?password/i.test(html)) {
      bump(stats.blocked, 'login form on page');
      continue;
    }
    const pageTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    const pageLicense = detectLicense(mainText(html));
    const pageRel = relLicense(html);

    for (const { href, text } of extractLinks(html, r.finalUrl)) {
      const denied = isDenied(href);
      if (denied) {
        bump(stats.blocked, denied);
        continue;
      }
      if (looksLikePdf(href, text)) {
        const k = normalise(href);
        if (seenPdfs.has(k) || stats.checked >= maxPdfs) continue;
        seenPdfs.add(k);
        stats.pdfLinks++;
        stats.checked++;
        const c = await inspectPdf(href, { university: src.university, parent: r.finalUrl, anchor: text, pageTitle, pageLicense, pageRel });
        // "(PDF)" in link text can lead to an HTML landing page (e.g. MIT OCW
        // resource pages) that holds the real file link: walk it like a page.
        if (c.reasons[0] === HTML_NOT_PDF) {
          stats.pdfLinks--;
          stats.checked--;
          if (depth < maxDepth && inScope(href)) queue.push({ url: href, depth: depth + 1 });
          continue;
        }
        candidates.push(c);
        stats[c.verdict]++;
        for (const why of c.reasons) bump(stats.reasons, why.replace(/licence [\w-]+:/, 'licence:'));
        log(`${c.verdict.padEnd(4)} ${c.license.padEnd(16)} ${(c.title ?? c.url).slice(0, 70)}${c.reasons.length ? `  (${c.reasons.join('; ')})` : ''}`);
      } else if (depth < maxDepth && inScope(href) && !SKIP_EXT.test(href.pathname) && !DIR_SORT.test(href.search)) {
        queue.push({ url: href, depth: depth + 1 });
      }
    }
  }
  log(`done: ${stats.pages} pages, ${stats.checked} PDFs → host ${stats.host}, link ${stats.link}, skip ${stats.skip}`);
  return { candidates, stats };
}

function dedupeByTitle(all: Candidate[]) {
  const kept = all.filter((c) => c.verdict !== 'skip' && c.title);
  const rank = (c: Candidate) => (c.verdict === 'host' ? 2 : 1) * 1e6 + (c.pages ?? 0);
  for (let i = 0; i < kept.length; i++)
    for (let j = i + 1; j < kept.length; j++) {
      const a = kept[i];
      const b = kept[j];
      if (a.verdict === 'skip' || b.verdict === 'skip' || a.university !== b.university) continue;
      if ((a.course_code ?? '') !== (b.course_code ?? '')) continue;
      if (titleSimilarity(a.title!, b.title!) < 0.85) continue;
      const [win, lose] = rank(a) >= rank(b) ? [a, b] : [b, a];
      lose.verdict = 'skip';
      lose.duplicate_of = win.url;
      lose.reasons.push('duplicate (title similarity)');
      if (lose.cached) rmSync(lose.cached, { force: true });
      lose.cached = null;
    }
}

function report(results: Map<string, { stats: UniStats }>, all: Candidate[]): string {
  const name = (slug: string) => universities.find((u) => u.slug === slug)?.name ?? slug;
  const lines = [
    '# Crawl report',
    '',
    `Run: ${new Date().toISOString()}  `,
    `User-Agent: \`${USER_AGENT}\`  `,
    'Policy: robots.txt obeyed; ≥ 2 s between requests per host; no LMS/SSO/login pages; PDFs only; English only.',
    '',
    'Counts are crawl candidates. Only entries accepted in `data/curation.json` are published.',
    '',
    '| # | University | HTML pages | PDFs checked | Host-eligible | Link-only | Skipped |',
    '|---|---|---:|---:|---:|---:|---:|',
  ];
  let i = 1;
  for (const [slug, { stats }] of results) {
    lines.push(`| ${i++} | ${name(slug)} | ${stats.pages} | ${stats.checked} | ${stats.host} | ${stats.link} | ${stats.skip} |`);
  }
  const tot = (k: Verdict) => all.filter((c) => c.verdict === k).length;
  lines.push(`| | **Total** | | **${all.length}** | **${tot('host')}** | **${tot('link')}** | **${tot('skip')}** |`, '');
  lines.push('## Skip and link-only reasons', '');
  for (const [slug, { stats }] of results) {
    if (!stats.reasons.size && !stats.blocked.size) continue;
    lines.push(`### ${name(slug)}`, '');
    for (const [why, n] of [...stats.reasons].sort((a, b) => b[1] - a[1])) lines.push(`- ${why}: ${n}`);
    for (const [why, n] of [...stats.blocked].sort((a, b) => b[1] - a[1])) lines.push(`- not visited — ${why}: ${n}`);
    lines.push('');
  }
  return lines.join('\n');
}

const fresh = new Map<string, UniStats>();
const all: Candidate[] = [];
// Universities run concurrently; requests to any single host stay serialised and spaced.
const runs = await Promise.all(selected.map(async (s) => [s.university, await crawlUniversity(s)] as const));
for (const [slug, { candidates, stats }] of runs) {
  fresh.set(slug, stats);
  all.push(...candidates);
}
dedupeByTitle(all);

// A partial run (--only) replaces only its own universities; everyone else's
// candidates and report rows carry over from the previous runs.
const isSelected = (slug: string) => selected.some((s) => s.university === slug);
const candPath = join(OUT_DIR, 'candidates.json');
const previous = existsSync(candPath) ? readJson<Candidate[]>(candPath).filter((c) => !isSelected(c.university)) : [];
writeJson(candPath, [...previous, ...all]);

type StoredStats = Omit<UniStats, 'reasons' | 'blocked'> & { reasons: [string, number][]; blocked: [string, number][] };
const statsPath = join(OUT_DIR, 'stats.json');
const stored: Record<string, StoredStats> = existsSync(statsPath) ? readJson(statsPath) : {};
for (const [slug, s] of fresh) stored[slug] = { ...s, reasons: [...s.reasons], blocked: [...s.blocked] };
writeJson(statsPath, stored);

const results = new Map<string, { stats: UniStats }>();
for (const u of universities) {
  const s = stored[u.slug];
  if (s) results.set(u.slug, { stats: { ...s, reasons: new Map(s.reasons), blocked: new Map(s.blocked) } });
}
writeFileSync(join(DATA_DIR, 'crawl-report.md'), report(results, [...previous, ...all]) + '\n');
console.log(`\ncandidates → ${candPath}\nreport     → data/crawl-report.md`);
