// Shape of one entry in /docs-index.json, shared by the build-time endpoint
// and the client card renderer. Short keys: the file is fetched by every
// library, topic and university page.

export interface CardRec {
  /** id */
  i: string;
  /** title (plain, TeX source kept) */
  t: string;
  /** authors */
  a?: string[];
  /** university slug */
  u: string;
  /** topic slugs */
  p: string[];
  /** level */
  l: string;
  /** type */
  ty: string;
  /** license */
  li: string;
  /** hosted: 1 when the PDF is served from this site */
  h?: 1;
  /** a thumbnail image exists */
  th?: 1;
  /** year */
  y?: number;
  /** accessed_at */
  d: string;
  /** position in the title-sorted order */
  n: number;
  /** position in the default order (varied across universities and courses) */
  o: number;
  /** slug of the course page, only when the document's course has one */
  k?: string;
  /** "code title" of the course, for search */
  c?: string;
  /** course code, shown on the cover */
  cc?: string;
  /** title as HTML, only when it contains TeX */
  x?: string;
}

/** Everything the client needs to localise and draw a card; emitted by CardConfig.astro. */
export interface CardCfg {
  lang: 'en' | 'tr';
  /** URL of docs-index.json */
  index: string;
  /** href prefix for a document page, ends with "/" */
  doc: string;
  /** URL prefix of thumbnails, ends with "/" */
  thumbs: string;
  /** slug -> [name, rank] */
  unis: Record<string, [string, number]>;
  /** slug -> [en, tr, motif, first MSC class] */
  topics: Record<string, [string, string, string, string]>;
  types: Record<string, string>;
  levels: Record<string, string>;
  licenses: Record<string, string>;
  hosted: string;
  external: string;
  /** href prefix for a course page, ends with "/" */
  course: string;
  /** word before the course code on a card, e.g. "Course" */
  courseWord: string;
  /** "{shown} / {total}" etc. */
  ui: { error: string };
}
