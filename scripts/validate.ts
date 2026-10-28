// Fails the build if the catalogue breaks the licence policy or Pages limits.
// Run: npm run validate

import { existsSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  DOC_TYPES,
  LEVELS,
  MAX_HOSTED_FILE_BYTES,
  MAX_HOSTED_TOTAL_BYTES,
  isRedistributable,
  LICENSE_INFO,
  type DocumentRecord,
  type University,
} from '../src/lib/schema.ts';
import { TOPIC_BY_SLUG } from '../src/lib/topics.ts';
import { DATA_DIR, PUBLIC_DIR, readJson } from './lib/io.ts';

const unis = readJson<University[]>(join(DATA_DIR, 'universities.json'));
const docs = readJson<DocumentRecord[]>(join(DATA_DIR, 'documents.json'));
const errors: string[] = [];
const err = (id: string, m: string) => errors.push(`${id}: ${m}`);

const uniSlugs = new Set(unis.map((u) => u.slug));
for (const u of unis) {
  if (!/^[a-z0-9-]+$/.test(u.slug)) err(u.slug, 'bad slug');
  if (!u.ranking_url || !u.ranking_year) err(u.slug, 'missing ranking source');
  if (!/^[A-Z]{2}$/.test(u.country)) err(u.slug, 'country must be an ISO 3166-1 alpha-2 code');
}

const ids = new Set<string>();
const hashes = new Map<string, string>();
let hostedTotal = 0;

for (const d of docs) {
  if (!/^[a-z0-9-]+$/.test(d.id)) err(d.id, 'id must be kebab-case');
  if (ids.has(d.id)) err(d.id, 'duplicate id');
  ids.add(d.id);
  if (!uniSlugs.has(d.university)) err(d.id, `unknown university ${d.university}`);
  if (!LEVELS.includes(d.level)) err(d.id, `bad level ${d.level}`);
  if (!DOC_TYPES.includes(d.type)) err(d.id, `bad type ${d.type}`);
  if (!d.topics.length) err(d.id, 'no topics');
  for (const tp of d.topics) if (!TOPIC_BY_SLUG.has(tp)) err(d.id, `unknown topic ${tp}`);
  if (d.language !== 'en') err(d.id, 'language must be en');
  if (!(d.license in LICENSE_INFO)) err(d.id, `unknown licence ${d.license}`);
  if (!/^https?:\/\//.test(d.source_url)) err(d.id, 'source_url must be absolute');

  if (d.sha256) {
    const other = hashes.get(d.sha256);
    if (other) err(d.id, `same SHA-256 as ${other}`);
    hashes.set(d.sha256, d.id);
  }

  if (d.hosted) {
    if (!isRedistributable(d.license)) err(d.id, `hosted but licence ${d.license} does not permit redistribution`);
    if (!d.license_evidence) err(d.id, 'hosted without license_evidence (file- or course-level page)');
    if (!d.file_path) {
      err(d.id, 'hosted without file_path');
      continue;
    }
    const abs = join(PUBLIC_DIR, d.file_path);
    if (!existsSync(abs)) {
      err(d.id, `missing file ${d.file_path}`);
      continue;
    }
    const size = statSync(abs).size;
    hostedTotal += size;
    if (size > MAX_HOSTED_FILE_BYTES) err(d.id, `file is ${size} bytes (> 50 MB): link it instead`);
    if (d.file_size !== size) err(d.id, `file_size ${d.file_size} ≠ actual ${size}`);
    const buf = readFileSync(abs);
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') err(d.id, 'hosted file is not a PDF');
    const sha = createHash('sha256').update(buf).digest('hex');
    if (sha !== d.sha256) err(d.id, 'sha256 does not match hosted file (file must be unmodified)');
  } else if (d.file_path) {
    err(d.id, 'external document must not have file_path');
  }
}

if (hostedTotal > MAX_HOSTED_TOTAL_BYTES) errors.push(`hosted total ${(hostedTotal / 2 ** 20).toFixed(0)} MB exceeds 700 MB`);

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(
  `✓ ${unis.length} universities, ${docs.length} documents (${docs.filter((d) => d.hosted).length} hosted, ${(hostedTotal / 2 ** 20).toFixed(1)} MB)`,
);
