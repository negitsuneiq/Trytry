// Shared data contract for data/*.json. Used by the site, the crawler and the
// validator, so it must stay free of Astro- or browser-only imports.

export type Level = 'undergraduate' | 'graduate';
export type DocType = 'lecture-notes' | 'problem-set' | 'exam' | 'book' | 'other';
export type LinkStatus = 'ok' | 'broken' | 'redirected' | 'unchecked';

/** Licenses that permit redistribution; anything else must be linked, not hosted. */
export const REDISTRIBUTABLE = [
  'CC0-1.0',
  'Public-Domain',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'CC-BY-SA-4.0',
  'CC-BY-SA-3.0',
  'CC-BY-NC-4.0',
  'CC-BY-NC-3.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-NC-SA-3.0',
  'CC-BY-ND-4.0',
  'CC-BY-NC-ND-4.0',
  'CC-BY-NC-ND-3.0',
  'GFDL-1.3',
] as const;

export type RedistributableLicense = (typeof REDISTRIBUTABLE)[number];
/** `unknown` = no licence found; `all-rights-reserved` = explicit restriction. */
export type License = RedistributableLicense | 'unknown' | 'all-rights-reserved';

export interface University {
  rank: number;
  /** Rank as printed by the source, e.g. "=6". */
  rank_label: string;
  slug: string;
  name: string;
  /** ISO 3166-1 alpha-2, rendered per language with Intl.DisplayNames. */
  country: string;
  department: string;
  department_url: string;
  ranking_source: string;
  ranking_url: string;
  ranking_year: number;
}

export interface DocumentRecord {
  id: string;
  title: string;
  authors: string[];
  university: string; // University.slug
  department: string;
  course_code: string | null;
  course_title: string | null;
  level: Level;
  type: DocType;
  topics: string[]; // Topic slugs, see topics.ts
  year: number | null;
  pages: number | null;
  language: 'en';
  license: License;
  license_url: string | null;
  /** Page where the licence statement was found (file- or course-level). */
  license_evidence: string | null;
  source_url: string;
  hosted: boolean;
  file_path: string | null; // relative to public/, e.g. "docs/mit/18-100a-notes.pdf"
  file_size: number | null; // bytes
  sha256: string | null;
  accessed_at: string; // ISO date
  last_checked: string; // ISO date
  link_status: LinkStatus;
  description?: string | null;
}

export const LICENSE_INFO: Record<License, { label: string; url: string | null }> = {
  'CC0-1.0': { label: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'Public-Domain': { label: 'Public Domain', url: 'https://creativecommons.org/publicdomain/mark/1.0/' },
  'CC-BY-4.0': { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'CC-BY-3.0': { label: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
  'CC-BY-SA-4.0': { label: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  'CC-BY-SA-3.0': { label: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  'CC-BY-NC-4.0': { label: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  'CC-BY-NC-3.0': { label: 'CC BY-NC 3.0', url: 'https://creativecommons.org/licenses/by-nc/3.0/' },
  'CC-BY-NC-SA-4.0': { label: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  'CC-BY-NC-SA-3.0': { label: 'CC BY-NC-SA 3.0', url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/' },
  'CC-BY-ND-4.0': { label: 'CC BY-ND 4.0', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
  'CC-BY-NC-ND-4.0': { label: 'CC BY-NC-ND 4.0', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  'CC-BY-NC-ND-3.0': { label: 'CC BY-NC-ND 3.0', url: 'https://creativecommons.org/licenses/by-nc-nd/3.0/' },
  'GFDL-1.3': { label: 'GNU FDL 1.3', url: 'https://www.gnu.org/licenses/fdl-1.3.html' },
  unknown: { label: 'No licence stated', url: null },
  'all-rights-reserved': { label: 'All rights reserved', url: null },
};

/** Licence label; the two non-licence states are translated by the caller's dictionary. */
export function licenseLabel(l: License, status: Record<'unknown' | 'all-rights-reserved', string>): string {
  return l === 'unknown' || l === 'all-rights-reserved' ? status[l] : LICENSE_INFO[l].label;
}

export function isRedistributable(l: License): l is RedistributableLicense {
  return (REDISTRIBUTABLE as readonly string[]).includes(l);
}

export const DOC_TYPES: DocType[] = ['lecture-notes', 'problem-set', 'exam', 'book', 'other'];
export const LEVELS: Level[] = ['undergraduate', 'graduate'];

/** GitHub Pages limits, see README. */
export const MAX_HOSTED_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_HOSTED_TOTAL_BYTES = 700 * 1024 * 1024;
