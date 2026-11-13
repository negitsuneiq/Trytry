import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = process.env.OL_DATA_DIR ?? join(ROOT, 'data');
export const PUBLIC_DIR = join(ROOT, 'public');
export const CACHE_DIR = join(ROOT, '.cache');

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Atomic: write a temp file next to the target, then rename, so a crash never leaves half a JSON file. */
export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, path);
}

export const today = () => new Date().toISOString().slice(0, 10);
