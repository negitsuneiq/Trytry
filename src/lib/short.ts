// Short title of a document inside its course: the course prefix is already
// shown on its own line, so cards and the document page lead with the rest.
import type { DocumentRecord } from './schema';
import { courseOfDoc } from './courses';

/** The short label of a document that belongs to a course, else null. */
export function shortTitle(doc: Pick<DocumentRecord, 'id' | 'title'>): string | null {
  const s = courseOfDoc.get(doc.id)?.labels[doc.id]?.trim();
  return s && s !== doc.title ? s : null;
}

/** "18.310 Principles of …" – the course line of a card. */
export function courseLine(doc: Pick<DocumentRecord, 'course_code' | 'course_title'>): string | null {
  return [doc.course_code, doc.course_title].filter(Boolean).join(' ') || null;
}
