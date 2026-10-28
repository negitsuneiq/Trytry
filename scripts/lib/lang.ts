// Small stop-word language identifier. It only has to answer one question
// reliably: is this extracted text English?

const STOP: Record<string, string[]> = {
  en: ['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'it', 'as', 'with', 'be', 'by', 'this', 'are', 'we', 'on', 'which', 'if', 'then', 'let', 'where', 'there', 'an', 'from', 'have', 'not', 'any', 'so', 'such'],
  de: ['der', 'die', 'und', 'das', 'ist', 'den', 'ein', 'eine', 'nicht', 'mit', 'für', 'auf', 'dem', 'wir', 'sei', 'es', 'gilt', 'wenn', 'dann', 'auch', 'von', 'zu', 'des', 'sich'],
  fr: ['le', 'la', 'les', 'et', 'des', 'est', 'une', 'un', 'que', 'pour', 'dans', 'qui', 'sur', 'pas', 'par', 'du', 'on', 'nous', 'soit', 'alors', 'avec', 'ce', 'sont'],
  es: ['el', 'la', 'los', 'las', 'y', 'que', 'es', 'una', 'un', 'por', 'para', 'con', 'del', 'se', 'sea', 'entonces', 'como', 'su', 'al'],
  it: ['il', 'la', 'di', 'che', 'è', 'e', 'per', 'una', 'un', 'con', 'del', 'della', 'sia', 'allora', 'non', 'si', 'dei', 'le', 'gli'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'op', 'te', 'voor', 'met', 'zijn', 'niet', 'wordt', 'als', 'dan'],
};

export interface LangResult {
  lang: string;
  confidence: number;
  words: number;
}

export function detectLanguage(text: string): LangResult {
  // CJK-heavy text is never English for our purposes.
  const cjk = (text.match(/[぀-ヿ一-鿿가-힯]/g) ?? []).length;
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (cjk > words.length * 0.3) return { lang: 'cjk', confidence: 1, words: words.length };
  if (words.length < 60) return { lang: 'unknown', confidence: 0, words: words.length };

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
