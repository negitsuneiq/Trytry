// Top-level subject areas, each mapped to MSC2020 two-digit classes.
// https://zbmath.org/static/msc2020.pdf

export interface Topic {
  slug: string;
  en: string;
  tr: string;
  msc: string[];
  /** Cover motif used for documents without a PDF preview. */
  motif: 'rose' | 'lattice' | 'spiral' | 'polygon' | 'knot' | 'walk' | 'bars' | 'graph' | 'tree' | 'flow' | 'grid' | 'contour' | 'wave' | 'orbit' | 'curve' | 'spectrum';
}

export const TOPICS: Topic[] = [
  { slug: 'analysis', en: 'Analysis', tr: 'Analiz', msc: ['26', '28', '30', '31', '32', '33', '40', '41', '42', '43', '44'], motif: 'curve' },
  { slug: 'functional-analysis', en: 'Functional Analysis', tr: 'Fonksiyonel Analiz', msc: ['46', '47'], motif: 'spectrum' },
  { slug: 'algebra', en: 'Algebra', tr: 'Cebir', msc: ['06', '08', '12', '13', '15', '16', '17', '18', '19', '20', '22'], motif: 'lattice' },
  { slug: 'number-theory', en: 'Number Theory', tr: 'Sayılar Teorisi', msc: ['11'], motif: 'spiral' },
  { slug: 'algebraic-geometry', en: 'Algebraic Geometry', tr: 'Cebirsel Geometri', msc: ['14'], motif: 'contour' },
  { slug: 'geometry', en: 'Geometry', tr: 'Geometri', msc: ['51', '52', '53'], motif: 'polygon' },
  { slug: 'topology', en: 'Topology', tr: 'Topoloji', msc: ['54', '55', '57', '58'], motif: 'knot' },
  { slug: 'combinatorics', en: 'Combinatorics', tr: 'Kombinatorik', msc: ['05'], motif: 'graph' },
  { slug: 'logic', en: 'Logic & Foundations', tr: 'Mantık ve Temeller', msc: ['03'], motif: 'tree' },
  { slug: 'probability', en: 'Probability', tr: 'Olasılık', msc: ['60'], motif: 'walk' },
  { slug: 'statistics', en: 'Statistics', tr: 'İstatistik', msc: ['62'], motif: 'bars' },
  { slug: 'differential-equations', en: 'Differential Equations', tr: 'Diferansiyel Denklemler', msc: ['34', '35', '39', '45'], motif: 'flow' },
  { slug: 'dynamical-systems', en: 'Dynamical Systems', tr: 'Dinamik Sistemler', msc: ['37'], motif: 'orbit' },
  { slug: 'numerical-analysis', en: 'Numerical Analysis', tr: 'Sayısal Analiz', msc: ['65'], motif: 'grid' },
  { slug: 'optimization', en: 'Optimization & Control', tr: 'Optimizasyon ve Kontrol', msc: ['49', '90', '93'], motif: 'contour' },
  { slug: 'mathematical-physics', en: 'Mathematical Physics', tr: 'Matematiksel Fizik', msc: ['70', '74', '76', '78', '80', '81', '82', '83', '85', '86'], motif: 'wave' },
  { slug: 'information-computation', en: 'Information & Computation', tr: 'Bilgi ve Hesaplama', msc: ['68', '94'], motif: 'rose' },
];

export const TOPIC_BY_SLUG = new Map(TOPICS.map((t) => [t.slug, t]));

export function topicName(slug: string, lang: 'en' | 'tr'): string {
  const t = TOPIC_BY_SLUG.get(slug);
  return t ? t[lang] : slug;
}
