// Builds data/documents.json from reviewed crawl candidates.
//
//   npm run curate
//
// Input:  data/curation.json        reviewed entries (see README)
//         .cache/crawl/candidates.json
// Output: data/documents.json, public/docs/<university>/<id>.pdf
//
// A candidate is hosted only if the crawler found a redistributable licence
// (file- or course-level), the file is ≤ 50 MB and the running total stays
// within 700 MB. Higher-priority entries claim the budget first; the rest
// become link-only records.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isRedistributable, LICENSE_INFO, MAX_HOSTED_FILE_BYTES, MAX_HOSTED_TOTAL_BYTES, type DocumentRecord, type DocType, type Level } from '../src/lib/schema.ts';
import { politeFetch, readCapped } from './lib/http.ts';
import { CACHE_DIR, DATA_DIR, PUBLIC_DIR, readJson, writeJson, today } from './lib/io.ts';
import type { Candidate } from './crawl.ts';

interface CurationEntry {
  url: string;
  id: string;
  title?: string;
  authors?: string[];
  department?: string;
  course_code?: string | null;
  course_title?: string | null;
  level: Level;
  type: DocType;
  topics: string[];
  year?: number | null;
  description?: string | null;
  /** Lower numbers claim the hosting budget first. */
  priority?: number;
  /** Keep as a link even if the licence would allow hosting. */
  force_link?: boolean;
  note?: string;
}

const curation = readJson<CurationEntry[]>(join(DATA_DIR, 'curation.json'));
const candPath = join(CACHE_DIR, 'crawl', 'candidates.json');
const candidates = existsSync(candPath) ? readJson<Candidate[]>(candPath) : [];
const byUrl = new Map(candidates.flatMap((c) => [[c.url, c] as const, [c.final_url, c] as const]));
const docsPath = join(DATA_DIR, 'documents.json');
const existing = new Map(readJson<DocumentRecord[]>(docsPath).map((d) => [d.id, d]));
const DOCS_DIR = join(PUBLIC_DIR, 'docs');

async function obtainFile(c: Candidate, dest: string): Promise<boolean> {
  if (existsSync(dest) && sha(readFileSync(dest)) === c.sha256) return true;
  if (c.cached && existsSync(c.cached)) {
    copyFileSync(c.cached, dest);
    return sha(readFileSync(dest)) === c.sha256;
  }
  // No local cache (e.g. a fresh clone): fetch again, politely, and require the same bytes.
  const r = await politeFetch(c.final_url);
  if (!r.ok || !r.res) return false;
  const buf = await readCapped(r.res, MAX_HOSTED_FILE_BYTES).catch(() => null);
  if (!buf || sha(buf) !== c.sha256) return false;
  writeFileSync(dest, buf);
  return true;
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const ordered = [...curation].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
const out: DocumentRecord[] = [];
const keepFiles = new Set<string>();
let budget = 0;
const problems: string[] = [];

for (const e of ordered) {
  const c = byUrl.get(e.url);
  const prev = existing.get(e.id);
  if (!c && !prev) {
    problems.push(`${e.id}: no crawl candidate for ${e.url} — run the crawler first`);
    continue;
  }
  if (c && c.verdict === 'skip') {
    problems.push(`${e.id}: crawler rejected this file (${c.reasons.join('; ')})`);
    continue;
  }
  const base: DocumentRecord = prev ?? ({} as DocumentRecord);
  const lic = c?.license ?? base.license;
  const rec: DocumentRecord = {
    id: e.id,
    title: e.title ?? c?.title ?? base.title,
    authors: e.authors ?? (c?.authors.length ? c.authors : base.authors ?? []),
    university: c?.university ?? base.university,
    department: e.department ?? base.department ?? 'Department of Mathematics',
    course_code: e.course_code !== undefined ? e.course_code : c?.course_code ?? base.course_code ?? null,
    course_title: e.course_title ?? base.course_title ?? null,
    level: e.level,
    type: e.type,
    topics: e.topics,
    year: e.year !== undefined ? e.year : c?.year ?? base.year ?? null,
    pages: c?.pages ?? base.pages ?? null,
    language: 'en',
    license: lic,
    license_url: LICENSE_INFO[lic].url,
    license_evidence: c?.license_evidence ?? base.license_evidence ?? null,
    source_url: c?.final_url ?? base.source_url,
    hosted: false,
    file_path: null,
    file_size: null,
    sha256: c?.sha256 ?? base.sha256 ?? null,
    accessed_at: c?.checked_at ?? base.accessed_at ?? today(),
    last_checked: base.last_checked ?? c?.checked_at ?? today(),
    link_status: base.link_status ?? 'ok',
    description: e.description ?? base.description ?? null,
  };

  const size = c?.bytes ?? base.file_size ?? 0;
  const mayHost = !!c && c.verdict === 'host' && isRedistributable(lic) && !e.force_link && size <= MAX_HOSTED_FILE_BYTES;
  if (mayHost && budget + size <= MAX_HOSTED_TOTAL_BYTES) {
    const dir = join(DOCS_DIR, rec.university);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, `${rec.id}.pdf`);
    if (await obtainFile(c!, dest)) {
      rec.hosted = true;
      rec.file_path = relative(PUBLIC_DIR, dest).split('\\').join('/');
      rec.file_size = statSync(dest).size;
      budget += rec.file_size;
      keepFiles.add(dest);
    } else {
      problems.push(`${e.id}: could not obtain an identical copy; listed as link`);
    }
  } else if (mayHost) {
    problems.push(`${e.id}: hosting budget (700 MB) reached; listed as link`);
  }
  out.push(rec);
}

// Remove hosted files that are no longer referenced.
if (existsSync(DOCS_DIR))
  for (const uni of readdirSync(DOCS_DIR, { withFileTypes: true }))
    if (uni.isDirectory())
      for (const f of readdirSync(join(DOCS_DIR, uni.name))) {
        const p = join(DOCS_DIR, uni.name, f);
        if (!keepFiles.has(p)) rmSync(p);
      }

out.sort((a, b) => a.university.localeCompare(b.university) || a.title.localeCompare(b.title));
writeJson(docsPath, out);
console.log(`curate: ${out.length} documents (${out.filter((d) => d.hosted).length} hosted, ${(budget / 2 ** 20).toFixed(1)} MB)`);
if (problems.length) console.warn('  ' + problems.join('\n  '));
