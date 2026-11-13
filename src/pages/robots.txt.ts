import type { APIRoute } from 'astro';
import { asset } from '../lib/paths';

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL(asset('sitemap.xml'), site).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
