// Library search and filtering. Cards are server-rendered; this only hides,
// shows and reorders them (in batches, see pager.ts), and mirrors every control into the URL.

import MiniSearch from 'minisearch';
import { createPager } from './pager';

type Rec = { id: string; title: string; authors: string; course: string; topics: string; university: string };

const FACETS = ['u', 't', 'l', 'ty', 'li'] as const;
const ATTR: Record<(typeof FACETS)[number], string> = { u: 'university', t: 'topics', l: 'level', ty: 'type', li: 'license' };

export function initLibrary() {
  const root = document.querySelector<HTMLElement>('[data-library]');
  if (!root) return;
  const records = JSON.parse(document.getElementById('lib-index')!.textContent!) as Rec[];
  const ms = new MiniSearch<Rec>({
    fields: ['title', 'authors', 'course', 'topics', 'university'],
    storeFields: [],
    searchOptions: { boost: { title: 3, course: 2, authors: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  });
  ms.addAll(records);

  const q = root.querySelector<HTMLInputElement>('[data-q]')!;
  const sorts = [...root.querySelectorAll<HTMLInputElement>('[data-sort]')];
  const hosted = root.querySelector<HTMLInputElement>('[data-hosted]')!;
  const boxes = [...root.querySelectorAll<HTMLInputElement>('[data-facet]')];
  const grid = root.querySelector<HTMLElement>('[data-grid]')!;
  const cards = [...grid.querySelectorAll<HTMLElement>('.card')];
  const countLabel = root.querySelector<HTMLElement>('[data-count-label]')!;
  const pager = createPager(root.querySelector<HTMLElement>('[data-more]')!);
  const none = root.querySelector<HTMLElement>('[data-none]')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-fs-toggle]')!;
  const panel = root.querySelector<HTMLElement>('[data-panel]')!;
  const activeCount = root.querySelector<HTMLElement>('[data-active-count]')!;
  const chips = root.querySelector<HTMLElement>('[data-active]')!;
  const showResults = root.querySelector<HTMLElement>('[data-show-results]')!;

  // URL → controls
  const params = new URLSearchParams(location.search);
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
    const scores = new Map<string, number>();
    if (query) for (const r of ms.search(query)) scores.set(r.id as string, r.score);

    const active = Object.fromEntries(FACETS.map((k) => [k, selected(k)]));
    const visible: HTMLElement[] = [];
    for (const c of cards) {
      let ok = !query || scores.has(c.dataset.id!);
      if (ok && hosted.checked) ok = c.dataset.hosted === 'true';
      for (const k of FACETS) {
        if (!ok || !active[k].length) continue;
        const have = c.dataset[ATTR[k]]!.split(' ');
        ok = active[k].some((v) => have.includes(v));
      }
      c.hidden = !ok;
      if (ok) visible.push(c);
    }

    const by = sortValue();
    const cmp: Record<string, (a: HTMLElement, b: HTMLElement) => number> = {
      relevance: (a, b) => (scores.get(b.dataset.id!) ?? 0) - (scores.get(a.dataset.id!) ?? 0) || +a.dataset.rank! - +b.dataset.rank!,
      newest: (a, b) => +b.dataset.year! - +a.dataset.year! || b.dataset.accessed!.localeCompare(a.dataset.accessed!),
      title: (a, b) => a.dataset.title!.localeCompare(b.dataset.title!),
      rank: (a, b) => +a.dataset.rank! - +b.dataset.rank! || a.dataset.title!.localeCompare(b.dataset.title!),
    };
    visible.sort(cmp[by] ?? cmp.relevance);
    const frag = document.createDocumentFragment();
    [...visible, ...cards.filter((c) => c.hidden)].forEach((c) => frag.appendChild(c));
    grid.appendChild(frag);
    pager.set(visible);

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

    // controls → URL
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
