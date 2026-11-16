// Markup of the "save to my reading list" toggle, shared by the server-rendered
// pages and the client-rendered cards so both stay identical. State and labels
// are kept in sync by scripts/saved.ts (delegated, on the data-save attribute).

export type SaveKind = 'doc' | 'course';
export interface SaveLabels {
  add: string;
  remove: string;
  /** text of the course page button, e.g. "Save course" */
  addCourse?: string;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);

export const BOOKMARK_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6.5 3.5h11v17L12 16.6 6.5 20.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

/** Quiet icon toggle (cards). */
export function saveIcon(kind: SaveKind, id: string, pressed: boolean, l: SaveLabels): string {
  const label = pressed ? l.remove : l.add;
  return `<button type="button" class="save save-icon" data-save="${kind}" data-id="${esc(id)}" aria-pressed="${pressed}" aria-label="${esc(label)}" title="${esc(label)}">${BOOKMARK_SVG}</button>`;
}

/** Button with a text label (document and course pages). */
export function saveText(kind: SaveKind, id: string, pressed: boolean, l: SaveLabels, small = false): string {
  const label = pressed ? l.remove : kind === 'course' ? l.addCourse ?? l.add : l.add;
  return `<button type="button" class="btn${small ? ' btn-sm' : ''} save save-text" data-save="${kind}" data-id="${esc(id)}" aria-pressed="${pressed}">${BOOKMARK_SVG}<span data-save-text>${esc(label)}</span></button>`;
}
