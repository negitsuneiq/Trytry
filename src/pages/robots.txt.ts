// Everything may be crawled. GitHub Pages project sites cannot serve a robots.txt
// at the domain root, so crawlers mostly ignore this one; the layout also links the sitemap.
import type { APIRoute } from 'astro';
import { asset } from '../lib/paths';

export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL(asset('sitemap.xml'), site).href}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
