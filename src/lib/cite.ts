import type { DocumentRecord, University } from './schema';
import { LICENSE_INFO } from './schema';

const BIB_TYPE: Record<DocumentRecord['type'], string> = {
  'lecture-notes': 'misc',
  'problem-set': 'misc',
  exam: 'misc',
  book: 'book',
  other: 'misc',
};

function bibEscape(s: string): string {
  return s.replace(/([&%#_])/g, '\\$1');
}

function lastName(a: string): string {
  const parts = a.trim().split(/\s+/);
  return (parts.at(-1) ?? 'anon').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
}

export function bibtex(d: DocumentRecord, u: University | undefined): string {
  const key = `${lastName(d.authors[0] ?? 'anon')}${d.year ?? ''}${d.id.split('-').slice(-1)[0]}`;
  const fields: [string, string | null][] = [
    ['author', d.authors.length ? d.authors.join(' and ') : null],
    ['title', `{${bibEscape(d.title)}}`],
    [d.type === 'book' ? 'publisher' : 'institution', u ? `${u.name}, ${d.department}` : d.department],
    ['year', d.year ? String(d.year) : null],
    ['note', [d.course_code, d.course_title].filter(Boolean).join(': ') || null],
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

export function plainCitation(d: DocumentRecord, u: University | undefined): string {
  const who = d.authors.length ? d.authors.join(', ') : 'Unknown author';
  const course = [d.course_code, d.course_title].filter(Boolean).join(' ');
  const parts = [
    `${who}${d.year ? ` (${d.year})` : ''}.`,
    `${d.title}.`,
    course ? `${course},` : '',
    u ? `${u.name}.` : `${d.department}.`,
    `Available at ${d.source_url} (accessed ${d.accessed_at.slice(0, 10)}).`,
  ];
  return parts.filter(Boolean).join(' ');
}
