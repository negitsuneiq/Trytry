// Library search and filtering over the shared /docs-index.json. Filtering,
// sorting and search run on the full set; only the cards of the current page
// of results are created (in batches, see pager.ts). On the /library/ page every control is
// mirrored into the URL (data-url-state); embedded on the home page the state stays in memory.

import { appendCards, loadIndex, readCfg } from './cards';
import { BATCH, createPager } from './pager';
import { buildCourseIndex, buildIndex, parseQuery, scoreDoc } from './search';
import { appendCourseCards, loadCourses, readCourseCfg, stripRowHtml } from './courseCards';
import type { CardRec } from '../lib/cardRec';
import type { CourseRec } from '../lib/courseRec';

const FACETS = ['u', 't', 'l', 'ty', 'li'] as const;
const HAVE: Record<(typeof FACETS)[number], (r: CardRec) => string[]> = {
  u: (r) => [r.u],
  t: (r) => r.p,
  l: (r) => [r.l],
  ty: (r) => [r.ty],
  li: (r) => [r.li],
};

type View = 'courses' | 'docs';
const COURSE_HAVE: Record<(typeof FACETS)[number], ((r: CourseRec, types: string[]) => string[]) | null> = {
  u: (r) => [r.u],
  t: (r) => r.p,
  l: (r) => [r.l],
  ty: (r, types) => types.filter((_, i) => r.ct[i] > 0),
  li: null, // a licence belongs to a document, not to a course
};
/** Courses listed in the strip above document results. */
const STRIP = 3;

export function initLibrary() {
  const root = document.querySelector<HTMLElement>('[data-library]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  const cfg = readCfg();
  const grid = root.querySelector<HTMLElement>('[data-grid]')!;
  const ccfg = readCourseCfg();
  const start = () =>
    Promise.all([loadIndex(cfg), ccfg ? loadCourses(ccfg).catch(() => [] as CourseRec[]) : Promise.resolve([] as CourseRec[])]).then(
      ([recs, crecs]) => setup(root, grid, cfg, recs, ccfg, crecs),
      () => {
        grid.setAttribute('aria-busy', 'false');
        grid.innerHTML = '';
        const box = root.querySelector<HTMLElement>('[data-none]')!;
        const p = box.querySelector<HTMLElement>('[data-none-msg]')!;
        p.textContent = cfg.ui.error;
        box.querySelectorAll('[data-none-extra]').forEach((e) => ((e as HTMLElement).hidden = true));
        box.setAttribute('role', 'alert');
        box.hidden = false;
      },
    );
  // The /library/ page needs the index at once. Embedded in the home page, the library sits several
  // screens down: fetch the ~770 KB index only when it is within 1.5 viewports, or when the search field is used.
  if (!root.closest('[data-home]')) return void start();
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    io?.disconnect();
    root.removeEventListener('focusin', go);
    root.removeEventListener('pointerdown', go);
    start();
  };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && go(), { rootMargin: '150% 0px' }) : null;
  if (io) io.observe(root);
  else go();
  root.addEventListener('focusin', go);
  root.addEventListener('pointerdown', go);
}

function setup(root: HTMLElement, grid: HTMLElement, cfg: ReturnType<typeof readCfg>, recs: CardRec[], ccfg: ReturnType<typeof readCourseCfg>, crecs: CourseRec[]) {
  const urlState = root.dataset.urlState === '1';
  const heading = root.dataset.cardHeading === 'h3' ? 'h3' : 'h2';
  const rank = (r: CardRec) => cfg.unis[r.u]?.[1] ?? 99;
  const docs = buildIndex(recs, cfg);
  const haveCourses = !!ccfg && crecs.length > 0;
  const cdocs = haveCourses ? buildCourseIndex(crecs, cfg) : [];
  const switcher = root.querySelector<HTMLElement>('[data-view-switch]');
  const viewBtns = [...(switcher?.querySelectorAll<HTMLButtonElement>('[data-view]') ?? [])];
  const strip = root.querySelector<HTMLElement>('[data-strip]')!;
  const stripList = root.querySelector<HTMLElement>('[data-strip-list]')!;
  const stripN = root.querySelector<HTMLElement>('[data-strip-n]')!;
  const stripAll = root.querySelector<HTMLButtonElement>('[data-strip-all]')!;
  if (!haveCourses && switcher) switcher.hidden = true;
  const defaultView: View = haveCourses && root.dataset.defaultView === 'courses' ? 'courses' : 'docs';

  const q = root.querySelector<HTMLInputElement>('[data-q]')!;
  const sorts = [...root.querySelectorAll<HTMLInputElement>('[data-sort]')];
  const viewOnly = [...root.querySelectorAll<HTMLElement>('[data-view-only]')];
  const hosted = root.querySelector<HTMLInputElement>('[data-hosted]')!;
  const boxes = [...root.querySelectorAll<HTMLInputElement>('[data-facet]')];
  const countLabel = root.querySelector<HTMLElement>('[data-count-label]')!;
  const pager = createPager(root.querySelector<HTMLElement>('[data-more]')!, {
    size: BATCH,
    mount: (items, from, to) => {
      if (from === 0) grid.replaceChildren();
      if (view === 'courses') return appendCourseCards(grid, (items as unknown as CourseRec[]).slice(from, to), ccfg!, cfg, heading);
      return appendCards(grid, items.slice(from, to), cfg, heading);
    },
  });
  const none = root.querySelector<HTMLElement>('[data-none]')!;
  const clearQ = root.querySelector<HTMLButtonElement>('[data-clear-q]')!;
  const clearF = root.querySelector<HTMLButtonElement>('[data-clear-f]')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-fs-toggle]')!;
  const panel = root.querySelector<HTMLElement>('[data-panel]')!;
  const activeCount = root.querySelector<HTMLElement>('[data-active-count]')!;
  const chips = root.querySelector<HTMLElement>('[data-active]')!;
  const showResults = root.querySelector<HTMLElement>('[data-show-results]')!;

  // URL → controls
  const params = new URLSearchParams(urlState ? location.search : '');
  let view: View = haveCourses ? (params.get('v') === 'docs' ? 'docs' : params.get('v') === 'courses' ? 'courses' : defaultView) : 'docs';
  if (urlState) q.value = params.get('q') ?? ''; // embedded: keep anything typed while the index was loading
  const setSort = (v: string) => sorts.forEach((r) => (r.checked = r.value === v));
  setSort(params.get('s') ?? 'relevance');
  hosted.checked = params.get('h') === '1';
  for (const key of FACETS) {
    const vals = new Set((params.get(key) ?? '').split(',').filter(Boolean));
    boxes.filter((b) => b.dataset.facet === key).forEach((b) => (b.checked = vals.has(b.value)));
  }

  const sortValue = () => sorts.find((r) => r.checked)?.value ?? 'relevance';
  // Licence filters and the "newest" sort belong to documents only, "most documents" to courses only.
  const inView = (el: HTMLElement) => {
    const only = el.closest<HTMLElement>('[data-view-only]')?.dataset.viewOnly;
    return !only || only === (view === 'courses' ? 'c' : 'd');
  };
  const selected = (key: string) => boxes.filter((b) => b.dataset.facet === key && b.checked && inView(b)).map((b) => b.value);
  const syncView = () => {
    for (const el of viewOnly) el.hidden = !inView(el);
    if (sorts.find((r) => r.checked)?.closest<HTMLElement>('[data-view-only]')?.hidden) setSort('relevance');
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    grid.dataset.mode = view === 'courses' ? 'c' : 'd';
  };

  const apply = () => {
    syncView();
    const query = q.value.trim();
    const parsed = parseQuery(query);
    const active = Object.fromEntries(FACETS.map((k) => [k, selected(k)]));
    const hostedOn = hosted.checked;

    // Courses matching the query and the filters (the course view, and the strip above document results).
    const cScores = new Map<string, number>();
    let courseHits: CourseRec[] = [];
    if (haveCourses) {
      for (let k = 0; k < crecs.length; k++) {
        const r = crecs[k];
        let sc = 0;
        if (parsed) {
          sc = scoreDoc(cdocs[k], parsed);
          if (sc < 0) continue;
        }
        if (hostedOn && r.h === 0) continue;
        let ok = true;
        for (const f of FACETS) {
          const have = COURSE_HAVE[f];
          if (!ok || !active[f].length || !have) continue;
          const h = have(r, ccfg!.types);
          ok = active[f].some((v) => h.includes(v));
        }
        if (!ok) continue;
        cScores.set(r.s, sc);
        courseHits.push(r);
      }
    }

    const scores = new Map<string, number>();
    const visible: CardRec[] = [];
    if (view === 'docs') {
      if (parsed) {
        for (let k = 0; k < recs.length; k++) {
          const sc = scoreDoc(docs[k], parsed);
          if (sc >= 0) scores.set(recs[k].i, sc);
        }
      }
      for (const r of recs) {
        let ok = !parsed || scores.has(r.i);
        if (ok && hostedOn) ok = r.h === 1;
        for (const k of FACETS) {
          if (!ok || !active[k].length) continue;
          const have = HAVE[k](r);
          ok = active[k].some((v) => have.includes(v));
        }
        if (ok) visible.push(r);
      }
    }

    const by = sortValue();
    let n: number;
    if (view === 'courses') {
      const crank = (r: CourseRec) => cfg.unis[r.u]?.[1] ?? 99;
      const ccmp: Record<string, (a: CourseRec, b: CourseRec) => number> = {
        relevance: (a, b) => (cScores.get(b.s) ?? 0) - (cScores.get(a.s) ?? 0) || a.o - b.o,
        size: (a, b) => b.d - a.d || a.o - b.o,
        title: (a, b) => a.n - b.n,
        rank: (a, b) => crank(a) - crank(b) || a.n - b.n,
      };
      courseHits.sort(ccmp[by] ?? ccmp.relevance);
      pager.set(courseHits as unknown as CardRec[]);
      n = courseHits.length;
    } else {
      // A year equal to the year of access is the crawl date, not the document's.
      const year = (r: CardRec) => (r.y && r.y < Number(r.d.slice(0, 4)) ? r.y : 0);
      const cmp: Record<string, (a: CardRec, b: CardRec) => number> = {
        relevance: (a, b) => (scores.get(b.i) ?? 0) - (scores.get(a.i) ?? 0) || a.o - b.o,
        newest: (a, b) => year(b) - year(a) || a.o - b.o,
        title: (a, b) => a.n - b.n,
        rank: (a, b) => rank(a) - rank(b) || a.n - b.n,
      };
      visible.sort(cmp[by] ?? cmp.relevance);
      pager.set(visible);
      n = visible.length;
    }
    grid.setAttribute('aria-busy', 'false');

    // Course strip: the best few courses for a query, above the document results.
    const strong = view === 'docs' && parsed && haveCourses ? [...courseHits].sort((a, b) => (cScores.get(b.s) ?? 0) - (cScores.get(a.s) ?? 0) || b.d - a.d || a.o - b.o) : [];
    strip.hidden = strong.length === 0;
    stripList.innerHTML = strong.slice(0, STRIP).map((r) => stripRowHtml(r, ccfg!, cfg)).join('');
    stripN.textContent = strong.length ? String(strong.length) : '';
    stripAll.hidden = strong.length <= STRIP;
    stripAll.textContent = ccfg ? ccfg.stripAll.replace('0', String(strong.length)) : '';

    const tpl = (el: HTMLElement, one: boolean) => el.dataset[(one ? 'templateOne' : 'template') + (view === 'courses' ? 'C' : '')]!;
    countLabel.textContent = tpl(countLabel, n === 1).replace(/\d+/, String(n));
    showResults.textContent = tpl(showResults, n === 1).replace(/\d+/, String(n));
    none.hidden = n > 0;

    // Active filters, shown (and removable) outside the panel.
    const picked: { label: string; input: HTMLInputElement }[] = [];
    if (hosted.checked) picked.push({ label: hosted.closest('label')!.textContent!.trim(), input: hosted });
    for (const b of boxes) if (b.checked && inView(b)) picked.push({ label: b.nextElementSibling!.textContent!.trim(), input: b });
    chips.replaceChildren(
      ...picked.map(({ label, input }) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', `${chips.dataset.remove}: ${label}`);
        btn.innerHTML = `<span></span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2 2 10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
        btn.firstElementChild!.textContent = label;
        btn.addEventListener('click', () => {
          input.checked = false;
          apply();
          (chips.querySelector('button') ?? toggle).focus();
        });
        li.append(btn);
        return li;
      }),
    );
    activeCount.textContent = String(picked.length);
    activeCount.hidden = picked.length === 0;
    clearQ.hidden = !query;
    clearF.hidden = picked.length === 0;

    // controls → URL
    if (!urlState) return;
    const out = new URLSearchParams();
    if (query) out.set('q', query);
    for (const k of FACETS) if (active[k].length) out.set(k, active[k].join(','));
    if (hosted.checked) out.set('h', '1');
    if (by !== 'relevance') out.set('s', by);
    if (haveCourses && view !== defaultView) out.set('v', view);
    const qs = out.toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  };

  const setView = (v: View) => {
    if (v === view) return;
    view = v;
    apply();
  };
  viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view as View)));
  stripAll.addEventListener('click', () => {
    setView('courses');
    root.querySelector('.status')?.scrollIntoView({ block: 'start' });
  });

  let timer = 0;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(apply, 120);
  });
  sorts.forEach((r) => r.addEventListener('change', apply));
  hosted.addEventListener('change', apply);
  boxes.forEach((b) => b.addEventListener('change', apply));

  // Popover on desktop, full-width sheet (page scroll locked) on phones.
  const sheet = matchMedia('(max-width: 719px)');
  const isOpen = () => !panel.hidden;
  const setOpen = (open: boolean, restoreFocus = false) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('menu-open', open && sheet.matches);
    if (open) {
      // Dock the search row under the header first, so the panel fits the viewport.
      const bar = root.querySelector<HTMLElement>('.searchbar')!;
      const gap = bar.getBoundingClientRect().top - parseFloat(getComputedStyle(bar).top);
      if (gap > 1 && !sheet.matches) window.scrollBy({ top: gap, behavior: 'instant' });
      panel.focus({ preventScroll: true });
    }
    else if (restoreFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => setOpen(!isOpen()));
  root.querySelectorAll('[data-fs-close]').forEach((b) => b.addEventListener('click', () => setOpen(false, true)));
  clearQ.addEventListener('click', () => {
    q.value = '';
    apply();
    q.focus();
  });
  clearF.addEventListener('click', () => {
    boxes.forEach((b) => (b.checked = false));
    hosted.checked = false;
    apply();
  });
  root.querySelector('[data-clear]')!.addEventListener('click', () => {
    boxes.forEach((b) => (b.checked = false));
    hosted.checked = false;
    q.value = '';
    apply();
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      e.stopPropagation();
      setOpen(false, true);
    }
  });
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false, true);
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !panel.contains(e.target as Node) && !toggle.contains(e.target as Node)) setOpen(false);
  });
  // Tabbing out of the popover closes it; the sheet is full-screen so this only matters on desktop.
  panel.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && !panel.contains(to) && !toggle.contains(to) && !sheet.matches) setOpen(false);
  });
  sheet.addEventListener('change', () => isOpen() && setOpen(true));

  apply();
}
