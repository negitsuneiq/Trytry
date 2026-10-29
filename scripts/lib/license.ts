// Licence detection for a single file (its own text) or a course page (its
// main content). Site-wide footers, headers and navigation are stripped before
// scanning, because a site-level notice is not enough under our policy.

import { LICENSE_INFO, type License } from '../../src/lib/schema.ts';

export type Scope = 'file' | 'page';

export interface LicenseFinding {
  license: License;
  /** True when the text explicitly excludes this file from an open licence. */
  excluded: boolean;
  snippet: string | null;
}

const CC_URL = /creativecommons\.org\/(licenses|publicdomain)\/(by(?:-nc)?(?:-sa|-nd)?|zero|mark)\/(\d\.\d)/i;

const CC_TEXT: [RegExp, License][] = [
  [/(?:CC[\s-]?0|CC\s?Zero|Creative Commons Zero)\b/i, 'CC0-1.0'],
  [/Attribution[\s-]+Non[\s-]?Commercial[\s-]+Share[\s-]?Alike\s*(\d\.\d)?/i, 'CC-BY-NC-SA-4.0'],
  [/Attribution[\s-]+Non[\s-]?Commercial[\s-]+No[\s-]?Deriv(?:atives|s)\s*(\d\.\d)?/i, 'CC-BY-NC-ND-4.0'],
  [/Attribution[\s-]+Non[\s-]?Commercial\s*(\d\.\d)?(?![\s-]+(?:Share|No))/i, 'CC-BY-NC-4.0'],
  [/Attribution[\s-]+Share[\s-]?Alike\s*(\d\.\d)?/i, 'CC-BY-SA-4.0'],
  [/Attribution[\s-]+No[\s-]?Deriv(?:atives|s)\s*(\d\.\d)?/i, 'CC-BY-ND-4.0'],
  [/\bCC[\s-]BY[\s-]NC[\s-]SA\s*(\d\.\d)?/i, 'CC-BY-NC-SA-4.0'],
  [/\bCC[\s-]BY[\s-]NC[\s-]ND\s*(\d\.\d)?/i, 'CC-BY-NC-ND-4.0'],
  [/\bCC[\s-]BY[\s-]NC\s*(\d\.\d)?(?![\s-](?:SA|ND))/i, 'CC-BY-NC-4.0'],
  [/\bCC[\s-]BY[\s-]SA\s*(\d\.\d)?/i, 'CC-BY-SA-4.0'],
  [/\bCC[\s-]BY[\s-]ND\s*(\d\.\d)?/i, 'CC-BY-ND-4.0'],
  [/\bCC[\s-]BY\s*(\d\.\d)?(?![\s-](?:NC|SA|ND))/i, 'CC-BY-4.0'],
  [/Creative Commons Attribution\s*(\d\.\d)?\s*(?:International|Unported|License)/i, 'CC-BY-4.0'],
  [/GNU Free Documentation License/i, 'GFDL-1.3'],
];

/** MIT OCW and similar: third-party items carved out of the course licence. */
const EXCLUSION = /(excluded from (?:our|the) Creative Commons license|not covered by (?:the|this|our) (?:Creative Commons|CC) licen[cs]e|used with permission|courtesy of [^.]{0,80}\. used with permission)/i;
const ARR = /(all rights reserved|may not be (?:reproduced|redistributed|copied)|do not (?:redistribute|distribute|post|share)|for (?:the )?(?:personal|private) use of (?:students|enrolled))/i;
const PUBLIC_DOMAIN = /(?:is in|placed (?:in|into)|dedicated to) the public domain/i;

/** The licence exactly as versioned in the source; a version we cannot name (e.g. 1.0) is `unknown`, never rounded. */
function known(id: string): License {
  return id in LICENSE_INFO ? (id as License) : 'unknown';
}

function versioned(base: License, ver: string | undefined): License {
  if (!ver || !base.startsWith('CC-BY')) return base;
  return known(base.replace(/-\d\.\d$/, `-${ver}`));
}

function fromUrl(m: RegExpMatchArray): License | null {
  const [, kind, code, ver] = m;
  if (kind.toLowerCase() === 'publicdomain') return code.toLowerCase() === 'zero' ? 'CC0-1.0' : 'Public-Domain';
  return known(`CC-${code.toUpperCase()}-${ver}`);
}

function snippetAround(text: string, idx: number) {
  return text.slice(Math.max(0, idx - 80), idx + 160).replace(/\s+/g, ' ').trim();
}

/**
 * Drops notes about the typesetting template ("composed using a template …
 * licensed under CC BY-NC-SA 3.0"): that licence covers the LaTeX template,
 * not the document.
 */
function withoutTemplateNotes(text: string): string {
  return text.replace(/[^]{0,200}\btemplate\b[^]{0,250}/gi, (m) => (/licen[cs]|creative\s*commons/i.test(m) ? ' ' : m));
}

export function detectLicense(raw: string): LicenseFinding {
  const text = withoutTemplateNotes(raw);
  const excluded = EXCLUSION.test(text);
  const url = text.match(CC_URL);
  if (url) {
    const lic = fromUrl(url);
    if (lic) return { license: excluded ? 'all-rights-reserved' : lic, excluded, snippet: snippetAround(text, url.index ?? 0) };
  }
  for (const [re, lic] of CC_TEXT) {
    const m = text.match(re);
    if (m) {
      const id = versioned(lic, m[1]);
      return { license: excluded ? 'all-rights-reserved' : id, excluded, snippet: snippetAround(text, m.index ?? 0) };
    }
  }
  const pd = text.match(PUBLIC_DOMAIN);
  if (pd) return { license: 'Public-Domain', excluded, snippet: snippetAround(text, pd.index ?? 0) };
  const arr = text.match(ARR);
  if (arr || excluded) return { license: 'all-rights-reserved', excluded, snippet: arr ? snippetAround(text, arr.index ?? 0) : null };
  return { license: 'unknown', excluded: false, snippet: null };
}

/** Main-content text of an HTML page: drops footer/header/nav/aside/script/style. */
export function mainText(html: string): string {
  return html
    .replace(/<(script|style|noscript|footer|header|nav|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*(?:id|class)="[^"]*(?:footer|site-info|copyright|colophon)[^"]*"[^>]*>[\s\S]*?<\/(?:div|section|p)>/gi, ' ')
    .replace(/<a\b[^>]*href="(https?:\/\/creativecommons\.org[^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** rel="license" links count as page-level evidence even outside main content. */
export function relLicense(html: string): string | null {
  return html.match(/<a\b[^>]*rel="[^"]*license[^"]*"[^>]*href="([^"]+)"/i)?.[1] ?? html.match(/<a\b[^>]*href="([^"]+)"[^>]*rel="[^"]*license[^"]*"/i)?.[1] ?? null;
}
