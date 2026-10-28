// Build-time data for the home page scenes. Everything is derived from
// documents.json, so the page tells the truth about the catalogue.

import { documents, universities, docsForUniversity } from './data';
import { TOPICS } from './topics';
import type { DocType, DocumentRecord } from './schema';
import { authorsLine } from './format';

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

// ── Course → topic flow (a small Sankey) ──────────────────────────────────

export interface FlowNode {
  key: string;
  label: string;
  sub: string;
  value: number;
  y0: number;
  y1: number;
}
export interface FlowLink {
  source: string;
  target: string;
  value: number;
  /** Ribbon edges at each end. */
  sy0: number;
  sy1: number;
  ty0: number;
  ty1: number;
}

const FLOW_H = 600;
const FLOW_GAP = 10;

/** Courses (or, for single-file sources, the author) feeding each topic. */
export function courseTopicFlow(maxSources = 12) {
  const sourceOf = (d: DocumentRecord) => {
    const uni = universities.find((u) => u.slug === d.university);
    if (d.course_code && documents.filter((x) => x.course_code === d.course_code).length > 1)
      return { key: d.course_code, label: d.course_code, sub: d.course_title ?? uni?.name ?? '' };
    const who = d.authors.length ? authorsLine(d.authors) : (uni?.name ?? d.university);
    return { key: `author:${who}`, label: who, sub: uni?.name ?? '' };
  };

  const pair = new Map<string, number>();
  const meta = new Map<string, { label: string; sub: string }>();
  for (const d of documents)
    for (const t of d.topics) {
      const s = sourceOf(d);
      meta.set(s.key, s);
      const k = `${s.key}\u0000${t}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
    }

  const totals = new Map<string, number>();
  for (const [k, v] of pair) totals.set(k.split('\u0000')[0], (totals.get(k.split('\u0000')[0]) ?? 0) + v);
  const kept = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxSources).map(([k]) => k);

  const links: { source: string; target: string; value: number }[] = [];
  for (const [k, v] of pair) {
    const [s, t] = k.split('\u0000');
    links.push({ source: kept.includes(s) ? s : 'other', target: t, value: v });
  }
  if (totals.size > kept.length) meta.set('other', { label: '…', sub: '' });

  const sum = (key: string, side: 'source' | 'target') => links.filter((l) => l[side] === key).reduce((a, l) => a + l.value, 0);
  const sourceKeys = [...kept, ...(totals.size > kept.length ? ['other'] : [])];
  const usedTopics = TOPICS.filter((t) => links.some((l) => l.target === t.slug)).sort((a, b) => sum(b.slug, 'target') - sum(a.slug, 'target'));
  const total = links.reduce((a, l) => a + l.value, 0) || 1;

  const stack = (keys: string[], side: 'source' | 'target', label: (k: string) => { label: string; sub: string }) => {
    const unit = (FLOW_H - FLOW_GAP * (keys.length - 1)) / total;
    let y = 0;
    return keys.map((key) => {
      const value = sum(key, side);
      const node: FlowNode = { key, ...label(key), value, y0: y, y1: y + value * unit };
      y = node.y1 + FLOW_GAP;
      return node;
    });
  };
  const sources = stack(sourceKeys, 'source', (k) => meta.get(k)!);
  const targets = stack(
    usedTopics.map((t) => t.slug),
    'target',
    (k) => ({ label: k, sub: '' }),
  );

  // Ribbons stack inside each node in the order of the opposite side.
  const unit = (FLOW_H - FLOW_GAP * (sourceKeys.length - 1)) / total;
  const unitT = (FLOW_H - FLOW_GAP * (usedTopics.length - 1)) / total;
  const sOff = new Map(sources.map((n) => [n.key, n.y0]));
  const tOff = new Map(targets.map((n) => [n.key, n.y0]));
  const order = (l: { source: string; target: string }) => [sources.findIndex((n) => n.key === l.source), targets.findIndex((n) => n.key === l.target)];
  const placed: FlowLink[] = [];
  for (const l of [...links].sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1])) {
    const sy0 = sOff.get(l.source)!;
    sOff.set(l.source, sy0 + l.value * unit);
    placed.push({ ...l, sy0, sy1: sy0 + l.value * unit, ty0: 0, ty1: 0 });
  }
  for (const l of [...placed].sort((a, b) => order(a)[1] - order(b)[1] || order(a)[0] - order(b)[0])) {
    l.ty0 = tOff.get(l.target)!;
    l.ty1 = l.ty0 + l.value * unitT;
    tOff.set(l.target, l.ty1);
  }

  const empty = TOPICS.filter((t) => !usedTopics.includes(t));
  return { sources, targets, links: placed, empty, height: FLOW_H };
}

/** Whole-course files: books and complete notes, longest first. */
export const shelfBooks = documents
  .filter((d) => d.hosted && (d.type === 'book' || (d.pages ?? 0) >= 80))
  .sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0));

const SPINES = ['ink', 'red', 'ochre', 'slate', 'moss', 'paper'] as const;
export const spineColour = (id: string) => SPINES[hash(id) % SPINES.length];
