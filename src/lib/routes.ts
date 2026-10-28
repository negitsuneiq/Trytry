import { LANGS, type Lang } from '../i18n/strings';

export function langPaths() {
  return LANGS.map((lang) => ({ params: { lang } }));
}

export function langCross<T extends Record<string, string>, P>(items: { params: T; props: P }[]) {
  return LANGS.flatMap((lang: Lang) => items.map((i) => ({ params: { lang, ...i.params }, props: i.props })));
}
