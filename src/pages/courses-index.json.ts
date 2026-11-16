// One compact index of every course, shared by both languages. The library's
// course view and the course strip above document search results fetch it.
import type { APIRoute } from 'astro';
import { courses } from '../lib/courses';
import { universityBySlug, universities } from '../lib/data';
import { DOC_TYPES } from '../lib/schema';
import { realYear } from '../lib/format';
import type { CourseRec } from '../lib/courseRec';

const byTitle = new Map(
  [...courses].sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug)).map((c, n) => [c.slug, n] as const),
);

/**
 * Default order ("relevance" without a query): round-robin across universities
 * in ranking order, each university's courses by size, so the first screen
 * shows many universities instead of one with the most courses.
 */
const defaultOrder = (() => {
  const known = new Set(universities.map((u) => u.slug));
  const queues = universities
    .slice()
    .sort((a, b) => a.rank - b.rank || a.slug.localeCompare(b.slug))
    .map((u) => courses.filter((c) => c.university === u.slug).sort((a, b) => b.docs.length - a.docs.length || a.slug.localeCompare(b.slug)));
  const rest = courses.filter((c) => !known.has(c.university)).sort((a, b) => b.docs.length - a.docs.length || a.slug.localeCompare(b.slug));
  const out: string[] = [];
  for (let j = 0; queues.some((q) => j < q.length); j++) for (const q of queues) if (j < q.length) out.push(q[j].slug);
  out.push(...rest.map((c) => c.slug));
  return new Map(out.map((slug, o) => [slug, o] as const));
})();

export const GET: APIRoute = () => {
  const recs = courses.map((c): CourseRec => {
    const r: CourseRec = {
      s: c.slug,
      t: c.title,
      u: universityBySlug.get(c.university)?.slug ?? c.university,
      l: c.level,
      p: c.topics,
      d: c.docs.length,
      ct: DOC_TYPES.map((ty) => c.counts[ty] ?? 0),
      h: c.docs.filter((d) => d.hosted).length,
      o: defaultOrder.get(c.slug)!,
      n: byTitle.get(c.slug)!,
    };
    if (c.code) r.c = c.code;
    if (c.instructors.length) r.a = c.instructors.slice(0, 3);
    const ys = c.docs.map((d) => realYear(d.year, d.accessed_at)).filter((y): y is number => y != null);
    if (ys.length) r.y = [Math.min(...ys), Math.max(...ys)];
    return r;
  });
  return new Response(JSON.stringify(recs), { headers: { 'Content-Type': 'application/json' } });
};
