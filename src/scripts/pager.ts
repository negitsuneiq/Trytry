// "Show more" batching for client-rendered card grids. Cards are created in
// batches from the shared index (see cards.ts), never all at once.

import { appendCards, loadIndex, readCfg } from './cards';
import type { CardRec } from '../lib/cardRec';

export const BATCH = 48;
const PAGE_BATCH = 24;

export type Pager = {
  /** Replace the list: renders the first batch (resetting the grid). */
  set: (items: CardRec[]) => void;
};

export interface PagerOpts {
  size?: number;
  /** Append items[from, to) to the grid (after clearing it when `from` is 0); returns the first new element. */
  mount: (items: CardRec[], from: number, to: number) => HTMLElement | undefined;
  /** Lazy lists: total is known up front, `shown` already rendered, items arrive on the first click. */
  lazy?: { total: number; shown: number; load: () => Promise<CardRec[]> };
}

/** `more` is the [data-more] block (count + button); it stays hidden until needed. */
export function createPager(more: HTMLElement, opts: PagerOpts): Pager & { start: () => void } {
  const size = opts.size ?? BATCH;
  const btn = more.querySelector<HTMLButtonElement>('[data-more-btn]')!;
  const count = more.querySelector<HTMLElement>('[data-more-count]')!;
  const tpl = count.dataset.template!;
  let items: CardRec[] | null = [];
  let total = 0;
  let shown = 0;

  const render = () => {
    more.hidden = total <= size && !opts.lazy;
    if (opts.lazy && total <= shown) more.hidden = true;
    count.textContent = tpl.replace('{shown}', String(Math.min(shown, total))).replace('{total}', String(total));
    btn.hidden = shown >= total;
  };

  btn.addEventListener('click', async () => {
    if (!items) {
      btn.disabled = true;
      try {
        items = await opts.lazy!.load();
      } catch {
        btn.disabled = false;
        count.textContent = readCfgError();
        return;
      }
      btn.disabled = false;
      total = items.length;
    }
    const from = shown;
    shown = Math.min(shown + size, total);
    const first = opts.mount(items, from, shown);
    render();
    (first?.querySelector<HTMLElement>('a') ?? first)?.focus({ preventScroll: false });
  });

  const readCfgError = () => readCfg().ui.error;

  const api = {
    set(next: CardRec[]) {
      items = next;
      total = next.length;
      shown = Math.min(size, total);
      opts.mount(items, 0, shown);
      render();
    },
    start() {
      if (!opts.lazy) return;
      items = null;
      total = opts.lazy.total;
      shown = opts.lazy.shown;
      render();
    },
  };
  return api;
}

/**
 * Topic and university pages: the first batch is server-rendered, the rest is
 * built from the shared index on the first "Show more" click.
 * Grid attributes: data-paged="topic|university", data-slug, data-total.
 */
export function initPagers() {
  document.querySelectorAll<HTMLElement>('[data-paged]').forEach((grid) => {
    const more = grid.parentElement?.querySelector<HTMLElement>('[data-more]');
    if (!more) return;
    const cfg = readCfg();
    const kind = grid.dataset.paged!;
    const slug = grid.dataset.slug!;
    const shown = grid.children.length;
    createPager(more, {
      size: PAGE_BATCH,
      mount: (items, from, to) => appendCards(grid, items.slice(from, to), cfg, 'h2', true),
      lazy: {
        total: Number(grid.dataset.total),
        shown,
        load: async () => {
          const recs = await loadIndex(cfg);
          return recs.filter((r) => (kind === 'topic' ? r.p.includes(slug) : r.u === slug)).sort((a, b) => a.n - b.n);
        },
      },
    }).start();
  });
}
