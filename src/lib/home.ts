// Build-time data for the home page scenes. Everything is derived from
// documents.json, so the page tells the truth about the catalogue.

import { documents, universities, docsForUniversity } from './data';
import type { DocType, DocumentRecord } from './schema';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Documents per type, in the order the definition sentence names them. */
export const typeCounts: Record<DocType, number> = { 'lecture-notes': 0, 'problem-set': 0, exam: 0, book: 0, other: 0 };
for (const d of documents) typeCounts[d.type]++;

export function samplesOfType(type: DocType, n = 3): DocumentRecord[] {
  return documents.filter((d) => d.type === type && d.hosted).slice(0, n);
}

/**
 * Pages for the title scene: one per course first, so the desk shows the
 * catalogue's range rather than twenty lectures of the same course.
 */
export function stormPages(n: number): DocumentRecord[] {
  const hosted = documents.filter((d) => d.hosted);
  const byCourse = new Map<string, DocumentRecord[]>();
  for (const d of hosted) {
    const k = d.course_code ?? d.id;
    byCourse.set(k, [...(byCourse.get(k) ?? []), d]);
  }
  const queues = [...byCourse.values()].map((q) => q.sort((a, b) => hash(a.id) - hash(b.id)));
  const out: DocumentRecord[] = [];
  while (out.length < n && queues.some((q) => q.length)) for (const q of queues) if (q.length && out.length < n) out.push(q.shift()!);
  return out;
}

/** Deterministic scatter for the title scene, keeping the centre clear for the title. */
export function stormLayout(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const h = hash(`storm-${i}`);
    const a = i * 2.39996 + (h % 100) / 200; // golden angle, jittered
    const ring = 0.52 + ((h >>> 8) % 100) / 220; // 0.52–0.97 of the half-viewport
    return {
      x: Math.cos(a) * ring * 50, // vw from centre
      y: Math.sin(a) * ring * 46, // vh from centre
      z: -260 - ((h >>> 16) % 1100), // px
      r: (((h >>> 4) % 100) - 50) / 4, // deg
    };
  });
}

/** One plate per ranked department, with what is already on the shelves. */
export const departmentPlates = universities.map((u) => {
  const docs = docsForUniversity(u.slug);
  return { u, count: docs.length, samples: docs.filter((d) => d.hosted).slice(0, 3) };
});
