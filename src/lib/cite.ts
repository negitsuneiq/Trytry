import type { DocumentRecord, University } from './schema';
import { LICENSE_INFO } from './schema';
import { plainTex } from './math';

const BIB_TYPE: Record<DocumentRecord['type'], string> = {
  'lecture-notes': 'misc',
  'problem-set': 'misc',
  exam: 'misc',
  book: 'book',
  other: 'misc',
};

/** Escape LaTeX specials in plain text. */
function esc(s: string): string {
  return s.replace(/([&%#_])/g, '\\$1');
}

/** Like esc, but leaves $…$ math spans untouched (an escaped "_" would break a subscript). */
function bibEscape(s: string): string {
  return s
    .split(/(\$[^$]+\$)/g)
    .map((part, i) => (i % 2 === 1 ? part : esc(part)))
    .join('');
}

function lastName(a: string): string {
  const parts = a.trim().split(/\s+/);
  return (parts.at(-1) ?? 'anon').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
}

export function bibtex(d: DocumentRecord, u: University | undefined): string {
  const key = `${lastName(d.authors[0] ?? 'anon')}${d.year ?? ''}${d.id.split('-').slice(-1)[0]}`;
  const fields: [string, string | null][] = [
    ['author', d.authors.length ? esc(d.authors.join(' and ')) : null],
    ['title', `{${bibEscape(d.title)}}`],
    [d.type === 'book' ? 'publisher' : 'institution', esc(u ? `${u.name}, ${d.department}` : d.department)],
    ['year', d.year ? String(d.year) : null],
    ['note', esc([d.course_code, d.course_title].filter(Boolean).join(': ')) || null],
    ['howpublished', d.type === 'book' ? null : `\\url{${d.source_url}}`],
    ['url', d.source_url],
    ['urldate', d.accessed_at.slice(0, 10)],
    ['license', LICENSE_INFO[d.license].label],
  ];
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k.padEnd(12)} = {${v}}`)
    .join(',\n');
  return `@${BIB_TYPE[d.type]}{${key},\n${body}\n}`;
}

export interface CiteLabels {
  unknownAuthor: string;
  availableAt: string;
  accessedOn: string;
}

export function plainCitation(d: DocumentRecord, u: University | undefined, labels: CiteLabels): string {
  const who = d.authors.length ? d.authors.join(', ') : labels.unknownAuthor;
  const course = [d.course_code, d.course_title].filter(Boolean).join(' ');
  const parts = [
    `${who}${d.year ? ` (${d.year})` : ''}.`,
    `${plainTex(d.title)}.`,
    course ? `${course},` : '',
    u ? `${u.name}.` : `${d.department}.`,
    `${labels.availableAt} ${d.source_url} (${labels.accessedOn} ${d.accessed_at.slice(0, 10)}).`,
  ];
  return parts.filter(Boolean).join(' ');
}
