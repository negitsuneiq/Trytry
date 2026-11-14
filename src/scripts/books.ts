// Books page: client-side topic select and title/author filter over the
// server-rendered list. The topic lives in the address bar (?topic=slug).

const fold = (s: string) =>
  s
    .toLocaleLowerCase('en')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

export function initBooks() {
  const root = document.querySelector<HTMLElement>('[data-books]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  const q = root.querySelector<HTMLInputElement>('[data-q]')!;
  const sel = root.querySelector<HTMLSelectElement>('[data-topic]')!;
  const count = root.querySelector<HTMLElement>('[data-books-count]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const clear = root.querySelector<HTMLButtonElement>('[data-clear]')!;
  const items = [...root.querySelectorAll<HTMLElement>('[data-book]')].map((el) => ({
    el,
    topics: (el.dataset.topics ?? '').split(' '),
    text: fold(el.dataset.search ?? ''),
  }));

  const fromUrl = new URLSearchParams(location.search).get('topic') ?? '';
  if ([...sel.options].some((o) => o.value === fromUrl)) sel.value = fromUrl;

  const apply = () => {
    const topic = sel.value;
    const terms = fold(q.value).split(/\s+/).filter(Boolean);
    let n = 0;
    for (const it of items) {
      const ok = (!topic || it.topics.includes(topic)) && terms.every((t) => it.text.includes(t));
      it.el.hidden = !ok;
      if (ok) n++;
    }
    count.textContent = (n === 1 ? count.dataset.one! : count.dataset.many!).replace(/\d+/, String(n));
    empty.hidden = n > 0;
    clear.hidden = !topic && !q.value;
    const url = new URL(location.href);
    if (topic) url.searchParams.set('topic', topic);
    else url.searchParams.delete('topic');
    history.replaceState(history.state, '', url);
  };

  q.addEventListener('input', apply);
  sel.addEventListener('change', apply);
  clear.addEventListener('click', () => {
    q.value = '';
    sel.value = '';
    apply();
    q.focus();
  });
  apply();
}
