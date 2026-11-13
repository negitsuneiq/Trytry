import type { APIRoute } from 'astro';
import { LANGS, type Lang } from '../i18n/strings';
import { asset, href } from '../lib/paths';
import { documents, universities } from '../lib/data';
import { TOPICS } from '../lib/topics';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Entry {
  /** Path below /<lang>/, without slashes ('' for the language home). */
  path: string;
  lastmod?: string;
}

export const GET: APIRoute = ({ site }) => {
  const abs = (p: string) => new URL(p, site).href;
  const entries: Entry[] = [
    { path: '' },
    { path: 'library' },
    { path: 'universities' },
    { path: 'topics' },
    { path: 'about' },
    { path: 'license' },
    ...universities.map((u) => ({ path: `universities/${u.slug}` })),
    ...TOPICS.map((t) => ({ path: `topics/${t.slug}` })),
    ...documents.map((d) => ({ path: `doc/${d.id}`, lastmod: d.last_checked?.slice(0, 10) })),
  ];

  const xDefault = abs(asset(''));
  const urls = LANGS.flatMap((lang: Lang) =>
    entries.map((e) => {
      const alternates = [
        ...LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(abs(href(l, e.path)))}"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(xDefault)}"/>`,
      ].join('\n');
      const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : '';
      return `  <url>\n    <loc>${esc(abs(href(lang, e.path)))}</loc>${lastmod}\n${alternates}\n  </url>`;
    }),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
