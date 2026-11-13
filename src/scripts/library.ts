// Library search and filtering. Cards are server-rendered; this only hides,
// shows and reorders them, and mirrors every control into the URL.

import MiniSearch from 'minisearch';
import { lockScroll, trapFocus, unlockScroll } from './overlay';

type Rec = { id: string; title: string; authors: string; course: string; topics: string; university: string };

const FACETS = ['u', 't', 'l', 'ty', 'li'] as const;
const ATTR: Record<(typeof FACETS)[number], string> = { u: 'university', t: 'topics', l: 'level', ty: 'type', li: 'license' };

let dispose: (() => void) | null = null;

/** Sets up the library page. Safe to call more than once per page. */
export function initLibrary() {
  const root = document.querySelector<HTMLElement>('[data-library]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  const records = JSON.parse(document.getElementById('lib-index')!.textContent!) as Rec[];
  const ms = new MiniSearch<Rec>({
    fields: ['title', 'authors', 'course', 'topics', 'university'],
    storeFields: [],
    // Fold case and diacritics so "istatistik" finds "İstatistik" and "olasilik" finds "Olasılık".
    processTerm: (term) => fold(term),
    searchOptions: { boost: { title: 3, course: 2, authors: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  });
  ms.addAll(records);

  const q = root.querySelector<HTMLInputElement>('[data-q]')!;
  const sort = root.querySelector<HTMLSelectElement>('[data-sort]')!;
  const hosted = root.querySelector<HTMLInputElement>('[data-hosted]')!;
  const boxes = [...root.querySelectorAll<HTMLInputElement>('[data-facet]')];
  const grid = root.querySelector<HTMLElement>('[data-grid]')!;
  const cards = [...grid.querySelectorAll<HTMLElement>('.card')];
  const countLabel = root.querySelector<HTMLElement>('[data-count-label]')!;
  const none = root.querySelector<HTMLElement>('[data-none]')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-filters-toggle]')!;
  const panel = root.querySelector<HTMLElement>('#lib-filters')!;
  const activeCount = root.querySelector<HTMLElement>('[data-active-count]')!;
  const header = document.querySelector<HTMLElement>('.site-header');

  // URL → controls
  const params = new URLSearchParams(location.search);
  q.value = params.get('q') ?? '';
  const wantedSort = params.get('s') ?? 'relevance';
  sort.value = [...sort.options].some((o) => o.value === wantedSort) ? wantedSort : 'relevance';
  hosted.checked = params.get('h') === '1';
  for (const key of FACETS) {
    const vals = new Set((params.get(key) ?? '').split(',').filter(Boolean));
    boxes.filter((b) => b.dataset.facet === key).forEach((b) => (b.checked = vals.has(b.value)));
  }

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

    const by = sort.value;
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

    const n = visible.length;
    countLabel.textContent = (n === 1 ? countLabel.dataset.templateOne! : countLabel.dataset.template!).replace(/\d+/, String(n));
    none.hidden = n > 0;

    const nActive = FACETS.reduce((s, k) => s + active[k].length, 0) + (hosted.checked ? 1 : 0);
    activeCount.textContent = nActive ? `(${nActive})` : '';

    // controls → URL
    const out = new URLSearchParams();
    if (query) out.set('q', query);
    for (const k of FACETS) if (active[k].length) out.set(k, active[k].join(','));
    if (hosted.checked) out.set('h', '1');
    if (by !== 'relevance') out.set('s', by);
    const qs = out.toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);

    // The language switch keeps the current view.
    document.querySelectorAll<HTMLAnchorElement>('[data-lang-link]').forEach((a) => (a.search = qs));
  };

  let timer = 0;
  const onInput = () => {
    clearTimeout(timer);
    timer = window.setTimeout(apply, 120);
  };
  q.addEventListener('input', onInput);
  sort.addEventListener('change', apply);
  hosted.addEventListener('change', apply);
  boxes.forEach((b) => b.addEventListener('change', apply));

  // Filter sheet (below 1100px). Modal: scroll lock, focus trap, inert page.
  const wide = matchMedia('(min-width: 1100px)');
  let release: (() => void) | null = null;
  const setOpen = (open: boolean, restoreFocus = false) => {
    if (open === (toggle.getAttribute('aria-expanded') === 'true')) return;
    toggle.setAttribute('aria-expanded', String(open));
    panel.dataset.open = String(open);
    if (open) {
      lockScroll('filters');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.removeAttribute('inert');
      release = trapFocus(panel, { keep: header ? [header] : [], onEscape: () => setOpen(false, true) });
    } else {
      release?.();
      release = null;
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      unlockScroll('filters');
      if (restoreFocus) toggle.focus();
    }
  };
  const onToggle = () => setOpen(toggle.getAttribute('aria-expanded') !== 'true', true);
  const onApply = () => setOpen(false, true);
  const onClear = () => {
    boxes.forEach((b) => (b.checked = false));
    hosted.checked = false;
    q.value = '';
    apply();
  };
  const onWide = (e: MediaQueryListEvent) => e.matches && setOpen(false);
  toggle.addEventListener('click', onToggle);
  root.querySelector('[data-apply]')!.addEventListener('click', onApply);
  root.querySelector('[data-clear]')!.addEventListener('click', onClear);
  wide.addEventListener('change', onWide);

  apply();

  dispose = () => {
    clearTimeout(timer);
    wide.removeEventListener('change', onWide);
    setOpen(false);
    dispose = null;
  };
}

/** Releases locks held by the current page. Call before the page is swapped out. */
export function disposeLibrary() {
  dispose?.();
}

/** Lower-case and strip diacritics, with Turkish dotted/dotless i handled. */
function fold(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/ß/g, 'ss');
}
