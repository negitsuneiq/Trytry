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
  // Inline CSS: one fewer render-blocking request on first paint (mobile FCP).
  build: { format: 'directory', inlineStylesheets: 'always' },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  devToolbar: { enabled: false },
});
