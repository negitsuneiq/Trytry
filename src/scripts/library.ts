// Library search and filtering over the shared /docs-index.json. Filtering,
// sorting and search run on the full set; only the cards of the current page
// of results are created (in batches, see pager.ts). On the /library/ page every control is
// mirrored into the URL (data-url-state); embedded on the home page the state stays in memory.

import { appendCards, loadIndex, readCfg } from './cards';
import { BATCH, createPager } from './pager';
import { buildIndex, parseQuery, scoreDoc } from './search';
import type { CardRec } from '../lib/cardRec';

const FACETS = ['u', 't', 'l', 'ty', 'li'] as const;
const HAVE: Record<(typeof FACETS)[number], (r: CardRec) => string[]> = {
  u: (r) => [r.u],
  t: (r) => r.p,
  l: (r) => [r.l],
  ty: (r) => [r.ty],
  li: (r) => [r.li],
};

export function initLibrary() {
  const root = document.querySelector<HTMLElement>('[data-library]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  const cfg = readCfg();
  const grid = root.querySelector<HTMLElement>('[data-grid]')!;
  loadIndex(cfg).then(
    (recs) => setup(root, grid, cfg, recs),
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
}

function setup(root: HTMLElement, grid: HTMLElement, cfg: ReturnType<typeof readCfg>, recs: CardRec[]) {
  const urlState = root.dataset.urlState === '1';
  const heading = root.dataset.cardHeading === 'h3' ? 'h3' : 'h2';
  const rank = (r: CardRec) => cfg.unis[r.u]?.[1] ?? 99;
  const docs = buildIndex(recs, cfg);

  const q = root.querySelector<HTMLInputElement>('[data-q]')!;
  const sorts = [...root.querySelectorAll<HTMLInputElement>('[data-sort]')];
  const hosted = root.querySelector<HTMLInputElement>('[data-hosted]')!;
  const boxes = [...root.querySelectorAll<HTMLInputElement>('[data-facet]')];
  const countLabel = root.querySelector<HTMLElement>('[data-count-label]')!;
  const pager = createPager(root.querySelector<HTMLElement>('[data-more]')!, {
    size: BATCH,
    mount: (items, from, to) => {
      if (from === 0) grid.replaceChildren();
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
  q.value = params.get('q') ?? '';
  const setSort = (v: string) => sorts.forEach((r) => (r.checked = r.value === v));
  setSort(params.get('s') ?? 'relevance');
  hosted.checked = params.get('h') === '1';
  for (const key of FACETS) {
    const vals = new Set((params.get(key) ?? '').split(',').filter(Boolean));
    boxes.filter((b) => b.dataset.facet === key).forEach((b) => (b.checked = vals.has(b.value)));
  }

  const sortValue = () => sorts.find((r) => r.checked)?.value ?? 'relevance';
  const selected = (key: string) => boxes.filter((b) => b.dataset.facet === key && b.checked).map((b) => b.value);

  const apply = () => {
    const query = q.value.trim();
    const parsed = parseQuery(query);
    const scores = new Map<string, number>();
    if (parsed) {
      for (let k = 0; k < recs.length; k++) {
        const sc = scoreDoc(docs[k], parsed);
        if (sc >= 0) scores.set(recs[k].i, sc);
      }
    }

    const active = Object.fromEntries(FACETS.map((k) => [k, selected(k)]));
    const visible: CardRec[] = [];
    for (const r of recs) {
      let ok = !parsed || scores.has(r.i);
      if (ok && hosted.checked) ok = r.h === 1;
      for (const k of FACETS) {
        if (!ok || !active[k].length) continue;
        const have = HAVE[k](r);
        ok = active[k].some((v) => have.includes(v));
      }
      if (ok) visible.push(r);
    }

    const by = sortValue();
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
    grid.setAttribute('aria-busy', 'false');

    const n = visible.length;
    countLabel.textContent = (n === 1 ? countLabel.dataset.templateOne! : countLabel.dataset.template!).replace(/\d+/, String(n));
    showResults.textContent = (n === 1 ? showResults.dataset.templateOne! : showResults.dataset.template!).replace(/\d+/, String(n));
    none.hidden = n > 0;

    // Active filters, shown (and removable) outside the panel.
    const picked: { label: string; input: HTMLInputElement }[] = [];
    if (hosted.checked) picked.push({ label: hosted.closest('label')!.textContent!.trim(), input: hosted });
    for (const b of boxes) if (b.checked) picked.push({ label: b.nextElementSibling!.textContent!.trim(), input: b });
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
    const qs = out.toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  };

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
