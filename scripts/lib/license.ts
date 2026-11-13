// Licence detection for a single file (its own text) or a course page (its
// main content). Site-wide footers, headers and navigation are stripped before
// scanning, because a site-level notice is not enough under our policy.
//
// Principle: when in doubt the answer is "unknown" or "all-rights-reserved",
// never a redistribution licence. A licence is reported only when
//   1. no restriction phrase ("all rights reserved", "not licensed under",
//      "used with permission" …) occurs in the text,
//   2. a licence name / creativecommons.org licence URL occurs together with a
//      grant phrase ("licensed under", "released under" …) just before it,
//   3. all grant mentions agree on one licence and version that we support.

import { isRedistributable, type License } from '../../src/lib/schema.ts';

export type Scope = 'file' | 'page';

export interface LicenseFinding {
  license: License;
  /** True when the text excludes (part of) the work from an open licence, or credits third-party content. */
  excluded: boolean;
  /** A restriction phrase was found (licence is then all-rights-reserved). */
  restricted: boolean;
  /** Licence mentions disagree with each other, or the version is missing / unsupported. */
  conflict: boolean;
  /** A licence was mentioned without grant wording (citation, bare URL …). Such a text must not inherit a page licence. */
  ambiguous: boolean;
  snippet: string | null;
}

type Kind = 'BY' | 'BY-NC' | 'BY-SA' | 'BY-ND' | 'BY-NC-SA' | 'BY-NC-ND' | 'CC0' | 'PD' | 'GFDL';
interface Mention {
  kind: Kind;
  ver: string | null;
  index: number;
  end: number;
  /** Mention carries its own grant (public-domain statements do). */
  selfGranting?: boolean;
}

/** Dashes, soft hyphens and exotic spaces → plain ones; whitespace collapsed. Newlines survive only if keepNewlines. */
export function normaliseText(s: string, keepNewlines = false): string {
  const t = s
    .replace(/­/g, '')
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[   -​  　﻿]/g, ' ');
  return keepNewlines ? t.replace(/[ \t\r\f\v]+/g, ' ') : t.replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------- restrictions

/** Phrases that exclude content from an open licence or credit third parties. */
const EXCLUSION: RegExp[] = [
  /excluded from (?:our|the|this|any) (?:creative commons |cc |open )?licen[sc]e/i,
  /\bnot covered by\b[^.]{0,40}\blicen[sc]e/i,
  /\b(?:used|reproduced|reprinted|included|republished|adapted|shown|posted) with (?:the )?(?:kind )?permission/i,
  /\bpermission (?:of|from) the (?:author|publisher|copyright|owner)/i,
  /\bcourtesy of\b/i,
];

/** Phrases that deny redistribution. */
const DENIAL: RegExp[] = [
  /all rights reserved/i,
  /\b(?:may|must|can|shall) not be (?:reproduced|redistributed|distributed|copied|reprinted|duplicated|shared|posted)/i,
  /\bno part of (?:this|these|the)\b[^.]{0,80}\bmay be (?:reproduced|copied|reprinted|transmitted|redistributed|distributed|stored|photocopied)/i,
  /\bnot to be (?:reproduced|redistributed|distributed|copied|shared|posted|circulated|reprinted)/i,
  /\bdo not (?:redistribute|distribute|post|share|copy|reproduce|circulate)/i,
  /\bfor (?:the )?(?:personal|private|internal) use\b/i,
  /\bfor the use of (?:enrolled|registered|current) students/i,
  /\b(?:confidential|internal use only|not for (?:distribution|redistribution|publication|circulation))\b/i,
  /\bnot (?:licen[sc]ed|available|released|distributed|published|offered|provided)\b[^.]{0,40}\b(?:under|by|with|as)\b/i,
  /\b(?:is|are|was|were) not\b[^.]{0,20}\bunder (?:a |an |the )?(?:creative commons|cc)\b/i,
  /\b(?:not|never)\b[^.]{0,25}\bpublic domain/i,
];

/** "except figures", "excluding the exercises" … only meaningful right next to a licence statement. */
const EXCEPTION = /\b(?:except|excepting|excluding|exclusive of|other than|apart from|save for)\b[^.]{0,100}/i;

export interface Restriction {
  excluded: boolean;
  snippet: string;
}

/** First context-free restriction phrase in a text, or null (also used for full-text scans of PDFs). */
export function findRestriction(text: string): Restriction | null {
  const t = normaliseText(text);
  for (const re of EXCLUSION) {
    const m = re.exec(t);
    if (m) return { excluded: true, snippet: snippetAround(t, m.index) };
  }
  for (const re of DENIAL) {
    const m = re.exec(t);
    if (m) return { excluded: false, snippet: snippetAround(t, m.index) };
  }
  return null;
}

/** A copyright notice of the file itself (not a grant). */
export function hasCopyrightNotice(text: string): boolean {
  return /(?:©|\(c\)|\bcopyright\b)/i.test(text);
}

// -------------------------------------------------------------------- mentions

function kindFromParts(nc: boolean, sa: boolean, nd: boolean): Kind {
  return ('BY' + (nc ? '-NC' : '') + (sa ? '-SA' : '') + (nd ? '-ND' : '')) as Kind;
}

function findMentions(t: string): Mention[] {
  const out: Mention[] = [];
  const push = (kind: Kind, ver: string | null, m: RegExpExecArray, selfGranting = false) =>
    out.push({ kind, ver, index: m.index, end: m.index + m[0].length, selfGranting });

  // creativecommons.org licence / public-domain URLs
  for (const m of t.matchAll(/creativecommons\.org\/(licenses|publicdomain)\/(by(?:-nc)?(?:-sa|-nd)?|zero|mark)\/(\d\.\d)/gi)) {
    const code = m[2].toLowerCase();
    const mm = m as RegExpExecArray;
    if (code === 'zero') push('CC0', m[3], mm);
    else if (code === 'mark') push('PD', null, mm, false);
    else push(kindFromParts(code.includes('nc'), code.includes('sa'), code.includes('nd')), m[3], mm);
  }
  // Short forms: CC BY-NC-SA 4.0, CC-BY-4.0 (case-sensitive, so "cc by mail" is not one)
  for (const m of t.matchAll(/(?<![A-Za-z0-9])CC[ -]BY((?:[ -]NC)?)((?:[ -]SA)?)((?:[ -]ND)?)(?![A-Za-z0-9])(?:[ -]?(\d\.\d)(?!\d))?/g)) {
    push(kindFromParts(!!m[1], !!m[2], !!m[3]), m[4] ?? null, m as RegExpExecArray);
  }
  // CC0
  for (const m of t.matchAll(/(?<![A-Za-z0-9])CC[ -]?0(?![A-Za-z0-9])/g)) push('CC0', '1.0', m as RegExpExecArray);
  for (const m of t.matchAll(/Creative Commons Zero|CC Zero/gi)) push('CC0', '1.0', m as RegExpExecArray);
  // Long forms
  for (const m of t.matchAll(
    /Creative Commons[ -]+Attribution((?:[ -]{1,3}Non[ -]{0,2}Commercial)?)((?:[ -]{1,3}Share[ -]{0,2}Alike)?)((?:[ -]{1,3}No[ -]{0,2}Deriv(?:ative)?s?)?)(?:[ -]+(\d\.\d)(?!\d))?/gi,
  )) {
    push(kindFromParts(!!m[1], !!m[2], !!m[3]), m[4] ?? null, m as RegExpExecArray);
  }
  // GFDL
  for (const m of t.matchAll(/GNU Free Documentation Licen[sc]e(?:,? *(?:version|v\.?) *(\d\.\d))?/gi)) push('GFDL', m[1] ?? null, m as RegExpExecArray);
  for (const m of t.matchAll(/(?<![A-Za-z0-9])GFDL(?: *v?(\d\.\d))?(?![A-Za-z0-9])/g)) push('GFDL', m[1] ?? null, m as RegExpExecArray);
  // Public-domain statements about the work itself
  for (const m of t.matchAll(
    /\bthis (?:work|document|text|book|material|notes|lecture notes|file|publication|manuscript|article|course|collection)\b[^.]{0,80}?\b(?:is|are|was|has been|have been|be)\s+(?:placed |released |dedicated |donated |made )?(?:in|into|to) the public domain/gi,
  ))
    push('PD', null, m as RegExpExecArray, true);
  for (const m of t.matchAll(/\b(?:hereby )?(?:place|release|dedicate|donate)s?\b[^.]{0,60}\b(?:in|into|to) the public domain/gi)) push('PD', null, m as RegExpExecArray, true);
  return out.sort((a, b) => a.index - b.index);
}

const GRANT_WORD = /\b(?:licen[sc]ed?|released|made available|available|distributed|published|shared|provided|offered|dedicated|waive[ds]?|covered|donated)\b[^.]{0,60}?\b(?:under|with|using|by|as|to)\b|\blicen[sc]e\s*[:-]|\bunder (?:the )?terms\b|\bunder (?:a |an |the )?(?:creative commons|cc)\b/i;
const GRANT_DIRECT = /\blicen[sc]ed?\s*(?:under|with|using|by|as|to|:)?\s*(?:an?|the)?\s*$/i;

/** Text of the current sentence before `idx`, at most 220 characters. */
function sentenceBefore(t: string, idx: number): string {
  const win = t.slice(Math.max(0, idx - 220), idx);
  let cut = 0;
  const re = /[.!?] (?=[A-Z©(])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(win))) cut = m.index + 2;
  return win.slice(cut);
}

function hasGrant(t: string, mt: Mention): boolean {
  if (mt.selfGranting) return true;
  const before = sentenceBefore(t, mt.index);
  return GRANT_WORD.test(before) || GRANT_DIRECT.test(before);
}

function snippetAround(text: string, idx: number) {
  return text.slice(Math.max(0, idx - 80), idx + 160).replace(/\s+/g, ' ').trim();
}

function idFor(kind: Kind, ver: string | null): License | null {
  let id: string;
  if (kind === 'CC0') id = ver === '1.0' ? 'CC0-1.0' : '';
  else if (kind === 'PD') id = 'Public-Domain';
  else if (kind === 'GFDL') id = ver === '1.3' ? 'GFDL-1.3' : '';
  else id = ver ? `CC-${kind}-${ver}` : '';
  return id && isRedistributable(id as License) ? (id as License) : null;
}

export function detectLicense(raw: string): LicenseFinding {
  const full = normaliseText(raw);
  const base: LicenseFinding = { license: 'unknown', excluded: false, restricted: false, conflict: false, ambiguous: false, snippet: null };

  // 1. Restrictions veto everything.
  const restriction = findRestriction(full);
  if (restriction) return { ...base, license: 'all-rights-reserved', excluded: restriction.excluded, restricted: true, snippet: restriction.snippet };

  // 2. Licence mentions before a "References"/"Bibliography" heading only.
  const nl = normaliseText(raw, true);
  const head = /^ *(?:references|bibliography) *$/im.exec(nl);
  const scan = head ? normaliseText(nl.slice(0, head.index)) : full;
  const mentions = findMentions(scan);
  if (!mentions.length) return { ...base, ambiguous: !!head && findMentions(full).length > 0 };

  const granted: Mention[] = [];
  const ungranted: Mention[] = [];
  for (const mt of mentions) {
    const cited = /\[\d{1,3}\]/.test(scan.slice(Math.max(0, mt.index - 220), mt.index)); // bracketed citation just before
    if (!cited && hasGrant(scan, mt)) granted.push(mt);
    else ungranted.push(mt);
  }
  if (!granted.length) return { ...base, ambiguous: true, snippet: snippetAround(scan, mentions[0].index) };

  // 3. "Licensed … except figures": an exception next to the grant vetoes it.
  for (const mt of granted) {
    const around = `${scan.slice(Math.max(0, mt.index - 140), mt.index)} ${scan.slice(mt.end, mt.end + 200)}`;
    if (EXCEPTION.test(around)) return { ...base, license: 'all-rights-reserved', excluded: true, restricted: true, snippet: snippetAround(scan, mt.index) };
  }

  // 4. All mentions must agree on kind and version.
  const kinds = new Set([...granted, ...ungranted].map((m) => m.kind));
  if (kinds.size > 1) return { ...base, conflict: true, ambiguous: true, snippet: snippetAround(scan, granted[0].index) };
  const vers = new Set(granted.map((m) => m.ver).filter((v): v is string => !!v));
  if (vers.size > 1) return { ...base, conflict: true, snippet: snippetAround(scan, granted[0].index) };
  const ver = [...vers][0] ?? null;
  const lic = idFor(granted[0].kind, ver);
  if (!lic) return { ...base, conflict: true, snippet: snippetAround(scan, granted[0].index) }; // missing or unsupported version
  return { ...base, license: lic, ambiguous: ungranted.length > 0, snippet: snippetAround(scan, granted[0].index) };
}

// ------------------------------------------------------------------ HTML pages

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const CHROME_TAGS = new Set(['script', 'style', 'noscript', 'template', 'footer', 'header', 'nav', 'aside', 'head']);
const NEVER_BY_CLASS = new Set(['html', 'body', 'main']);
const CHROME_ROLE = /\brole\s*=\s*["']?(?:contentinfo|navigation|banner|complementary)\b/i;
const CHROME_CLASS = /(?:^|[\s_-])(?:footer|site-?info|copyright|colophon)(?:$|[\s_-])/i;
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

function isChrome(name: string, attrs: string): boolean {
  if (CHROME_TAGS.has(name)) return true;
  if (CHROME_ROLE.test(attrs)) return true;
  if (NEVER_BY_CLASS.has(name)) return false;
  for (const m of attrs.matchAll(/\b(?:class|id)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    if (CHROME_CLASS.test(m[1] ?? m[2] ?? m[3] ?? '')) return true;
  }
  return false;
}

/**
 * Removes head, script/style, footer/header/nav/aside, [role=contentinfo|navigation|banner|complementary]
 * and footer-ish class/id subtrees, matching nested same-name tags. An unclosed chrome element drops the rest
 * of the document (the safe direction: less evidence, never more).
 */
export function stripChrome(html: string): string {
  const src = html.replace(/<!--[\s\S]*?-->/g, ' ');
  let out = '';
  let last = 0;
  let skip: string | null = null;
  let depth = 0;
  for (const m of src.matchAll(TAG_RE)) {
    const idx = m.index!;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const selfClosing = /\/\s*$/.test(m[3]) || VOID.has(name);
    if (skip) {
      if (name === skip && !selfClosing) {
        if (closing) {
          if (--depth === 0) {
            skip = null;
            last = idx + m[0].length;
          }
        } else depth++;
      }
      continue;
    }
    if (!closing && isChrome(name, m[3])) {
      out += src.slice(last, idx) + ' ';
      if (selfClosing) {
        last = idx + m[0].length;
        continue;
      }
      skip = name;
      depth = 1;
    }
  }
  if (!skip) out += src.slice(last);
  return out;
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '-', mdash: '-', hyphen: '-', copy: '©', shy: '' };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

/** Visible text of already stripped HTML; creativecommons.org link targets are kept as text. */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<a\b[^>]*\bhref\s*=\s*["']?((?:https?:)?\/\/(?:www\.)?creativecommons\.org[^"'\s>]*)[^>]*>/gi, ' $1 ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');
}

/** Main-content text of an HTML page (chrome removed). */
export function mainText(html: string): string {
  return htmlToText(stripChrome(html));
}

/** rel="license" link inside the main content only (footer/nav/header/aside links are site-wide, not page evidence). */
export function relLicense(html: string): string | null {
  const s = stripChrome(html);
  for (const m of s.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\brel\s*=\s*["'][^"']*\blicen[sc]e\b/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const url = href?.[1] ?? href?.[2] ?? href?.[3];
    if (url) return decodeEntities(url);
  }
  return null;
}

/** Licence finding for an HTML page: main-content text, plus a main-content rel="license" link as a grant sentence. */
export function analysePage(html: string): LicenseFinding {
  const text = mainText(html);
  const rel = relLicense(html);
  return detectLicense(rel ? `${text} This page is licensed under ${rel} .` : text);
}
