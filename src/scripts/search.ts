// Library search. Every query token must match as a word prefix somewhere in
// a document's searchable text; case and diacritics are folded (Turkish aware)
// on both sides, course codes match with or without separators, and Turkish
// terms are also tried as their English equivalents (src/lib/glossary.ts).

import { GLOSSARY } from '../lib/glossary';
import type { CardCfg, CardRec } from '../lib/cardRec';

/** Lower-case, drop diacritics, map Turkish dotted/dotless i. "Ölçü İ" → "olcu i". */
export function fold(s: string): string {
  return s
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
const words = (s: string): string[] => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

// ── Glossary: folded Turkish phrase → English phrases ──────────────────────
const GLOSS = new Map<string, string[]>();
let MAX_PHRASE = 1;
for (const line of GLOSSARY.split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [tr, en] = line.split('=');
  const key = words(tr).join(' ');
  GLOSS.set(key, en.split('|').map((e) => e.trim()));
  MAX_PHRASE = Math.max(MAX_PHRASE, key.split(' ').length);
}
const GLOSS_KEYS = [...GLOSS.keys()];

/** Turkish plural / possessive endings, tried on the last word when the exact form is unknown. */
const STEMS = (w: string): string[] => {
  const out = [w];
  const pl = w.replace(/l[ae]r(i|in|ini|e|de|den)?$/, '');
  const poss = (x: string) => x.replace(/(s[iu]|i|u)(n|ni|nin)?$/, '');
  for (const x of [pl, poss(w), poss(pl), w.replace(/ig(i|in)$/, 'ik')]) if (x && x !== w) out.push(x);
  return out;
};

function lookup(ws: string[]): string[] | undefined {
  const head = ws.slice(0, -1).join(' ');
  for (const stem of STEMS(ws[ws.length - 1])) {
    const hit = GLOSS.get(head ? `${head} ${stem}` : stem);
    if (hit) return hit;
  }
}

// ── Query ──────────────────────────────────────────────────────────────────
/** One position of the query: the typed words, or any of their English equivalents. */
interface Unit {
  alts: string[][];
}
export interface Query {
  units: Unit[];
  /** Query without separators, for course codes ("18.100" → "18100"). */
  compact: string;
}

export function parseQuery(raw: string): Query | null {
  const ws = words(raw);
  if (!ws.length) return null;
  const units: Unit[] = [];
  for (let i = 0; i < ws.length; ) {
    let hit: string[] | undefined;
    let len = 1;
    for (let n = Math.min(MAX_PHRASE, ws.length - i); n >= 1 && !hit; n--) {
      hit = lookup(ws.slice(i, i + n));
      if (hit) len = n;
    }
    const alts = [ws.slice(i, i + len)];
    if (hit) for (const e of hit) alts.push(words(e));
    units.push({ alts });
    i += len;
  }
  // The last words may be a Turkish phrase still being typed ("olcu teo"):
  // also try the English of every glossary entry that starts with them.
  let tail = 0;
  while (tail < units.length && units[units.length - 1 - tail].alts.length === 1) tail++;
  for (let n = Math.min(tail, MAX_PHRASE); n >= 1; n--) {
    const typed = ws.slice(-n);
    const phrase = typed.join(' ');
    if (phrase.length < 3) break;
    const keys = GLOSS_KEYS.filter((k) => k.startsWith(phrase));
    if (!keys.length) continue;
    const alts = [typed];
    for (const k of keys.slice(0, 8)) for (const e of GLOSS.get(k)!) alts.push(words(e));
    units.splice(units.length - n, n, { alts });
    break;
  }
  return { units, compact: ws.join('') };
}

// ── Index ──────────────────────────────────────────────────────────────────
/** Fields in ranking order: course code, title, authors, course, everything else. */
const WEIGHT = [6, 5, 3, 2, 1];

export interface Doc {
  f: string[][];
  /** Course code without separators, "18100" / "math131". */
  code: string;
}

export function buildIndex(recs: CardRec[], cfg: CardCfg): Doc[] {
  const typeNames: Record<string, string> = {};
  return recs.map((r) => {
    const topics = r.p.map((tp) => `${cfg.topics[tp]?.[0] ?? tp} ${cfg.topics[tp]?.[1] ?? ''}`).join(' ');
    typeNames[r.ty] ??= `${r.ty.replace(/-/g, ' ')} ${cfg.types[r.ty] ?? ''} ${TYPE_TR[r.ty] ?? ''}`;
    const code = r.cc ?? '';
    return {
      f: [
        words(code),
        words(r.t.replace(/\$([^$]+)\$/g, '$1')),
        words((r.a ?? []).join(' ')),
        words(r.c ?? ''),
        words(`${cfg.unis[r.u]?.[0] ?? r.u} ${topics} ${typeNames[r.ty]}`),
      ],
      code: fold(code).replace(/[^a-z0-9]/g, ''),
    };
  });
}

/** Type labels in both languages, whichever page language is active. */
const TYPE_TR: Record<string, string> = {
  'lecture-notes': 'ders notları ders notu',
  'problem-set': 'problem seti ödev alıştırma',
  exam: 'sınav',
  book: 'kitap',
  other: 'diğer',
};

/** A short token must be a whole word (so "ode" is not "odessa"), unless it is still being typed. */
const SHORT = 2;

function best(d: Doc, tok: string, whole: boolean): number {
  let score = -1;
  for (let k = 0; k < d.f.length; k++) {
    for (const w of d.f[k]) {
      if (w === tok) {
        if (WEIGHT[k] + 1 > score) score = WEIGHT[k] + 1;
      } else if (!whole && w.startsWith(tok) && WEIGHT[k] > score) score = WEIGHT[k];
    }
  }
  return score;
}

/** Score of a document for the query, or -1 when it does not match. */
export function scoreDoc(d: Doc, q: Query): number {
  // Course code typed without separators or spaces: "18100", "math131".
  if (q.compact.length >= 3 && /\d/.test(q.compact) && d.code && d.code.startsWith(q.compact)) {
    return 100 + (d.code === q.compact ? 20 : 0);
  }
  let total = 0;
  for (let u = 0; u < q.units.length; u++) {
    const last = u === q.units.length - 1;
    let top = -1;
    for (const alt of q.units[u].alts) {
      let sum = 0;
      for (let i = 0; i < alt.length; i++) {
        const tok = alt[i];
        const s = best(d, tok, tok.length <= SHORT && !(last && i === alt.length - 1));
        if (s < 0) {
          sum = -1;
          break;
        }
        sum += s;
      }
      if (sum > top) top = sum;
    }
    if (top < 0) return -1;
    total += top;
  }
  return total;
}
