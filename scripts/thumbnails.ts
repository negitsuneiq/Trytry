// Renders page 1 of every hosted PDF to public/thumbs/<id>.webp.
// Needs poppler's `pdftoppm` (apt install poppler-utils). Run: npm run thumbnails

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { DocumentRecord } from '../src/lib/schema.ts';
import { DATA_DIR, PUBLIC_DIR, readJson } from './lib/io.ts';

const docs = readJson<DocumentRecord[]>(join(DATA_DIR, 'documents.json')).filter((d) => d.hosted && d.file_path);
const outDir = join(PUBLIC_DIR, 'thumbs');
mkdirSync(outDir, { recursive: true });

function hasPdftoppm() {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!docs.length) {
  console.log('thumbnails: no hosted documents');
  process.exit(0);
}
if (!hasPdftoppm()) {
  console.warn('thumbnails: pdftoppm not found; hosted documents fall back to generated covers');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'ol-thumb-'));
let made = 0;
for (const d of docs) {
  const pdf = join(PUBLIC_DIR, d.file_path!);
  const out = join(outDir, `${d.id}.webp`);
  if (existsSync(out) && statSync(out).mtimeMs > statSync(pdf).mtimeMs) continue;
  const prefix = join(tmp, d.id);
  try {
    execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-png', '-scale-to', '900', pdf, prefix], { stdio: 'ignore', timeout: 60_000 });
    await sharp(`${prefix}.png`).resize(600, 800, { fit: 'cover', position: 'top' }).webp({ quality: 72 }).toFile(out);
    made++;
  } catch (e) {
    console.warn(`thumbnails: ${d.id} failed (${(e as Error).message}); using generated cover`);
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`thumbnails: ${made} rendered, ${docs.length - made} up to date or skipped`);
