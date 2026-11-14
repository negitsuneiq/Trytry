// "Show more" batching for card grids. Server HTML contains every card (so
// no-JS still works); this hides everything past the first batch.

const SIZE = 24;

export type Pager = { set: (items: HTMLElement[]) => void };

/** `more` is the [data-more] block (count + button); it stays hidden until needed. */
export function createPager(more: HTMLElement, size = SIZE): Pager {
  const btn = more.querySelector<HTMLButtonElement>('[data-more-btn]')!;
  const count = more.querySelector<HTMLElement>('[data-more-count]')!;
  const tpl = count.dataset.template!;
  let items: HTMLElement[] = [];
  let shown = 0;

  const render = () => {
    items.forEach((el, i) => (el.hidden = i >= shown));
    const total = items.length;
    more.hidden = total <= size;
    count.textContent = tpl.replace('{shown}', String(Math.min(shown, total))).replace('{total}', String(total));
    btn.hidden = shown >= total;
  };

  btn.addEventListener('click', () => {
    const from = shown;
    shown += size;
    render();
    items[from]?.querySelector<HTMLElement>('a')?.focus({ preventScroll: false });
  });

  return {
    set(next) {
      items = next;
      shown = size;
      render();
    },
  };
}

/** Pages whose grid is simply all cards: `[data-paged]` followed by a [data-more] sibling. */
export function initPagers() {
  document.querySelectorAll<HTMLElement>('[data-paged]').forEach((grid) => {
    const more = grid.parentElement?.querySelector<HTMLElement>('[data-more]');
    if (more) createPager(more).set([...grid.children] as HTMLElement[]);
  });
}
