import katex from 'katex';

/** Render a TeX string to HTML at build time. */
export function tex(src: string, display = false): string {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' });
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);

/** Escape a plain string, rendering any $…$ spans (e.g. "$L^p$ spaces") with KaTeX. */
export function inlineTex(s: string): string {
  return s
    .split(/(\$[^$]+\$)/g)
    .map((part) => (part.length > 2 && part.startsWith('$') && part.endsWith('$') ? tex(part.slice(1, -1)) : escape(part)))
    .join('');
}

/** Strip $…$ delimiters for plain-text contexts such as <title>. */
export function plainTex(s: string): string {
  return s.replace(/\$([^$]+)\$/g, '$1');
}
