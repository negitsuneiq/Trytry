// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages serves project sites from /<repo>/. The deploy workflow sets
// SITE and BASE_PATH from the repository; locally the site runs at the root.
const site = process.env.SITE ?? 'http://localhost:4321';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  // 'auto': small sheets inline, the rest are external hashed files, so thousands of pages do not each carry the full CSS.
  build: { format: 'directory', inlineStylesheets: 'auto' },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  devToolbar: { enabled: false },
});
