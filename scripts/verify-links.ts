// Re-checks every document's source URL and updates link_status / last_checked.
// Runs monthly in CI (.github/workflows/check-links.yml). Run: npm run verify-links
//
// A link is "ok" when it answers 200 with a PDF, "redirected" when it does so
// after a redirect, and "broken" otherwise. Requests follow the same robots.txt
// and rate-limit rules as the crawler.

import { join } from 'node:path';
import type { DocumentRecord } from '../src/lib/schema.ts';
import { politeFetch, readCapped } from './lib/http.ts';
import { isPdf } from './lib/pdf.ts';
import { DATA_DIR, readJson, writeJson, today } from './lib/io.ts';

const path = join(DATA_DIR, 'documents.json');
const docs = readJson<DocumentRecord[]>(path);
const broken: string[] = [];

async function check(d: DocumentRecord): Promise<DocumentRecord['link_status']> {
  // Range keeps the transfer tiny; servers that ignore it still send the start first.
  const r = await politeFetch(d.source_url, { headers: { Range: 'bytes=0-2047' } });
  if (r.blocked || !r.res || (r.status !== 200 && r.status !== 206)) {
    await r.res?.body?.cancel();
    return 'broken';
  }
  const head = await readCapped(r.res, 4 * 1024 * 1024).catch(() => null);
  const pdf = head ? isPdf(head) : r.contentType.includes('pdf');
  if (!pdf) return 'broken';
  return r.redirected ? 'redirected' : 'ok';
}

// Hosts are throttled independently, so checking in parallel is still polite.
await Promise.all(
  docs.map(async (d) => {
    const status = await check(d);
    d.link_status = status;
    d.last_checked = today();
    if (status === 'broken') broken.push(`${d.id}  ${d.source_url}`);
  }),
);

writeJson(path, docs);
console.log(`verify-links: ${docs.length} checked, ${broken.length} broken`);
if (broken.length) console.log('  ' + broken.join('\n  '));
