// /saved/: the reading list, drawn client-side from the two shared indexes
// (docs-index.json, courses-index.json) and the browser's own storage.

import type { CardRec } from '../lib/cardRec';
import type { CourseRec } from '../lib/courseRec';
import { BOOKMARK_SVG } from '../lib/saveBtn';
import { uniShort } from '../lib/cover';
import { readCfg, loadIndex } from './cards';
import { readCourseCfg, loadCourses, courseCounts } from './courseCards';
import { read, setSaved, clearList, onChange, isPersistent, syncDom, RECENT, type Kind } from './saved';

interface Cfg {
  remove: string;
  save: string;
  unsave: string;
  recentCourse: string;
  gone: string;
  error: string;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);

export function initSavedPage(): (() => void) | null {
  const root = document.querySelector<HTMLElement>('[data-saved-page]');
  if (!root) return null;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const cfg = JSON.parse(document.getElementById('saved-cfg')!.textContent!) as Cfg;
  const card = readCfg();
  const cc = readCourseCfg()!;
  const statusEl = $('[data-sp-status]');
  const emptyEl = $('[data-sp-empty]');
  const groups = Object.fromEntries((['courses', 'docs', 'recent'] as const).map((k) => [k, root.querySelector<HTMLElement>(`[data-sp-group="${k}"]`)!])) as Record<'courses' | 'docs' | 'recent', HTMLElement>;
  const clearBox = $('[data-sp-clear]');
  const clearBtn = $<HTMLButtonElement>('[data-sp-clear-btn]');
  const confirm = $('[data-sp-confirm]');

  let recs: Map<string, CardRec> | null = null;
  let courses: Map<string, CourseRec> | null = null;
  let token = 0;
  let alive = true;

  const docRow = (id: string, remove: boolean): string => {
    const r = recs!.get(id);
    if (!r) return remove ? `<li><span class="sp-main"><span class="sp-t">${esc(id)}</span><span class="sp-m mono">${esc(cfg.gone)}</span></span>${rmBtn('doc', id, id)}</li>` : '';
    const uni = card.unis[r.u]?.[0] ?? r.u;
    const bits = [r.k && r.c ? `<span lang="en">${esc(r.c)}</span>` : '', `<span lang="en">${esc(uni)}</span>`, `<span>${esc(card.types[r.ty] ?? r.ty)}</span>`, r.h ? `<span class="hosted"><span class="dot" aria-hidden="true"></span>${esc(card.hosted)}</span>` : ''].filter(Boolean);
    return (
      `<li><a class="sp-main" href="${card.doc}${esc(id)}/"><span class="sp-t">${r.x ?? esc(r.s ?? r.t)}</span><span class="sp-m mono">${bits.join('<span aria-hidden="true">·</span>')}</span></a>` +
      (remove ? rmBtn('doc', id, r.s ?? r.t) : saveBtn('doc', id)) +
      `</li>`
    );
  };
  const courseRow = (slug: string, remove: boolean, tag?: string): string => {
    const r = courses!.get(slug);
    if (!r) return remove ? `<li><span class="sp-main"><span class="sp-t">${esc(slug)}</span><span class="sp-m mono">${esc(cfg.gone)}</span></span>${rmBtn('course', slug, slug)}</li>` : '';
    const uni = uniShort(r.u, card.unis[r.u]?.[0]);
    return (
      `<li><a class="sp-main" href="${card.course}${esc(slug)}/"><span class="sp-t" lang="en">${r.c ? `<span class="sp-code mono">${esc(r.c)}</span>` : ''}${esc(r.t)}</span>` +
      `<span class="sp-m mono">${tag ? `<span>${esc(tag)}</span><span aria-hidden="true">·</span>` : ''}<span lang="en">${esc(uni)}</span><span aria-hidden="true">·</span><span>${esc(courseCounts(r, cc))}</span></span></a>` +
      (remove ? rmBtn('course', slug, r.t) : saveBtn('course', slug)) +
      `</li>`
    );
  };
  const rmBtn = (kind: Kind, id: string, name: string) => `<button type="button" class="sp-rm mono" data-sp-rm="${kind}" data-id="${esc(id)}" aria-label="${esc(cfg.remove)}: ${esc(name.replace(/\$/g, ''))}">${esc(cfg.remove)}</button>`;
  const saveBtn = (kind: Kind, id: string) => `<button type="button" class="save sp-save" data-save="${kind}" data-id="${esc(id)}" aria-pressed="false" aria-label="${esc(cfg.save)}">${BOOKMARK_SVG}</button>`;

  const fillGroup = (key: keyof typeof groups, rows: string[], n?: number) => {
    const g = groups[key];
    g.hidden = rows.length === 0;
    g.querySelector('[data-sp-list]')!.innerHTML = rows.join('');
    const c = g.querySelector('[data-sp-n]');
    if (c && n != null) c.textContent = String(n);
  };

  const render = async () => {
    const my = ++token;
    const d = read();
    const any = d.d.length + d.c.length + d.s.length + (d.lc ? 1 : 0) > 0;
    if (any && !recs) {
      statusEl.hidden = false;
      try {
        const [r, c] = await Promise.all([loadIndex(card), loadCourses(cc)]);
        recs = new Map(r.map((x) => [x.i, x]));
        courses = new Map(c.map((x) => [x.s, x]));
      } catch {
        statusEl.textContent = cfg.error;
        return;
      }
      if (!alive || my !== token) return;
    }
    recs ??= new Map();
    courses ??= new Map();
    const fresh = read();
    const act = document.activeElement as HTMLElement | null;
    const keep = act?.closest('[data-sp-group="recent"]') && act.dataset.save ? `[data-sp-group="recent"] [data-save="${act.dataset.save}"][data-id="${act.dataset.id}"]` : null;
    statusEl.hidden = true;
    const nothing = fresh.d.length + fresh.c.length === 0;
    emptyEl.hidden = !nothing;
    clearBox.hidden = nothing;
    fillGroup('courses', fresh.c.map((e) => courseRow(e[0], true)), fresh.c.length);
    fillGroup('docs', fresh.d.map((e) => docRow(e[0], true)), fresh.d.length);
    const recent = [
      ...(fresh.lc && courses.has(fresh.lc[0]) ? [courseRow(fresh.lc[0], false, cfg.recentCourse)] : []),
      ...fresh.s.slice(0, RECENT).map((e) => docRow(e[0], false)),
    ].filter(Boolean);
    fillGroup('recent', recent);
    root.querySelector<HTMLElement>('[data-sp-nostore]')!.hidden = isPersistent();
    // A change elsewhere cancels an open confirmation.
    confirm.hidden = true;
    clearBtn.hidden = false;
    syncDom();
    if (keep) root.querySelector<HTMLElement>(keep)?.focus();
  };

  const onClick = (e: Event) => {
    const t = e.target as Element;
    const rm = t.closest<HTMLElement>('[data-sp-rm]');
    if (rm) {
      const all = [...root.querySelectorAll<HTMLElement>('[data-sp-rm]')];
      const i = all.indexOf(rm);
      setSaved(rm.dataset.spRm as Kind, rm.dataset.id!, false);
      // The list re-renders (async); put focus on the neighbouring remove button.
      setTimeout(() => {
        const left = [...root.querySelectorAll<HTMLElement>('[data-sp-rm]')];
        (left[Math.min(i, left.length - 1)] ?? document.querySelector<HTMLElement>('main h1') ?? document.getElementById('main'))?.focus();
      }, 0);
      return;
    }
    if (t.closest('[data-sp-clear-btn]')) {
      clearBtn.hidden = true;
      confirm.hidden = false;
      root.querySelector<HTMLElement>('[data-sp-no]')!.focus();
    } else if (t.closest('[data-sp-no]')) {
      confirm.hidden = true;
      clearBtn.hidden = false;
      clearBtn.focus();
    } else if (t.closest('[data-sp-yes]')) {
      clearList();
      setTimeout(() => (document.querySelector<HTMLElement>('main h1') ?? document.getElementById('main'))?.focus(), 0);
    }
  };
  root.addEventListener('click', onClick);
  // Toggles in "recently viewed" change the list too; the stored list is the single source of truth.
  const off = onChange(() => void render());
  void render();
  return () => {
    alive = false;
    token++;
    off();
    root.removeEventListener('click', onClick);
  };
}
