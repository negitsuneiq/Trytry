// Structured data (schema.org JSON-LD) for the base layout. Document pages are
// recognised from their URL, so the page itself needs no extra props.
import { documents, universityBySlug } from './data';
import { LICENSE_INFO } from './schema';
import { plainTex } from './math';
import { SITE } from '../site.config';
import { t, type Lang } from '../i18n/strings';

const docById = new Map(documents.map((d) => [d.id, d]));
const TYPE_LABEL: Record<string, string> = {
  'lecture-notes': 'Lecture notes',
  'problem-set': 'Problem set',
  exam: 'Exam',
  book: 'Book',
  other: 'Course material',
};

/** `/<base>/<lang>/doc/<id>` → the document record, if the path is a document page. */
export function docFromPath(pathname: string, base: string): import('./schema').DocumentRecord | undefined {
  const m = /^\/(?:en|tr)\/doc\/([^/]+)\/?$/.exec(pathname.slice(base.replace(/\/$/, '').length));
  return m ? docById.get(decodeURIComponent(m[1])) : undefined;
}

export function documentJsonLd(doc: import('./schema').DocumentRecord, url: string) {
  const uni = universityBySlug.get(doc.university);
  const license = doc.license_url ?? LICENSE_INFO[doc.license]?.url ?? undefined;
  return {
    '@context': 'https://schema.org',
    '@type': ['CreativeWork', 'LearningResource'],
    name: plainTex(doc.title),
    url,
    author: doc.authors.map((name) => ({ '@type': 'Person', name })),
    inLanguage: 'en',
    educationalLevel: doc.level === 'graduate' ? 'Graduate' : 'Undergraduate',
    learningResourceType: TYPE_LABEL[doc.type] ?? 'Course material',
    isAccessibleForFree: true,
    ...(license ? { license } : {}),
    ...(doc.year ? { datePublished: String(doc.year) } : {}),
    ...(doc.description ? { description: doc.description } : {}),
    isBasedOn: doc.source_url,
    ...(uni ? { provider: { '@type': 'CollegeOrUniversity', name: uni.name, url: uni.department_url } } : {}),
  };
}

export function websiteJsonLd(lang: Lang, url: string, libraryUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url,
    inLanguage: lang,
    description: t(lang).meta.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${libraryUrl}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}
