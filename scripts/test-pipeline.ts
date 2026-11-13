// Regression tests for the crawl pipeline. Plain tsx + node:assert, no framework.
//   npm run test:pipeline
//
// Covers licence detection, page analysis, the deny list, scope helpers, language and
// student-work heuristics, title de-duplication and (against local servers only) robots.txt,
// rate limiting and body reading. Nothing here touches a real website.

process.env.OL_MIN_INTERVAL_MS = '250';
process.env.OL_ROBOTS_RETRY_MS = '20';

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { analysePage, detectLicense, findRestriction, hasCopyrightNotice, relLicense, stripChrome } from './lib/license.ts';
import { detectLanguage } from './lib/lang.ts';
import { isTitleDuplicate, looksLikeStudentWork, titleSimilarity } from './lib/classify.ts';
import { inScope, normaliseScope, pageCovers, registrableDomain, sharesScopeDomain } from './lib/scope.ts';
import { isPdf } from './lib/pdf.ts';
import { isRedistributable } from '../src/lib/schema.ts';

const { isDenied, politeFetch, readBody } = await import('./lib/http.ts');

let passed = 0;
const failures: string[] = [];
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n      ${(e as Error).message.split('\n').join('\n      ')}`);
  }
}

// ------------------------------------------------------------------- licences
const LICENCE_CASES: [string, string][] = [
  // positives that must keep working
  ['This work is licensed under a Creative Commons Attribution 4.0 International License.', 'CC-BY-4.0'],
  ['© 2021 A. Author. Released under CC BY-NC-SA 4.0.', 'CC-BY-NC-SA-4.0'],
  ['Licensed under CC0 1.0', 'CC0-1.0'],
  ['Licensed under CC BY-NC-SA 4.0', 'CC-BY-NC-SA-4.0'],
  ['Licensed under CC BY–NC–SA 4.0', 'CC-BY-NC-SA-4.0'],
  ['Licensed under CC BY‑NC‑ND 4.0', 'CC-BY-NC-ND-4.0'],
  ['Licensed under Creative Commons Attribution–NonCommercial 4.0 International', 'CC-BY-NC-4.0'],
  ['Licensed under CC BY-SA 3.0', 'CC-BY-SA-3.0'],
  ['licensed under CC BY-ND 3.0', 'CC-BY-ND-3.0'],
  ['This work is licensed under https://creativecommons.org/licenses/by-nd/3.0/', 'CC-BY-ND-3.0'],
  ['Permission is granted to copy, distribute and/or modify this document under the terms of the GNU Free Documentation License, Version 1.3 or any later version.', 'GFDL-1.3'],
  ['This work is in the public domain.', 'Public-Domain'],
  ['I hereby place these notes in the public domain.', 'Public-Domain'],
  // restrictions veto first (items 1, 8, 9)
  ['This document is not licensed under CC BY 4.0. All rights reserved.', 'all-rights-reserved'],
  ['(c) 2020 J. Smith. All rights reserved. Figure 3 is licensed under CC BY-SA 4.0.', 'all-rights-reserved'],
  ['This work is not in the public domain. Source is in the public domain.', 'all-rights-reserved'],
  ['No part of this book may be reproduced in any form without permission. Copyright Springer 2015.', 'all-rights-reserved'],
  ['Not to be reproduced or distributed. See https://creativecommons.org/licenses/by/4.0/ for an example', 'all-rights-reserved'],
  ['MIT OpenCourseWare https://ocw.mit.edu/terms Image courtesy of X. Used with permission.', 'all-rights-reserved'],
  ['Licensed CC-BY 4.0 except figures (see ocw.mit.edu)', 'all-rights-reserved'],
  ['Notes are licensed under CC BY 4.0, excluding the exam questions.', 'all-rights-reserved'],
  // no grant: unknown
  ['[12] A. Author, Title. Licensed under Creative Commons Attribution 4.0 International License. 2019.', 'unknown'],
  ['Some text.\nReferences\n[1] Foo. Licensed under CC BY 4.0.', 'unknown'],
  ['https://creativecommons.org/licenses/by-nd/3.0/', 'unknown'],
  ['See https://creativecommons.org/licenses/by/4.0/ for details.', 'unknown'],
  ['Creative Commons Attribution–NonCommercial 4.0 International', 'unknown'],
  ['GNU Free Documentation License is described at the FSF site; this text is (c) Springer.', 'unknown'],
  // tokens that merely contain "CC0" / "CC BY"
  ['We show that the class ACC0 contains no circuits', 'unknown'],
  ['Licensed under ACC0 circuits', 'unknown'],
  ['Let ABCC0 be a quadrilateral', 'unknown'],
  ['triangle CC BYTE', 'unknown'],
  ['Licensed under CC BYTE', 'unknown'],
  // unsupported / missing versions, conflicts
  ['licensed under CC BY 2.0', 'unknown'],
  ['This work is licensed under https://creativecommons.org/licenses/by/2.5/', 'unknown'],
  ['Licensed under CC BY-NC-SA', 'unknown'],
  ['Licensed under CC BY 4.0. Exercises are licensed under CC BY-NC 4.0.', 'unknown'],
  // ordinary maths / exam text must not look like a restriction
  ['Calculators may not be used. Answer all questions.', 'unknown'],
];
for (const [text, expected] of LICENCE_CASES)
  await t(`licence: ${JSON.stringify(text.slice(0, 70))} -> ${expected}`, () => assert.equal(detectLicense(text).license, expected));

await t('licence: exclusion phrases set excluded', () => assert.equal(detectLicense('Image courtesy of X. Used with permission.').excluded, true));
await t('licence: bare mention is ambiguous (must not inherit a page licence)', () => assert.equal(detectLicense('See https://creativecommons.org/licenses/by/4.0/ for details.').ambiguous, true));
await t('licence: restriction scan finds third-party credit deep in a text', () => assert.ok(findRestriction('x '.repeat(500) + 'Figure courtesy of Dr. Z.')));
await t('licence: restriction scan quiet on maths', () => assert.equal(findRestriction('Let f be continuous. All solutions except the trivial one satisfy x > 0.'), null));
await t('copyright notice detection', () => {
  assert.ok(hasCopyrightNotice('© 2020 John Smith'));
  assert.ok(hasCopyrightNotice('Copyright 2020 Springer'));
  assert.ok(!hasCopyrightNotice('Let X be a measure space.'));
});
await t('redistributable list contains CC-BY-ND-3.0 but no 2.x', () => {
  assert.ok(isRedistributable('CC-BY-ND-3.0'));
  assert.ok(!isRedistributable('CC-BY-2.0' as never));
});

// ------------------------------------------------------------------ HTML pages
const COURSE_PAGE = `<html><head><title>MATH 101</title></head><body><main>
<h1>MATH 101</h1><p>Course materials on this page are released under <a rel="license" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</p>
<a href="notes.pdf">Lecture notes</a> <a href="pset1.pdf">Problem Set 1</a></main>
<footer>All content licensed CC BY-NC-SA 4.0</footer></body></html>`;

await t('page: course page grant (main content) gives CC-BY-4.0', () => assert.equal(analysePage(COURSE_PAGE).license, 'CC-BY-4.0'));
await t('page: same-directory PDF is covered', () => assert.ok(pageCovers(new URL('http://h.edu/courses/m101/'), new URL('http://h.edu/courses/m101/pset1.pdf'))));
await t('page: sub-directory PDF is covered', () => assert.ok(pageCovers(new URL('http://h.edu/courses/m101/index.html'), new URL('http://h.edu/courses/m101/hw/pset1.pdf'))));
await t('page: PDF elsewhere on the site is not covered', () => assert.ok(!pageCovers(new URL('http://h.edu/courses/m101/'), new URL('http://h.edu/courses/m102/pset1.pdf'))));
await t('page: other origin / scheme is not covered', () => {
  assert.ok(!pageCovers(new URL('http://h.edu/courses/m101/'), new URL('http://other.edu/courses/m101/a.pdf')));
  assert.ok(!pageCovers(new URL('https://h.edu/courses/m101/'), new URL('http://h.edu/courses/m101/a.pdf')));
});
await t('page: a page at the site root covers nothing', () => assert.ok(!pageCovers(new URL('http://h.edu/'), new URL('http://h.edu/a.pdf'))));
await t('page: footer-only licence is not page evidence', () => {
  const html = '<body><p>Welcome</p><footer>All content licensed under CC BY-NC-SA 4.0</footer></body>';
  assert.equal(analysePage(html).license, 'unknown');
});
await t('page: nested site-footer div does not leak its licence', () => {
  const html = '<body><p>Welcome</p><div class="site-footer"><div class="links">Home</div><div class="lic">Content licensed under CC BY 4.0</div></div></body>';
  assert.equal(analysePage(html).license, 'unknown');
});
await t('page: rel="license" in a footer is ignored', () => {
  const html = '<body><p>Notes</p><footer><a rel="license" href="https://creativecommons.org/licenses/by/4.0/">x</a></footer></body>';
  assert.equal(relLicense(html), null);
  assert.equal(analysePage(html).license, 'unknown');
});
await t('page: rel="license" in main content counts', () => {
  const html = '<body><main><p>Notes <a rel="license" href="https://creativecommons.org/licenses/by-nc/4.0/">licence</a></p></main></body>';
  assert.equal(analysePage(html).license, 'CC-BY-NC-4.0');
});
await t('page: restriction in main content wins', () => {
  const html = '<main><p>All rights reserved. Notes released under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</p></main>';
  assert.equal(analysePage(html).license, 'all-rights-reserved');
});
await t('page: licence for one author, bare link for another page stays unknown without grant', () => {
  assert.equal(analysePage('<main><p>See <a href="https://creativecommons.org/licenses/by/4.0/">this</a> for background.</p></main>').license, 'unknown');
});
await t('page: stripChrome removes nested same-name tags correctly', () => {
  const out = stripChrome('<div class="footer"><div>a</div><div>b</div></div><p>kept</p>');
  assert.ok(out.includes('kept') && !out.includes('>a<') && !out.includes('>b<'));
});
await t('page: unclosed footer element drops the rest (safe direction)', () => {
  const out = stripChrome('<p>one</p><footer><p>two');
  assert.ok(out.includes('one') && !out.includes('two'));
});
await t('page: HTML entities in the licence text are decoded', () => assert.equal(analysePage('<main><p>Licensed under CC&nbsp;BY&#8211;NC&nbsp;4.0</p></main>').license, 'CC-BY-NC-4.0'));

// -------------------------------------------------------------------- deny list
const DENIED = [
  'https://math.example.edu/portal/x.pdf', 'https://math.example.edu/internal/notes.pdf', 'https://math.example.edu/users/sign_in',
  'https://math.example.edu/adfs/ls/?wa=wsignin1.0', 'https://math.example.edu/log-in', 'https://math.example.edu/Shibboleth.sso/Login',
  'https://auth.example.edu/x', 'https://shib.example.edu/', 'https://brightspace.example.edu/d2l/home', 'https://example.d2l.com/',
  'https://lms.example.edu/', 'https://elearning.example.edu/', 'https://learn.maths.ox.ac.uk/x', 'https://learn.ox.ac.uk/x',
  'https://cas.bu.edu/math/notes.html', 'https://sakai.example.edu/', 'https://example.sharepoint.com/x.pdf', 'https://x.edu/course/Account/Login',
  'https://x.edu/cosign/valid', 'https://x.edu/CookieAuth.dll', 'https://x.edu/saml2/idp/SSO', 'https://x.edu/wp-content/uploads/restricted/x.pdf',
  'https://x.edu/staff/portal.html', 'https://x.edu/Login.aspx', 'https://x.edu/login.php', 'https://x.edu/login?next=/x',
  'https://moodle.example.edu/', 'https://courses.example.edu/pluginfile.php/123/mod_resource/content/1/notes.pdf',
  'https://courses.example.edu/mod/resource/view.php?id=5', 'https://x.edu/webapps/blackboard/execute/x', 'https://x.edu/d2l/le/content/1',
  'https://x.edu/courses/1234/files/9', 'https://canvas.instructure.com/courses/1', 'https://canvas.example.edu/courses/1', 'https://accounts.google.com/',
  'https://sso.example.edu/', 'https://user:pw@x.edu/a.pdf', 'ftp://x.edu/a.pdf', 'https://x.edu/a?service=https://y/', 'https://springer.com/x.pdf',
];
const ALLOWED = [
  'https://math.example.edu/authors/list.html', 'https://math.example.edu/~x/auth.pdf', 'https://math.example.edu/internal.pdf', 'https://x.edu/my.pdf',
  'https://x.edu/notes/private-lecture.pdf', 'https://www.maths.cam.ac.uk/cas.pdf', 'https://ocw.mit.edu/courses/18-100a/notes.pdf',
  'https://www.maths.ox.ac.uk/study/notes.pdf', 'https://math.mit.edu/~x/authority.html', 'https://x.edu/courses/m101/index.html',
];
for (const u of DENIED) await t(`deny: ${u}`, () => assert.ok(isDenied(new URL(u)), 'expected denied'));
for (const u of ALLOWED) await t(`allow: ${u}`, () => assert.equal(isDenied(new URL(u)), null));

// ------------------------------------------------------------------------ scope
await t('registrableDomain', () => {
  assert.equal(registrableDomain('maths.ox.ac.uk'), 'ox.ac.uk');
  assert.equal(registrableDomain('www.math.unimelb.edu.au'), 'unimelb.edu.au');
  assert.equal(registrableDomain('x.u-tokyo.ac.jp'), 'u-tokyo.ac.jp');
  assert.equal(registrableDomain('www.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(registrableDomain('math.mit.edu'), 'mit.edu');
  assert.equal(registrableDomain('ocw.mit.edu'), 'mit.edu');
  assert.equal(registrableDomain('127.0.0.1'), '127.0.0.1');
  assert.equal(registrableDomain('localhost'), 'localhost');
});
await t('scope: URL boundary', () => {
  const sc = normaliseScope(['https://math.mit.edu', 'https://x.edu/math']);
  assert.ok(inScope(new URL('https://math.mit.edu/a'), sc));
  assert.ok(!inScope(new URL('https://math.mit.edu.evil.example/a'), sc));
  assert.ok(inScope(new URL('https://x.edu/math/a'), sc));
  assert.ok(inScope(new URL('https://x.edu/math'), sc));
  assert.ok(!inScope(new URL('https://x.edu/mathematics/a'), sc));
});
await t('scope: off-scope PDFs only on a scope domain', () => {
  const sc = normaliseScope(['https://www.maths.ox.ac.uk/teaching/']);
  assert.ok(sharesScopeDomain(new URL('https://files.ox.ac.uk/a.pdf'), sc));
  assert.ok(!sharesScopeDomain(new URL('https://cam.ac.uk/a.pdf'), sc));
  assert.ok(!sharesScopeDomain(new URL('https://evilox.ac.uk/a.pdf'), sc));
});

// --------------------------------------------------------------------- language
const EN_PLAIN = 'We consider the problem of finding the minimum of a function on a compact set, and we show that it is attained. '.repeat(3);
const EN_DENSE = `Definition 1.1. A metric space (X, d) is complete if every Cauchy sequence (x_n) converges. Example. R^n with d(x,y) = sqrt(Σ (x_i − y_i)^2). Proposition 1.2. Let T : X → X satisfy d(Tx, Ty) ≤ q d(x, y) for 0 ≤ q < 1. Then T has a unique fixed point x*. Proof. Pick x_0, set x_{n+1} = T x_n. Then d(x_{n+1}, x_n) ≤ q^n d(x_1, x_0), so d(x_m, x_n) ≤ Σ_{k=n}^{m−1} q^k d(x_1,x_0) ≤ q^n/(1−q) d(x_1,x_0) → 0. Hence (x_n) is Cauchy, x_n → x*, and T x* = lim T x_n = lim x_{n+1} = x*. Uniqueness: d(x*, y*) = d(Tx*, Ty*) ≤ q d(x*, y*), so d(x*, y*) = 0. Theorem 1.3 (Picard–Lindelöf). Let f(t, y) be continuous on R = [t_0 − a, t_0 + a] × [y_0 − b, y_0 + b], Lipschitz in y with constant L. Then y' = f(t,y), y(t_0) = y_0 has a unique solution on [t_0 − h, t_0 + h], h = min(a, b/M). φ_{n+1}(t) = y_0 + ∫_{t_0}^t f(s, φ_n(s)) ds. |φ_{n+1} − φ_n| ≤ M L^n |t−t_0|^{n+1}/(n+1)! . Σ_n converges uniformly; the limit φ solves the integral equation.`;
const SYM = 'Σ x_i y_i = ⟨x,y⟩ ≤ ‖x‖‖y‖ for x, y ∈ V and a, b ∈ F. Let n ≥ 2 and p, q be primes; p | n, q | n implies pq | n. '.repeat(8);
const DE = 'Sei f eine Funktion von der Menge X in die Menge Y und es gilt dass die Abbildung nicht stetig ist. Wir zeigen das der Satz auch für den Fall gilt wenn die Menge leer ist und dann ist es klar. '.repeat(3);
const PT = 'Seja f uma função de X em Y e suponha que para todo x em X existe um y tal que f(x) = y. Então, como a função não é contínua, o conjunto não é aberto. Para provar isto, com efeito, que se '.repeat(3);
const SV = 'Låt f vara en funktion från X till Y och antag att det finns ett x sådant att f är inte kontinuerlig. Då är mängden inte öppen och vi visar att det är så för alla som är i mängden. '.repeat(3);
const EXAM = 'MATH 101 Final Exam. Show all work. 1. Compute lim x→0 sin x / x. 2. Let A be a 3x3 matrix with det A = 2. Find det(2A). 3. Prove that Σ 1/n^2 converges. 4. Evaluate ∫ x e^x dx. 5. Find the eigenvalues of [1 2; 3 4]. 6. Is f(x)=|x| differentiable at 0? 7. Show that √2 is irrational. 8. Solve y\' = y. 9. Let G be a group of order 6. 10. Find the Taylor series of cos x about 0. Time: 2 hours. Calculators are not permitted.';
await t('lang: plain English', () => assert.equal(detectLanguage(EN_PLAIN).lang, 'en'));
await t('lang: symbol-dense maths (Banach / Picard) is English', () => assert.equal(detectLanguage(EN_DENSE).lang, 'en'));
await t('lang: a very short exam is flagged too short rather than guessed', () => assert.equal(detectLanguage(EXAM).tooShort, true));
await t('lang: formula-heavy English (previously rejected as unknown) is English', () => assert.equal(detectLanguage(SYM).lang, 'en'));
await t('lang: German', () => assert.equal(detectLanguage(DE).lang, 'de'));
await t('lang: Portuguese is not English', () => assert.notEqual(detectLanguage(PT).lang, 'en'));
await t('lang: Swedish is not English', () => assert.notEqual(detectLanguage(SV).lang, 'en'));
await t('lang: too short to judge is flagged', () => {
  const r = detectLanguage('Problem set 1. Prove that every finite group of prime order is cyclic.');
  assert.equal(r.tooShort, true);
  assert.equal(r.lang, 'unknown');
});

// ------------------------------------------------------------------ student work
const NOT_STUDENT = [
  'Lecture 3 — scribed by Jane Doe, notes for Prof. Smith, Math 250A', 'Lecture notes. Scribe notes for lecture 5', 'Final Exam. Student ID: ______ Name:',
  'Homework 3 Solutions by the teaching assistants', 'Solutions by the instructor', 'Papers submitted by the Board of Examiners', 'Problem Set 2 with solutions by the course staff',
];
const STUDENT = ['Homework 3 - my solutions', 'Submitted by: Student Name', 'Solutions written by a student', 'My own homework answers'];
for (const s of NOT_STUDENT) await t(`student-work false: ${s}`, () => assert.equal(looksLikeStudentWork(s), false));
for (const s of STUDENT) await t(`student-work true: ${s}`, () => assert.equal(looksLikeStudentWork(s), true));

// ------------------------------------------------------------------ title dedupe
const NOT_DUP: [string, string][] = [
  ['Math 101 Calculus I Midterm 1 Solutions', 'Math 101 Calculus I Midterm 1'],
  ['Analysis I Problem Sheet 1 Hilary Term 2020 Oxford Mathematical Institute Prof X', 'Analysis I Problem Sheet 2 Hilary Term 2020 Oxford Mathematical Institute Prof X'],
  ['Problem Set', 'Problem Set'],
  ['Homework', 'Homework'],
  ['Linear Algebra Lecture Notes 2019', 'Linear Algebra Lecture Notes 2023'],
  ['Measure Theory Final Exam Fall 2020 Department of Mathematics', 'Measure Theory Midterm Exam Fall 2020 Department of Mathematics'],
];
for (const [a, b] of NOT_DUP) await t(`title: not duplicates: ${a} | ${b}`, () => assert.equal(isTitleDuplicate({ title: a, course_code: 'MATH 101' }, { title: b, course_code: 'MATH 101' }), false));
await t('title: both course codes null never dedupe', () => assert.equal(isTitleDuplicate({ title: 'Measure Theory Lecture Notes', course_code: null }, { title: 'Measure Theory Lecture Notes', course_code: null }), false));
await t('title: different course codes never dedupe', () => assert.equal(isTitleDuplicate({ title: 'Measure Theory Lecture Notes', course_code: 'MATH 101' }, { title: 'Measure Theory Lecture Notes', course_code: 'MATH 102' }), false));
await t('title: genuine duplicate still detected', () => assert.equal(isTitleDuplicate({ title: 'Measure Theory Lecture Notes', course_code: 'MATH 101' }, { title: 'Measure Theory Lecture Notes', course_code: 'MATH 101' }), true));
await t('title: similarity of the exam / solutions pair is still high (so the extra rules matter)', () => assert.ok(titleSimilarity('Math 101 Calculus I Midterm 1 Solutions', 'Math 101 Calculus I Midterm 1') >= 0.85));
await t('pdf magic', () => {
  assert.ok(isPdf(Buffer.from('%PDF-1.4\n')));
  assert.ok(!isPdf(Buffer.from('<html>')));
});

// ------------------------------------------------- local servers: robots, rate, bodies
const servers: http.Server[] = [];
const hits: { t: number; port: number; url: string }[] = [];
function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<number> {
  return new Promise((resolve) => {
    const s = http
      .createServer((req, res) => {
        hits.push({ t: Date.now(), port: (s.address() as AddressInfo).port, url: req.url ?? '' });
        handler(req, res);
      })
      .listen(0, '127.0.0.1', () => resolve((s.address() as AddressInfo).port));
    servers.push(s);
  });
}
const page = (res: http.ServerResponse) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('ok');
};
const robotsServer = (robots: (res: http.ServerResponse) => void) => serve((req, res) => (req.url === '/robots.txt' ? robots(res) : req.url === '/rules.txt' ? (res.writeHead(200), res.end('User-agent: *\nDisallow: /secret\n')) : page(res)));

const pRedirect = await robotsServer((res) => (res.writeHead(302, { location: '/rules.txt' }), res.end()));
const p403 = await robotsServer((res) => (res.writeHead(403), res.end('no')));
const p401 = await robotsServer((res) => (res.writeHead(401), res.end('no')));
const p429 = await robotsServer((res) => (res.writeHead(429), res.end('slow')));
const p500 = await robotsServer((res) => (res.writeHead(500), res.end('oops')));
const p404 = await robotsServer((res) => (res.writeHead(404), res.end('none')));
const pRules = await robotsServer((res) => (res.writeHead(200), res.end('User-agent: *\nDisallow: /secret\n')));
const pDelay = await robotsServer((res) => (res.writeHead(200), res.end('User-agent: OpenLemmaBot\nCrawl-delay: 500\n')));

const probe = async (port: number, path = '/secret/x.pdf') => {
  const r = await politeFetch(`http://127.0.0.1:${port}${path}`);
  await r.res?.body?.cancel();
  return r;
};
await t('robots: redirected robots.txt is followed (Disallow honoured)', async () => assert.equal((await probe(pRedirect)).blocked, 'disallowed by robots.txt'));
await t('robots: redirected robots.txt leaves other paths open', async () => assert.equal((await probe(pRedirect, '/public/a')).status, 200));
await t('robots: 403 means disallow all', async () => assert.ok((await probe(p403)).blocked));
await t('robots: 401 means disallow all', async () => assert.ok((await probe(p401)).blocked));
await t('robots: 429 means disallow all', async () => assert.ok((await probe(p429)).blocked));
await t('robots: 5xx means disallow all (after retries)', async () => assert.ok((await probe(p500, '/anything')).blocked));
await t('robots: 404 means no restrictions', async () => assert.equal((await probe(p404)).status, 200));
await t('robots: plain Disallow honoured, other paths allowed', async () => {
  assert.equal((await probe(pRules)).blocked, 'disallowed by robots.txt');
  assert.equal((await probe(pRules, '/ok')).status, 200);
});
await t('robots: absurd Crawl-delay means do not crawl', async () => assert.ok((await probe(pDelay, '/a')).blocked));
await t('http: malformed redirect target is blocked, not thrown', async () => {
  const p = await serve((req, res) => (req.url === '/robots.txt' ? (res.writeHead(404), res.end()) : (res.writeHead(302, { location: 'http://[bad' }), res.end())));
  assert.equal((await probe(p, '/go')).blocked, 'bad redirect location');
});
await t('http: redirect to a deny-listed host is not followed', async () => {
  const p = await serve((req, res) => (req.url === '/robots.txt' ? (res.writeHead(404), res.end()) : (res.writeHead(302, { location: 'https://canvas.example.edu/login' }), res.end())));
  const r = await probe(p, '/go');
  assert.match(r.blocked ?? '', /deny-listed host/);
});

await t('rate limit: two ports of one host share one 250 ms bucket', async () => {
  const a = await robotsServer((res) => (res.writeHead(404), res.end()));
  const b = await robotsServer((res) => (res.writeHead(404), res.end()));
  hits.length = 0;
  await Promise.all([a, b, a, b, a].map((p, i) => probe(p, `/r${i}`)));
  const mine = hits.filter((h) => h.port === a || h.port === b).map((h) => h.t).sort((x, y) => x - y);
  assert.ok(mine.length >= 7, `expected robots + page requests, saw ${mine.length}`);
  for (let i = 1; i < mine.length; i++) assert.ok(mine[i] - mine[i - 1] >= 200, `gap ${mine[i] - mine[i - 1]} ms between request ${i - 1} and ${i}`);
});

await t('body: stalled body times out instead of hanging', async () => {
  const p = await serve((req, res) => {
    if (req.url === '/robots.txt') return (res.writeHead(404), res.end());
    res.writeHead(200, { 'content-type': 'application/pdf' });
    res.write('%PDF-1.4 ');
  });
  const r = await politeFetch(`http://127.0.0.1:${p}/stall.pdf`);
  const b = await readBody(r.res!, { limit: 1_000_000, idleMs: 300 });
  assert.equal(b.reason, 'timeout');
});
await t('body: declared size over the limit is refused before download', async () => {
  const p = await serve((req, res) => {
    if (req.url === '/robots.txt') return (res.writeHead(404), res.end());
    res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': '5000000' });
    res.write('%PDF-1.4 ');
  });
  const r = await politeFetch(`http://127.0.0.1:${p}/big.pdf`);
  assert.equal((await readBody(r.res!, { limit: 1000 })).reason, 'too-large');
});
await t('body: non-PDF first bytes are rejected by headCheck', async () => {
  const p = await serve((req, res) => {
    if (req.url === '/robots.txt') return (res.writeHead(404), res.end());
    res.writeHead(200, { 'content-type': 'application/pdf' });
    res.end('<html>' + 'x'.repeat(3000));
  });
  const r = await politeFetch(`http://127.0.0.1:${p}/fake.pdf`);
  assert.equal((await readBody(r.res!, { limit: 1_000_000, headCheck: isPdf })).reason, 'rejected');
});
await t('body: a real small PDF passes headCheck', async () => {
  const p = await serve((req, res) => {
    if (req.url === '/robots.txt') return (res.writeHead(404), res.end());
    res.writeHead(200, { 'content-type': 'application/pdf' });
    res.end('%PDF-1.4\n%%EOF\n');
  });
  const r = await politeFetch(`http://127.0.0.1:${p}/ok.pdf`);
  const b = await readBody(r.res!, { limit: 1_000_000, headCheck: isPdf });
  assert.equal(b.reason, 'ok');
  assert.equal(b.buf?.length, 15);
});

for (const s of servers) s.close();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFAILURES:\n  ' + failures.join('\n  '));
  process.exit(1);
}
process.exit(0);
