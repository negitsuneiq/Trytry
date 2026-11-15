// Client-side course cards and the course strip of the library, built from the
// shared /courses-index.json and the labels in #course-cfg (LibraryBrowser.astro).

import '../styles/course-card.css';
import type { CardCfg } from '../lib/cardRec';
import type { CourseCfg, CourseRec } from '../lib/courseRec';
import { authorsLine } from '../lib/format';
import { uniShort } from '../lib/cover';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);
const fill = (tpl: [string, string], n: number) => (n === 1 ? tpl[0] : tpl[1]).replace('{n}', String(n));

export function readCourseCfg(): CourseCfg | null {
  const el = document.getElementById('course-cfg');
  return el ? (JSON.parse(el.textContent!) as CourseCfg) : null;
}

let promise: Promise<CourseRec[]> | null = null;
export function loadCourses(cfg: CourseCfg): Promise<CourseRec[]> {
  promise ??= fetch(cfg.index)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<CourseRec[]>;
    })
    .catch((e) => {
      promise = null;
      throw e;
    });
  return promise;
}

export function courseCardHtml(r: CourseRec, cc: CourseCfg, cfg: CardCfg, heading: 'h2' | 'h3'): string {
  const uni = uniShort(r.u, cfg.unis[r.u]?.[0]);
  const counts = cc.types
    .map((ty, i) => (r.ct[i] ? fill(cc.counts[ty], r.ct[i]) : ''))
    .filter(Boolean)
    .join(' · ');
  const topics = r.p.map((tp) => cfg.topics[tp]?.[cfg.lang === 'tr' ? 1 : 0] ?? tp).join(' / ');
  const years = r.y ? (r.y[0] === r.y[1] ? String(r.y[0]) : `${r.y[0]}–${r.y[1]}`) : '';
  return (
    `<article class="course-card"><a class="hit" href="${cfg.course}${esc(r.s)}/">` +
    `<p class="mono meta"><span lang="en">${esc(uni)}</span><span aria-hidden="true">·</span><span>${esc(cfg.levels[r.l] ?? r.l)}</span></p>` +
    (r.c ? `<p class="mono ccode" lang="en">${esc(r.c)}</p>` : '') +
    `<${heading} class="ctitle" lang="en">${esc(r.t)}</${heading}>` +
    (r.a?.length ? `<p class="cby" lang="en">${esc(authorsLine(r.a))}</p>` : '') +
    `<p class="mono cnts">${esc(counts)}</p>` +
    `<p class="mono cfoot"><span>${esc(topics)}</span>${years ? `<span class="yrs">${years}</span>` : ''}</p>` +
    `</a></article>`
  );
}

/** Appends course cards for `recs` to `grid`; returns the first new element. */
export function appendCourseCards(grid: HTMLElement, recs: CourseRec[], cc: CourseCfg, cfg: CardCfg, heading: 'h2' | 'h3'): HTMLElement | undefined {
  const tpl = document.createElement('template');
  tpl.innerHTML = recs.map((r) => courseCardHtml(r, cc, cfg, heading)).join('');
  const first = tpl.content.firstElementChild as HTMLElement | null;
  grid.append(tpl.content);
  return first ?? undefined;
}

/** One row of the strip above document results. */
export function stripRowHtml(r: CourseRec, cc: CourseCfg, cfg: CardCfg): string {
  const uni = uniShort(r.u, cfg.unis[r.u]?.[0]);
  return (
    `<li><a class="sr" href="${cfg.course}${esc(r.s)}/">` +
    `<span class="mono scode" lang="en">${esc(r.c ?? '—')}</span>` +
    `<span class="sttl" lang="en">${esc(r.t)}</span>` +
    `<span class="mono smeta"><span lang="en">${esc(uni)}</span><span aria-hidden="true">·</span><span>${esc(fill(cc.docs, r.d))}</span></span>` +
    `</a></li>`
  );
}

export const resultsText = (cc: CourseCfg, n: number) => fill(cc.results, n);
