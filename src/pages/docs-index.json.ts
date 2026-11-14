// One compact index of every document, shared by both languages. The library,
// topic and university pages fetch it to render cards on demand instead of
// shipping thousands of server-rendered cards.
import type { APIRoute } from 'astro';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { documents } from '../lib/data';
import { inlineTex } from '../lib/math';
import type { CardRec } from '../lib/cardRec';

const order = new Map(
  [...documents].sort((a, b) => a.title.localeCompare(b.title)).map((d, n) => [d.id, n] as const),
);

export const GET: APIRoute = () => {
  const recs = documents.map((d): CardRec => {
    const r: CardRec = { i: d.id, t: d.title, u: d.university, p: d.topics, l: d.level, ty: d.type, li: d.license, d: d.accessed_at, n: order.get(d.id)! };
    if (d.authors.length) r.a = d.authors;
    if (d.hosted) r.h = 1;
    if (d.hosted && existsSync(join(process.cwd(), 'public', `thumbs/${d.id}.webp`))) r.th = 1;
    if (d.year) r.y = d.year;
    const course = [d.course_code, d.course_title].filter(Boolean).join(' ');
    if (course) r.c = course;
    if (d.course_code != null) r.cc = d.course_code;
    if (d.title.includes('$')) r.x = inlineTex(d.title);
    return r;
  });
  return new Response(JSON.stringify(recs), { headers: { 'Content-Type': 'application/json' } });
};
