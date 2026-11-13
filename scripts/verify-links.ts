// Re-checks every document's source URL and updates link_status / last_checked.
// Runs monthly in CI (.github/workflows/check-links.yml). Run: npm run verify-links
//
// A link is "ok" when it answers 200 with a PDF, "redirected" when it does so
// after a redirect, and "broken" only when it answers 404/410 or answers 200
// with something that is not a PDF. Anything inconclusive (robots.txt
// disallow or failure, deny list, timeout, network error, 403, 429, 5xx) keeps
// the previous status and last_checked: one bad night must not mark a
// document broken. Inconclusive checks are retried once.
// Requests follow the same robots.txt and rate-limit rules as the crawler.

import { join } from 'node:path';
import type { DocumentRecord } from '../src/lib/schema.ts';
import { politeFetch, readPrefix } from './lib/http.ts';
import { isPdf } from './lib/pdf.ts';
import { DATA_DIR, readJson, writeJson, today } from './lib/io.ts';

type Outcome = { status: 'ok' | 'redirected' | 'broken' } | { status: 'inconclusive'; why: string };

async function checkOnce(d: DocumentRecord, withRange: boolean): Promise<Outcome | 'retry-without-range'> {
  // Range keeps the transfer tiny; servers that ignore it still send the start first, and we read only 4 KiB.
  const r = await politeFetch(d.source_url, withRange ? { headers: { Range: 'bytes=0-2047' } } : {});
  if (r.blocked) return { status: 'inconclusive', why: r.blocked };
  const res = r.res!;
  if (r.status === 416 && withRange) {
    await res.body?.cancel().catch(() => {});
    return 'retry-without-range';
  }
  if (r.status === 404 || r.status === 410) {
    await res.body?.cancel().catch(() => {});
    return { status: 'broken' };
  }
  if (r.status !== 200 && r.status !== 206) {
    await res.body?.cancel().catch(() => {});
    return { status: 'inconclusive', why: `HTTP ${r.status}` };
  }
  const { buf, error } = await readPrefix(res, 4096);
  if (error) return { status: 'inconclusive', why: error };
  const pdf = buf.length ? isPdf(buf) : r.contentType.includes('pdf');
  if (!pdf) return { status: 'broken' };
  return { status: r.redirected ? 'redirected' : 'ok' };
}

async function check(d: DocumentRecord): Promise<Outcome> {
  let last: Outcome = { status: 'inconclusive', why: 'not checked' };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let o = await checkOnce(d, true);
      if (o === 'retry-without-range') o = await checkOnce(d, false);
      if (o === 'retry-without-range') o = { status: 'inconclusive', why: 'HTTP 416' };
      last = o;
    } catch (e) {
      last = { status: 'inconclusive', why: (e as Error).message };
    }
    if (last.status !== 'inconclusive') break;
  }
  return last;
}

const path = join(DATA_DIR, 'documents.json');
const docs = readJson<DocumentRecord[]>(path);
const broken: string[] = [];
const unsure: string[] = [];

// Requests to one domain are serialised and spaced by the HTTP client; a small pool keeps many domains busy.
let next = 0;
async function worker() {
  while (next < docs.length) {
    const d = docs[next++];
    const o = await check(d);
    if (o.status === 'inconclusive') {
      unsure.push(`${d.id}  ${d.source_url}  (${o.why}; previous status kept)`);
      continue;
    }
    d.link_status = o.status;
    d.last_checked = today();
    if (o.status === 'broken') broken.push(`${d.id}  ${d.source_url}`);
  }
}
await Promise.all(Array.from({ length: Math.min(16, docs.length) }, worker));

writeJson(path, docs);
console.log(`verify-links: ${docs.length} checked, ${broken.length} broken, ${unsure.length} inconclusive`);
if (broken.length) console.log('  broken:\n  ' + broken.join('\n  '));
if (unsure.length) console.log('  inconclusive:\n  ' + unsure.join('\n  '));
