// PDF inspection via poppler (pdfinfo / pdftotext). Install: apt install poppler-utils.

import { execFileSync } from 'node:child_process';

export interface PdfInfo {
  pages: number | null;
  title: string | null;
  author: string | null;
  year: number | null;
  encrypted: boolean;
}

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

export function pdfInfo(file: string): PdfInfo {
  const out = run('pdfinfo', [file]);
  const get = (k: string) => out.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim() || null;
  const date = get('CreationDate') ?? get('ModDate');
  const year = date?.match(/\b(19[89]\d|20[0-4]\d)\b/)?.[1];
  return {
    pages: get('Pages') ? Number(get('Pages')) : null,
    title: get('Title'),
    author: get('Author'),
    year: year ? Number(year) : null,
    encrypted: get('Encrypted')?.startsWith('yes') ?? false,
  };
}

/** Text of pages [first, last] (1-based, inclusive). */
export function pdfText(file: string, first: number, last: number): string {
  return run('pdftotext', ['-f', String(first), '-l', String(last), '-layout', '-enc', 'UTF-8', file, '-']);
}

export function isPdf(buf: Buffer): boolean {
  // The header may follow a little leading junk; the spec allows it in the first 1 KB.
  return buf.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}
