// Localised labels of the course cards (scripts/courseCards.ts); emitted as #course-cfg.
import type { Dict } from '../i18n/strings';
import { DOC_TYPES } from './schema';
import { asset } from './paths';
import type { CourseCfg } from './courseRec';

const pair = (f: (n: number) => string): [string, string] => [f(1).replace('1', '{n}'), f(2).replace('2', '{n}')];

export function courseCfg(s: Dict): CourseCfg {
  return {
    index: asset('courses-index.json'),
    types: DOC_TYPES,
    counts: Object.fromEntries(DOC_TYPES.map((ty) => [ty, pair(s.course.typeCount[ty])])),
    docs: pair(s.course.docsCount),
    results: pair(s.library.courseResults),
    stripTitle: s.library.stripTitle,
    stripAll: s.library.stripAll(0),
  };
}
