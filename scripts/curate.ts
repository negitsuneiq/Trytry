// Builds data/documents.json from reviewed crawl candidates.
//
//   npm run curate
//
// Input:  data/curation.json        reviewed entries (see README)
//         .cache/crawl/candidates.json   (optional: without it, already hosted files are carried over unchanged)
// Output: data/documents.json, public/docs/<university>/<id>.pdf
//
// A candidate is hosted only if the crawler found a redistributable licence
// (file- or course-level), the file is ≤ 50 MB and the running total stays
// within 700 MB. Higher-priority entries claim the budget first; the rest
// become link-only records.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { isRedistributable, LICENSE_INFO, MAX_HOSTED_FILE_BYTES, MAX_HOSTED_TOTAL_BYTES, type DocumentRecord, type DocType, type Level } from '../src/lib/schema.ts';
import { politeFetch, readBody } from './lib/http.ts';
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
const candidatesMissing = !existsSync(candPath);
const candidates = candidatesMissing ? [] : readJson<Candidate[]>(candPath);
const byUrl = new Map(candidates.flatMap((c) => [[c.final_url, c] as const, [c.url, c] as const]));
const docsPath = join(DATA_DIR, 'documents.json');
const existing = new Map(readJson<DocumentRecord[]>(docsPath).map((d) => [d.id, d]));
const DOCS_DIR = join(PUBLIC_DIR, 'docs');

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function obtainFile(c: Candidate, dest: string): Promise<boolean> {
  if (existsSync(dest) && sha(readFileSync(dest)) === c.sha256) return true;
  if (c.cached && existsSync(c.cached)) {
    copyFileSync(c.cached, dest);
    if (sha(readFileSync(dest)) === c.sha256) return true;
    rmSync(dest, { force: true });
    return false;
  }
  // No local cache (e.g. a fresh clone): fetch again, politely, and require the same bytes.
  const r = await politeFetch(c.final_url);
  if (!r.ok || !r.res) {
    await r.res?.body?.cancel().catch(() => {});
    return false;
  }
  const { buf } = await readBody(r.res, { limit: MAX_HOSTED_FILE_BYTES });
  if (!buf || sha(buf) !== c.sha256) return false;
  writeFileSync(dest, buf);
  return true;
}

/** An already hosted file that is still on disk, byte-identical to the recorded hash. */
function intactHostedFile(prev: DocumentRecord | undefined): string | null {
  if (!prev?.hosted || !prev.file_path || !prev.sha256 || !isRedistributable(prev.license)) return null;
  const abs = resolve(PUBLIC_DIR, prev.file_path);
  if (!abs.startsWith(resolve(DOCS_DIR) + sep) || !existsSync(abs)) return null;
  if (statSync(abs).size > MAX_HOSTED_FILE_BYTES) return null;
  return sha(readFileSync(abs)) === prev.sha256 ? abs : null;
}

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

  if (!c) {
    // No crawl candidate (fresh clone, CI): keep a hosted file that is still intact; never demote or delete it.
    const abs = e.force_link ? null : intactHostedFile(prev);
    if (abs) {
      const size = statSync(abs).size;
      if (budget + size <= MAX_HOSTED_TOTAL_BYTES) {
        rec.hosted = true;
        rec.file_path = relative(PUBLIC_DIR, abs).split(sep).join('/');
        rec.file_size = size;
        budget += size;
        keepFiles.add(abs);
      } else problems.push(`${e.id}: hosting budget (700 MB) reached; listed as link`);
    }
    out.push(rec);
    continue;
  }

  const size = c.bytes ?? base.file_size ?? 0;
  const mayHost = c.verdict === 'host' && isRedistributable(lic) && !e.force_link && size <= MAX_HOSTED_FILE_BYTES;
  if (mayHost && budget + size <= MAX_HOSTED_TOTAL_BYTES) {
    const dir = join(DOCS_DIR, rec.university);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, `${rec.id}.pdf`);
    if (await obtainFile(c, dest)) {
      rec.hosted = true;
      rec.file_path = relative(PUBLIC_DIR, dest).split(sep).join('/');
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

// Remove hosted files that are no longer referenced. Never without a crawl cache (the carry-over above
// already keeps intact files, but a missing cache is reason enough not to delete anything), never dotfiles.
if (candidatesMissing) {
  console.warn('  .cache/crawl/candidates.json not found: hosted files are carried over and nothing is deleted');
} else if (existsSync(DOCS_DIR)) {
  for (const uni of readdirSync(DOCS_DIR, { withFileTypes: true }))
    if (uni.isDirectory())
      for (const f of readdirSync(join(DOCS_DIR, uni.name), { withFileTypes: true })) {
        if (f.name.startsWith('.') || !f.isFile()) continue;
        const p = join(DOCS_DIR, uni.name, f.name);
        if (!keepFiles.has(p)) rmSync(p);
      }
}

out.sort((a, b) => a.university.localeCompare(b.university) || a.title.localeCompare(b.title));
writeJson(docsPath, out);
console.log(`curate: ${out.length} documents (${out.filter((d) => d.hosted).length} hosted, ${(budget / 2 ** 20).toFixed(1)} MB)`);
if (problems.length) console.warn('  ' + problems.join('\n  '));
