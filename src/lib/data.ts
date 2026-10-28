import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocumentRecord, University } from './schema';
import { TOPICS } from './topics';

// OL_DATA_DIR lets local design work point at a scratch fixture without
// touching the real catalogue in data/.
const DATA_DIR = process.env.OL_DATA_DIR ?? join(process.cwd(), 'data');

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
}

export const universities: University[] = load<University[]>('universities.json').sort((a, b) => a.rank - b.rank);
export const documents: DocumentRecord[] = load<DocumentRecord[]>('documents.json');

export const universityBySlug = new Map(universities.map((u) => [u.slug, u]));
export const documentById = new Map(documents.map((d) => [d.id, d]));

export function docsForUniversity(slug: string) {
  return documents.filter((d) => d.university === slug);
}

export function docsForTopic(slug: string) {
  return documents.filter((d) => d.topics.includes(slug));
}

export const usedTopics = TOPICS.filter((t) => documents.some((d) => d.topics.includes(t.slug)));

export const stats = {
  documents: documents.length,
  hosted: documents.filter((d) => d.hosted).length,
  universities: new Set(documents.map((d) => d.university)).size || universities.length,
  topics: usedTopics.length || TOPICS.length,
};

/** Newest first by access date, then title. */
export const recentDocuments = [...documents].sort(
  (a, b) => b.accessed_at.localeCompare(a.accessed_at) || a.title.localeCompare(b.title),
);

export function similarDocuments(doc: DocumentRecord, n = 4) {
  return documents
    .filter((d) => d.id !== doc.id)
    .map((d) => ({
      d,
      score:
        d.topics.filter((t) => doc.topics.includes(t)).length * 3 +
        (d.level === doc.level ? 1 : 0) +
        (d.type === doc.type ? 1 : 0),
    }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || a.d.title.localeCompare(b.d.title))
    .slice(0, n)
    .map((x) => x.d);
}
