// Courses are derived at build time from documents.json: one course is one
// university plus one course code (or, without a code, one course title).
// Nothing here touches the data files; documents with neither stay course-less.

import type { DocType, DocumentRecord, Level } from './schema';
import { DOC_TYPES } from './schema';
import { documents, universities } from './data';
import { authorsLine, realYear } from './format';

export interface Course {
  slug: string;
  university: string;
  /** Display code, e.g. "MAT 520"; null for courses known only by title. */
  code: string | null;
  title: string;
  instructors: string[];
  level: Level;
  topics: string[];
  years: [number, number] | null;
  counts: Partial<Record<DocType, number>>;
  pages: number;
  /** In reading order: type group, natural number, year, title. */
  docs: DocumentRecord[];
  /** Short row label per document id (course prefix stripped). */
  labels: Record<string, string>;
  /** The documents come from several terms or instructors (same lecture number repeated in different years). */
  multiTerm: boolean;
  /** Only when `multiTerm`: document id → term heading, e.g. "2005 · Instructor". Empty when a document has neither year nor author. */
  terms: Record<string, string>;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function mostCommon<T>(items: T[]): T[] {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
}

/** Text before the first ": " of a title, without a trailing "(Fall 2006)" and a leading course code. */
function titlePrefix(title: string, code: string | null): string | null {
  const i = title.indexOf(': ');
  if (i < 1) return null;
  let p = title.slice(0, i).replace(/\s*\([^)]*\)\s*$/, '');
  if (code) {
    const n = norm(code);
    const m = /^\S+(?:\s\S+)?/.exec(p);
    if (m && norm(m[0]) === n) p = p.slice(m[0].length).trim();
    else if (norm(p.slice(0, code.length)) === n) p = p.slice(code.length).trim();
  }
  return p || null;
}

function labelFor(doc: DocumentRecord, code: string | null, ctitle: string, common: string | null): string {
  const t = doc.title;
  const i = t.indexOf(': ');
  if (i > 0) {
    const prefix = t.slice(0, i);
    const np = norm(prefix);
    const hit =
      prefix === common ||
      (code != null && np.startsWith(norm(code))) ||
      (ctitle !== '' && np.startsWith(norm(ctitle))) ||
      (common != null && np.includes(norm(common)));
    if (hit && t.slice(i + 2).trim()) return t.slice(i + 2).trim();
  }
  if (code) {
    const m = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')}[\\s:–—-]+`, 'i').exec(t);
    if (m && t.slice(m[0].length).trim()) return t.slice(m[0].length).trim();
  }
  return t;
}

/** A short code without digits ("IA", "NSTIB") that several different courses share. */
const isWeakCode = (n: string) => n.length <= 4 && !/\d/.test(n);

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * The lecture/week/chapter number carried by the file name of a document's source URL
 * ("…/ebe195…_MIT18_310F13_Ch13.pdf" → 13, "lec07.pdf" → 7, "notes_3.pdf" → 3), or null.
 */
export function fileNumber(url: string): number | null {
  let seg = url.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop() ?? '';
  try {
    seg = decodeURIComponent(seg);
  } catch {}
  seg = seg.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/^[0-9a-f]{16,}[_-]/i, '');
  const key = /(?:^|[^a-z])(?:ch|chap|chapter|lec|lect|lecture|week|wk|notes?|ps|pset|hw|set|sec|section|part|unit|topic|class|day|session|handout|assignment|sheet|exercises?|problems?|module|l|w)[\s_.-]*0*(\d{1,3})(?!\d)/i.exec(seg);
  if (key) return Number(key[1]);
  const nums = [...seg.matchAll(/\d+/g)].map((m) => m[0]).filter((n) => n.length <= 3);
  return nums.length ? Number(nums[nums.length - 1]) : null;
}

/** Longest run of leading (or trailing) words shared by all titles, if it names a subject. */
function commonWords(titles: string[]): string | null {
  const ws = titles.map((t) => t.replace(/[:(].*$/, '').trim().split(/\s+/));
  if (ws.length < 2) return null;
  const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'in', 'on', 'for', 'introduction', 'notes', 'lecture', 'lectures']);
  for (const tail of [false, true]) {
    const rows = tail ? ws.map((w) => [...w].reverse()) : ws;
    let n = 0;
    while (rows.every((r) => r[n] != null && r[n].toLowerCase() === rows[0][n].toLowerCase())) n++;
    if (n === 0) continue;
    const run = rows[0].slice(0, n);
    if (tail) run.reverse();
    if (run.some((w) => !STOP.has(w.toLowerCase()) && w.length > 2)) return run.join(' ');
  }
  return null;
}
const sortKey = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '');

function build(): Course[] {
  const groups = new Map<string, DocumentRecord[]>();
  // A number reused for different subjects ("Topics in ..." courses) is several courses, told apart by title.
  const titleCounts = new Map<string, Map<string, number>>();
  for (const d of documents) {
    if (!d.course_code || !d.course_title) continue;
    const k = `${d.university}|${norm(d.course_code)}`;
    const m = titleCounts.get(k) ?? new Map<string, number>();
    m.set(norm(d.course_title), (m.get(norm(d.course_title)) ?? 0) + 1);
    titleCounts.set(k, m);
  }
  const SPLIT_MIN = 8;
  const splitTitle = (uni: string, code: string, title: string) => {
    const m = titleCounts.get(`${uni}|${code}`);
    if (!m || !title) return false;
    const big = [...m.entries()].filter(([, n]) => n >= SPLIT_MIN).sort((a, b) => b[1] - a[1]);
    // The most common title keeps the plain code; other well-populated titles become their own course.
    return big.length > 1 && big[0][0] !== title && (m.get(title) ?? 0) >= SPLIT_MIN;
  };
  for (const d of documents) {
    const code = d.course_code ? norm(d.course_code) : '';
    const title = d.course_title ? norm(d.course_title) : '';
    // Tripos parts such as "IA" or "II" name a year, not a course: the title tells the courses apart.
    const key = code && !(isWeakCode(code) && title)
      ? splitTitle(d.university, code, title) ? `${d.university}|c|${code}|${title}` : `${d.university}|c|${code}`
      : title ? `${d.university}|t|${title}` : null;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  const out: Course[] = [];
  const used = new Set<string>();
  const rank = new Map(universities.map((u) => [u.slug, u.rank]));
  for (const [, docs] of [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    if (docs.length < 2) continue;
    const university = docs[0].university;
    const code = mostCommon(docs.map((d) => d.course_code).filter((c): c is string => !!c))[0] ?? null;
    const prefixes = docs.map((d) => titlePrefix(d.title, code)).filter((p): p is string => !!p);
    const prefixTop = mostCommon(prefixes)[0];
    const common = prefixTop && prefixes.filter((p) => p === prefixTop).length >= Math.max(2, docs.length * 0.4) ? prefixTop : null;
    let title = mostCommon(docs.map((d) => d.course_title).filter((c): c is string => !!c))[0] ?? common ?? code ?? docs[0].title;
    // A "title" that merely repeats the code: take the subject the documents share, else show the code once.
    const codeOnly = code != null && norm(title) === norm(code);
    if (codeOnly) title = common ?? commonWords(docs.map((d) => titlePrefix(d.title, code) ?? d.title)) ?? title;

    const labels: Record<string, string> = {};
    for (const d of docs) labels[d.id] = labelFor(d, code, title, common);

    const typeIdx = (d: DocumentRecord) => DOC_TYPES.indexOf(d.type === 'book' ? 'other' : d.type);
    // A course taught in several terms repeats "Lecture 1", "Lecture 2"…; keep each term together.
    const lead = (d: DocumentRecord) => `${d.type}|${(/^\D*\d+/.exec(sortKey(labels[d.id])) ?? [''])[0].toLowerCase()}`;
    const seen = new Map<string, number | null>();
    let multiTerm = false;
    for (const d of docs) {
      const k = lead(d);
      if (k.endsWith('|')) continue;
      if (seen.has(k) && seen.get(k) !== d.year) multiTerm = true;
      seen.set(k, d.year);
    }
    const termOf = (d: DocumentRecord) => {
      const yr = realYear(d.year, d.accessed_at);
      const by = d.authors.length ? authorsLine(d.authors.slice(0, 2)) : '';
      return { key: `${yr ?? ''}|${by}`, label: [yr, by].filter(Boolean).join(' · '), year: yr ?? d.year ?? 0 };
    };
    const termKey = (d: DocumentRecord) => (multiTerm ? termOf(d).key : '');
    // Within one type (and term), titles that carry no number are ordered by the number in the source file name.
    const byFile = new Set<string>();
    const fileNo = new Map(docs.map((d) => [d.id, fileNumber(d.source_url)] as const));
    const grouped = new Map<string, DocumentRecord[]>();
    for (const d of docs) grouped.set(`${typeIdx(d)}|${termKey(d)}`, [...(grouped.get(`${typeIdx(d)}|${termKey(d)}`) ?? []), d]);
    for (const [k, g] of grouped) {
      const numbered = g.filter((d) => /\d/.test(sortKey(labels[d.id]))).length;
      const nums = g.map((d) => fileNo.get(d.id)).filter((n): n is number => n != null);
      // The numbers must form one series (mostly distinct); "fourierint1, fseries1, fourierint2…" does not.
      if (g.length > 2 && numbered < g.length / 2 && nums.length >= g.length / 2 && new Set(nums).size >= nums.length * 0.85) byFile.add(k);
    }
    const sorted = [...docs].sort((a, b) => {
      const ka = `${typeIdx(a)}|${termKey(a)}`;
      const same = ka === `${typeIdx(b)}|${termKey(b)}`;
      return (
        typeIdx(a) - typeIdx(b) ||
        (multiTerm ? termOf(a).year - termOf(b).year || collator.compare(termOf(a).key, termOf(b).key) : 0) ||
        (same && byFile.has(ka) ? (fileNo.get(a.id) ?? 1e9) - (fileNo.get(b.id) ?? 1e9) : 0) ||
        collator.compare(sortKey(labels[a.id]), sortKey(labels[b.id])) ||
        (a.year ?? 0) - (b.year ?? 0) ||
        collator.compare(a.title, b.title)
      );
    });
    const terms: Record<string, string> = {};
    if (multiTerm) for (const d of docs) terms[d.id] = termOf(d).label;

    const base = `${university}-${slugify(code && !isWeakCode(norm(code)) ? code : title)}`.replace(/-+$/, '');
    const showCode = codeOnly && norm(title) === norm(code!) ? null : code;
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);

    const years = docs.map((d) => d.year).filter((y): y is number => y != null);
    const counts: Course['counts'] = {};
    for (const d of docs) counts[d.type] = (counts[d.type] ?? 0) + 1;
    out.push({
      slug,
      university,
      code: showCode,
      title,
      instructors: mostCommon(docs.flatMap((d) => d.authors)),
      level: mostCommon(docs.map((d) => d.level))[0],
      topics: mostCommon(docs.flatMap((d) => d.topics)).slice(0, 3),
      years: years.length ? [Math.min(...years), Math.max(...years)] : null,
      counts,
      pages: docs.reduce((n, d) => n + (d.pages ?? 0), 0),
      docs: sorted,
      labels,
      multiTerm,
      terms,
    });
  }
  return out.sort(
    (a, b) =>
      (rank.get(a.university) ?? 99) - (rank.get(b.university) ?? 99) ||
      b.docs.length - a.docs.length ||
      a.slug.localeCompare(b.slug),
  );
}

/** Every course with at least two documents, in university ranking order, then by size. */
export const courses: Course[] = build();
export const courseBySlug = new Map(courses.map((c) => [c.slug, c]));
export const courseOfDoc = new Map<string, Course>(courses.flatMap((c) => c.docs.map((d) => [d.id, c] as const)));

export function coursesForUniversity(slug: string): Course[] {
  return courses.filter((c) => c.university === slug).sort((a, b) => b.docs.length - a.docs.length || a.slug.localeCompare(b.slug));
}

/** What the library card shows for a document's course: its own code, else its course title. */
export function courseLabel(d: Pick<DocumentRecord, 'course_code' | 'course_title'>): string | null {
  return d.course_code ?? d.course_title;
}

/** Up to `n` other documents of the same university and first topic, at most two per course. */
export function relatedDocuments(doc: DocumentRecord, n = 6): DocumentRecord[] {
  const topic = doc.topics[0];
  if (!topic) return [];
  const perCourse = new Map<string, number>();
  const out: DocumentRecord[] = [];
  const pool = documents
    .filter((d) => d.id !== doc.id && d.university === doc.university && d.topics[0] === topic)
    .sort((a, b) => Number(b.hosted) - Number(a.hosted) || a.title.localeCompare(b.title));
  for (const d of pool) {
    const k = courseOfDoc.get(d.id)?.slug ?? d.id;
    if ((perCourse.get(k) ?? 0) >= 2) continue;
    perCourse.set(k, (perCourse.get(k) ?? 0) + 1);
    out.push(d);
    if (out.length === n) break;
  }
  return out;
}
