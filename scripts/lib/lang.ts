// Small stop-word language identifier. It only has to answer one question
// reliably: is this extracted text English?
//
// Maths text is full of one-letter variables, and a few of them are stop words
// in other languages ("y" in Spanish, "e" in Italian). Tokens shorter than two
// letters are therefore ignored altogether, and the lists contain no
// one-letter entries.

const STOP: Record<string, string[]> = {
  en: ['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'it', 'as', 'with', 'be', 'by', 'this', 'are', 'we', 'on', 'which', 'if', 'then', 'let', 'where', 'there', 'an', 'from', 'have', 'not', 'any', 'so', 'such', 'at', 'or', 'has', 'can', 'all', 'each', 'its', 'also', 'than', 'these', 'when'],
  de: ['der', 'die', 'und', 'das', 'ist', 'den', 'ein', 'eine', 'nicht', 'mit', 'für', 'auf', 'dem', 'wir', 'sei', 'es', 'gilt', 'wenn', 'dann', 'auch', 'von', 'zu', 'des', 'sich'],
  fr: ['le', 'la', 'les', 'et', 'des', 'est', 'une', 'un', 'que', 'pour', 'dans', 'qui', 'sur', 'pas', 'par', 'du', 'on', 'nous', 'soit', 'alors', 'avec', 'ce', 'sont'],
  es: ['el', 'la', 'los', 'las', 'que', 'es', 'una', 'un', 'por', 'para', 'con', 'del', 'se', 'sea', 'entonces', 'como', 'su', 'al'],
  it: ['il', 'la', 'di', 'che', 'è', 'per', 'una', 'un', 'con', 'del', 'della', 'sia', 'allora', 'non', 'si', 'dei', 'le', 'gli'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'op', 'te', 'voor', 'met', 'zijn', 'niet', 'wordt', 'als', 'dan'],
};

export const MIN_LANGUAGE_WORDS = 60;

export interface LangResult {
  lang: string;
  confidence: number;
  /** Tokens of two or more letters. */
  words: number;
  /** Set when the text is too short to judge. */
  tooShort?: boolean;
}

export function detectLanguage(text: string): LangResult {
  const all = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  // CJK-heavy text is never English for our purposes.
  const cjk = (text.match(/[぀-ヿ一-鿿가-힯]/g) ?? []).length;
  if (cjk > all.length * 0.3) return { lang: 'cjk', confidence: 1, words: all.length };
  const words = all.filter((w) => [...w].length >= 2);
  if (words.length < MIN_LANGUAGE_WORDS) return { lang: 'unknown', confidence: 0, words: words.length, tooShort: true };

  const scores = Object.entries(STOP).map(([lang, list]) => {
    const set = new Set(list);
    return [lang, words.filter((w) => set.has(w)).length / words.length] as const;
  });
  scores.sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  // Maths text is symbol-dense, so stop-word ratios are low; demand a clear lead instead.
  const confidence = best[1] === 0 ? 0 : (best[1] - second[1]) / best[1];
  return { lang: best[1] >= 0.04 && confidence >= 0.35 ? best[0] : 'unknown', confidence, words: words.length };
}
