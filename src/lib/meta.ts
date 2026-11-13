import { t, type Lang } from '../i18n/strings';
import type { Topic } from './topics';

const MIN = 60;
const MAX = 155;

/**
 * Meta description for a topic page: one real sentence with the topic name, the
 * document count and the MSC classes, kept within 60-155 characters. The class
 * list is shortened (with an ellipsis) only when the sentence would be too long.
 */
export function topicDescription(topic: Topic, lang: Lang, count: number): string {
  const s = t(lang);
  const name = topic[lang];
  const n = s.home.docsCount(count);
  const classes = topic.msc.map((m) => `${m}-XX`);
  const list = (k: number) => classes.slice(0, k).join(', ') + (k < classes.length ? '…' : '');
  for (const build of [s.topic.metaFull, s.topic.metaShort]) {
    for (let k = classes.length; k >= 1; k--) {
      const text = build(name, n, list(k)).replace('….', '…');
      if (text.length >= MIN && text.length <= MAX) return text;
    }
  }
  return s.topic.metaShort(name, n, list(1)).slice(0, MAX);
}
