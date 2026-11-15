// Shape of one entry in /courses-index.json, shared by the build-time endpoint
// and the library's client-side course view. Short keys: the file is fetched by
// the library page and shared by both languages.

export interface CourseRec {
  /** slug of the course page */
  s: string;
  /** code, e.g. "18.05" */
  c?: string;
  /** title */
  t: string;
  /** university slug */
  u: string;
  /** level */
  l: string;
  /** top topic slugs */
  p: string[];
  /** instructors (first three) */
  a?: string[];
  /** first and last year */
  y?: [number, number];
  /** number of documents */
  d: number;
  /** documents per type, in DOC_TYPES order */
  ct: number[];
  /** number of hosted documents */
  h: number;
  /** position in the default order (university rank, then size) */
  o: number;
  /** position in the title-sorted order */
  n: number;
}

/** Localised labels for the course view; emitted by LibraryBrowser.astro as #course-cfg. */
export interface CourseCfg {
  /** URL of courses-index.json */
  index: string;
  /** DOC_TYPES, the order of CourseRec.ct */
  types: string[];
  /** per type: [singular, plural] count text with "{n}" */
  counts: Record<string, [string, string]>;
  /** [singular, plural] "{n} documents" */
  docs: [string, string];
  /** [singular, plural] "{n} courses", for the result count */
  results: [string, string];
  stripTitle: string;
  stripAll: string;
}
