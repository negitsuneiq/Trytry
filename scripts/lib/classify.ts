// First-guess classification for crawl candidates. Every guess is reviewed by
// a person in data/curation.json before a document is published.

import type { DocType, Level } from '../../src/lib/schema.ts';

const TYPE_RULES: [RegExp, DocType][] = [
  [/\b(midterm|final exam|exam|examination|test \d|quiz|prelim|tripos|qualifying|quals?)\b/i, 'exam'],
  [/\b(problem ?sets?|psets?|homework|hw ?\d|exercise sheets?|example sheets?|assignment|worksheet|exercises)\b/i, 'problem-set'],
  [/\b(lecture notes?|notes|lectures?|handout|chapter|course notes)\b/i, 'lecture-notes'],
  [/\b(book|textbook|monograph|preface)\b/i, 'book'],
];

export function guessType(s: string, pages: number | null): DocType {
  for (const [re, t] of TYPE_RULES) if (re.test(s)) return t;
  if ((pages ?? 0) >= 150) return 'book';
  return 'other';
}

/** Universities where 2xx course numbers are graduate courses. */
const GRAD_2XX = new Set(['harvard', 'stanford', 'berkeley']);

export function guessLevel(s: string, courseCode: string | null, university: string): Level {
  if (/\b(graduate|phd|ph\.d|part iii|master'?s?|qualifying|quals)\b/i.test(s)) return 'graduate';
  if (!courseCode) return 'undergraduate';
  // MIT: 18.7xx and above are graduate subjects.
  const mit = courseCode.match(/^18\.(\d)\d\d/);
  if (mit) return Number(mit[1]) >= 7 ? 'graduate' : 'undergraduate';
  const n = Number(courseCode.match(/(\d{3})/)?.[1] ?? 0);
  if (n >= 500) return 'graduate';
  if (n >= 200 && n < 300 && GRAD_2XX.has(university)) return 'graduate';
  return 'undergraduate';
}

const COURSE = [
  /\b(18\.\d{2,4}[a-z]?)\b/i, // MIT
  /\b(MATH[- ]?\d{2,4}[A-Z]?)\b/i,
  /\b(MAT[- ]?\d{3}[A-Z]?)\b/,
  /\b(M\d{3})\b/,
  /\b(\d{3}-\d{4}-\d{2}L?)\b/, // ETH
  /\b(MA\d{3,4})\b/,
];

export function guessCourseCode(s: string): string | null {
  for (const re of COURSE) {
    const m = s.match(re);
    if (m) return m[1].toUpperCase().replace(/^MATH(\d)/, 'MATH $1');
  }
  return null;
}

const TOPIC_RULES: [RegExp, string][] = [
  [/\b(real analysis|measure|integration|lebesgue|calculus|fourier|harmonic analysis|complex analysis|several complex)\b/i, 'analysis'],
  [/\b(functional analysis|banach|hilbert space|operator|spectral theory|c\*-algebra)\b/i, 'functional-analysis'],
  [/\b(linear algebra|group theory|groups|rings?|modules?|fields?|galois|representation theory|lie algebras?|category theory|commutative algebra|homological)\b/i, 'algebra'],
  [/\b(number theory|primes?|modular forms?|elliptic curves?|diophantine|zeta|arithmetic)\b/i, 'number-theory'],
  [/\b(algebraic geometry|schemes?|varieties|sheaf|sheaves|cohomology of sheaves|riemann surfaces)\b/i, 'algebraic-geometry'],
  [/\b(differential geometry|riemannian|manifolds?|curvature|symplectic|geometry)\b/i, 'geometry'],
  [/\b(topology|homotopy|homology|knots?|fundamental group|cw complex)\b/i, 'topology'],
  [/\b(combinatorics|graph theory|graphs|enumerative|ramsey|extremal)\b/i, 'combinatorics'],
  [/\b(logic|set theory|model theory|computability|proof theory|forcing)\b/i, 'logic'],
  [/\b(probability|stochastic|brownian|martingales?|random walks?|markov)\b/i, 'probability'],
  [/\b(statistics|statistical|regression|inference|estimation|hypothesis test)\b/i, 'statistics'],
  [/\b(differential equations?|ode|pde|elliptic|parabolic|hyperbolic equations|sobolev)\b/i, 'differential-equations'],
  [/\b(dynamical systems?|ergodic|chaos|bifurcation)\b/i, 'dynamical-systems'],
  [/\b(numerical|finite elements?|scientific computing|numerical linear algebra)\b/i, 'numerical-analysis'],
  [/\b(optimi[sz]ation|convex|linear programming|control theory|calculus of variations)\b/i, 'optimization'],
  [/\b(quantum|mechanics|relativity|fluid|mathematical physics|statistical mechanics|electromagnet)\b/i, 'mathematical-physics'],
  [/\b(information theory|coding theory|algorithms?|complexity|cryptography)\b/i, 'information-computation'],
];

export function guessTopics(s: string): string[] {
  const hits = TOPIC_RULES.filter(([re]) => re.test(s)).map(([, t]) => t);
  return [...new Set(hits)].slice(0, 3);
}

/** Signals that a PDF is a student's own work rather than official material. */
export function looksLikeStudentWork(s: string): boolean {
  return /\b(my solutions?|solutions? by (?!the instructor)|submitted by|student (?:name|id)|homework submission|scribe(?:d)? by|scribe notes)\b/i.test(s);
}

export function normaliseTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Token Jaccard similarity of two titles, 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const A = new Set(normaliseTitle(a).split(' ').filter(Boolean));
  const B = new Set(normaliseTitle(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
