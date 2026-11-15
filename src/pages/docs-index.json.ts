// One compact index of every document, shared by both languages. The library,
// topic and university pages fetch it to render cards on demand instead of
// shipping thousands of server-rendered cards.
import type { APIRoute } from 'astro';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { documents, universities } from '../lib/data';
import { courses, courseOfDoc } from '../lib/courses';
import { inlineTex } from '../lib/math';
import { shortTitle } from '../lib/short';
import type { CardRec } from '../lib/cardRec';

const order = new Map(
  [...documents].sort((a, b) => a.title.localeCompare(b.title)).map((d, n) => [d.id, n] as const),
);

/**
 * Default order: a deterministic interleave, so the first screens show many
 * universities and courses instead of one big course. Universities go in
 * ranking order; each pass takes the next two documents (course reading
 * order) of every course, visiting courses round-robin across universities
 * (each university's courses by size). Documents without a course form
 * pairs of their own, mixed in after every third course of their university.
 */
const PER_PASS = 2;
const defaultOrder = (() => {
  const inCourse = new Set(courses.flatMap((c) => c.docs.map((d) => d.id)));
  const byUni = universities.slice().sort((a, b) => a.rank - b.rank || a.slug.localeCompare(b.slug));
  const queues = byUni.map((u) => {
    const own = courses.filter((c) => c.university === u.slug).sort((a, b) => b.docs.length - a.docs.length || a.slug.localeCompare(b.slug));
    const items = own.map((c) => c.docs.map((d) => d.id));
    const loose = documents
      .filter((d) => d.university === u.slug && !inCourse.has(d.id))
      .sort((a, b) => Number(b.hosted) - Number(a.hosted) || a.title.localeCompare(b.title))
      .map((d) => d.id);
    const pairs: string[][] = [];
    for (let i = 0; i < loose.length; i += PER_PASS) pairs.push(loose.slice(i, i + PER_PASS));
    const out: string[][] = [];
    for (let i = 0, j = 0; i < items.length || j < pairs.length; ) {
      if (j < pairs.length && (i >= items.length || out.length % 4 === 3)) out.push(pairs[j++]);
      else out.push(items[i++]);
    }
    return out;
  });
  const order: string[] = [];
  const seen = new Set<string>();
  const most = Math.max(0, ...queues.map((q) => Math.max(0, ...q.map((i) => i.length))));
  for (let pass = 0; pass * PER_PASS < most; pass++) {
    const steps = Math.max(0, ...queues.map((q) => q.length));
    for (let j = 0; j < steps; j++) {
      for (const q of queues) {
        for (const id of q[j]?.slice(pass * PER_PASS, (pass + 1) * PER_PASS) ?? []) {
          if (!seen.has(id)) (seen.add(id), order.push(id));
        }
      }
    }
  }
  for (const d of documents) if (!seen.has(d.id)) order.push(d.id); // unknown university
  return new Map(order.map((id, o) => [id, o] as const));
})();

export const GET: APIRoute = () => {
  const recs = documents.map((d): CardRec => {
    const r: CardRec = { i: d.id, t: d.title, u: d.university, p: d.topics, l: d.level, ty: d.type, li: d.license, d: d.accessed_at, n: order.get(d.id)!, o: defaultOrder.get(d.id)! };
    if (d.authors.length) r.a = d.authors;
    if (d.hosted) r.h = 1;
    if (d.hosted && existsSync(join(process.cwd(), 'public', `thumbs/${d.id}.webp`))) r.th = 1;
    if (d.year) r.y = d.year;
    const courseText = [d.course_code, d.course_title].filter(Boolean).join(' ');
    if (courseText) r.c = courseText;
    const course = courseOfDoc.get(d.id);
    if (course) r.k = course.slug;
    if (d.course_code != null) r.cc = d.course_code;
    const short = shortTitle(d);
    if (short) r.s = short;
    if ((short ?? d.title).includes('$')) r.x = inlineTex(short ?? d.title);
    return r;
  });
  return new Response(JSON.stringify(recs), { headers: { 'Content-Type': 'application/json' } });
};
