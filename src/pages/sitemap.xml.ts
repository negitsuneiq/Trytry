// One sitemap with every generated page in both languages; each URL lists its
// en/tr alternates. Stays far below the 50,000-URL limit. The root redirect page
// and the 404 are left out on purpose.
import type { APIRoute } from 'astro';
import { documents, universities } from '../lib/data';
import { courses } from '../lib/courses';
import { TOPICS } from '../lib/topics';
import { LANGS } from '../i18n/strings';
import { href } from '../lib/paths';

const sections = ['', 'library', 'books', 'courses', 'topics', 'universities', 'about', 'license'];

export const GET: APIRoute = ({ site }) => {
  const abs = (p: string) => new URL(p, site).href;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paths = [
    ...sections,
    ...documents.map((d) => `doc/${d.id}`),
    ...courses.map((c) => `courses/${c.slug}`),
    ...TOPICS.map((t) => `topics/${t.slug}`),
    ...universities.map((u) => `universities/${u.slug}`),
  ];
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const p of paths) {
    const links = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(abs(href(l, p)))}"/>`).join('');
    for (const l of LANGS) out.push(`<url><loc>${esc(abs(href(l, p)))}</loc>${links}</url>`);
  }
  out.push('</urlset>', '');
  return new Response(out.join('\n'), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
