// "My reading list": saved documents and courses, and the browsing history that
// feeds "continue where you left off". Everything lives in this browser's
// localStorage under one small versioned key; nothing is sent anywhere. If the
// storage is unavailable (private mode, blocked), the same API keeps working in
// memory for the lifetime of the page.

export type Kind = 'doc' | 'course';
type Entry = [id: string, ts: number];

/** Snapshot of the last opened document, so the home page can draw its strip without loading the index. */
export interface Last {
  /** document id */
  i: string;
  /** short title (plain text) */
  t: string;
  /** course line, e.g. "18.05 Introduction to Probability" */
  c?: string;
  /** course slug */
  k?: string;
}

interface Data {
  v: 1;
  /** saved documents, newest first */
  d: Entry[];
  /** saved courses, newest first */
  c: Entry[];
  /** opened documents, newest first (the first RECENT are "recently viewed") */
  s: Entry[];
  /** last opened course */
  lc: Entry | null;
  /** last opened document */
  l: Last | null;
}

const KEY = 'ol-list-v1';
export const SEEN_MAX = 500;
export const RECENT = 8;
const LIST_MAX = 500;

const blank = (): Data => ({ v: 1, d: [], c: [], s: [], lc: null, l: null });
let mem: Data | null = null;
let persistent = true;

const entries = (x: unknown, max: number): Entry[] =>
  Array.isArray(x) ? x.filter((e): e is Entry => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number').slice(0, max) : [];

function parse(raw: string | null): Data {
  if (!raw) return blank();
  try {
    const o = JSON.parse(raw) as Partial<Data>;
    if (!o || o.v !== 1) return blank();
    const l = o.l;
    return {
      v: 1,
      d: entries(o.d, LIST_MAX),
      c: entries(o.c, LIST_MAX),
      s: entries(o.s, SEEN_MAX),
      lc: entries([o.lc], 1)[0] ?? null,
      l: l && typeof l.i === 'string' && typeof l.t === 'string' ? { i: l.i, t: l.t, c: typeof l.c === 'string' ? l.c : undefined, k: typeof l.k === 'string' ? l.k : undefined } : null,
    };
  } catch {
    return blank();
  }
}

export function read(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    persistent = true;
    mem = parse(raw);
  } catch {
    persistent = false;
    mem ??= blank();
  }
  return mem;
}

function write(d: Data) {
  mem = d;
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    persistent = true;
  } catch {
    persistent = false;
  }
}

export const isPersistent = () => (read(), persistent);

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
/** Runs `fn` whenever the data changes, here or in another tab. Returns an unsubscribe function. */
export function onChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const field = (k: Kind) => (k === 'doc' ? 'd' : 'c');
export const isSaved = (k: Kind, id: string) => read()[field(k)].some((e) => e[0] === id);
export const savedCount = () => {
  const d = read();
  return d.d.length + d.c.length;
};

export function setSaved(k: Kind, id: string, on: boolean): void {
  const d = read();
  const f = field(k);
  const rest = d[f].filter((e) => e[0] !== id);
  d[f] = on ? [[id, Date.now()] as Entry, ...rest].slice(0, LIST_MAX) : rest;
  write(d);
  emit();
}
export const toggleSaved = (k: Kind, id: string) => {
  const on = !isSaved(k, id);
  setSaved(k, id, on);
  return on;
};

export function clearList(): void {
  const d = read();
  d.d = [];
  d.c = [];
  write(d);
  emit();
}

export function recordDoc(last: Last): void {
  const d = read();
  d.s = [[last.i, Date.now()] as Entry, ...d.s.filter((e) => e[0] !== last.i)].slice(0, SEEN_MAX);
  d.l = last;
  write(d);
  emit();
}
export function recordCourse(slug: string): void {
  const d = read();
  d.lc = [slug, Date.now()];
  write(d);
  emit();
}

// ── DOM ───────────────────────────────────────────────────────────────────

interface SaveCfg {
  add: string;
  remove: string;
  addCourse: string;
  /** "My reading list ({n})" */
  list: string;
  /** "{n} / {m} viewed" */
  seenCount: string;
}
let cfgCache: { el: Element; cfg: SaveCfg } | null = null;
function cfg(): SaveCfg | null {
  const el = document.getElementById('save-cfg');
  if (!el) return null;
  if (cfgCache?.el !== el) cfgCache = { el, cfg: JSON.parse(el.textContent!) as SaveCfg };
  return cfgCache.cfg;
}

/** Brings every toggle, the header badge, "viewed" ticks and the course counter in line with the stored state. */
export function syncDom(): void {
  const c = cfg();
  const data = read();
  const saved = { doc: new Set(data.d.map((e) => e[0])), course: new Set(data.c.map((e) => e[0])) };
  document.querySelectorAll<HTMLElement>('[data-save]').forEach((b) => {
    const kind = b.dataset.save as Kind;
    const on = saved[kind].has(b.dataset.id ?? '');
    b.setAttribute('aria-pressed', String(on));
    if (!c) return;
    const text = b.querySelector<HTMLElement>('[data-save-text]');
    const label = on ? c.remove : text && kind === 'course' ? c.addCourse : c.add;
    if (text) {
      if (text.textContent !== label) text.textContent = label;
    } else {
      b.setAttribute('aria-label', label);
      b.title = label;
    }
  });

  const n = data.d.length + data.c.length;
  document.querySelectorAll<HTMLElement>('[data-saved-link]').forEach((a) => {
    a.hidden = n === 0;
    const cnt = a.querySelector('[data-saved-count]');
    if (cnt) cnt.textContent = String(n);
    if (c) a.setAttribute('aria-label', c.list.replace('{n}', String(n)));
  });
  document.querySelectorAll<HTMLElement>('[data-saved-item]').forEach((li) => {
    li.hidden = n === 0;
    const cnt = li.querySelector('[data-saved-count]');
    if (cnt) cnt.textContent = String(n);
  });

  const seen = new Set(data.s.map((e) => e[0]));
  let nSeen = 0;
  document.querySelectorAll<HTMLElement>('[data-doc-id]').forEach((r) => {
    const on = seen.has(r.dataset.docId ?? '');
    r.toggleAttribute('data-seen', on);
    if (on && r.closest('[data-course-view]')) nSeen++;
  });
  document.querySelectorAll<HTMLElement>('[data-seen-count]').forEach((p) => {
    p.hidden = nSeen === 0;
    if (c) p.textContent = c.seenCount.replace('{n}', String(nSeen)).replace('{m}', p.dataset.total ?? '');
  });
}

/** The home page's one-line "where you left off" strip; hidden unless there is history. */
function syncResume(): void {
  const strip = document.querySelector<HTMLElement>('[data-resume]');
  if (!strip) return;
  const l = read().l;
  const was = !strip.hidden;
  if (!l) {
    strip.hidden = true;
  } else {
    const a = strip.querySelector<HTMLAnchorElement>('[data-resume-link]')!;
    a.href = (strip.dataset.doc ?? '') + encodeURIComponent(l.i) + '/';
    strip.querySelector('[data-resume-t]')!.textContent = l.t;
    strip.querySelector('[data-resume-c]')!.textContent = l.c ? ` — ${l.c}` : '';
    strip.hidden = false;
  }
  if (was !== !strip.hidden && document.querySelector('[data-home]') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    import('./home').then((m) => m.refreshScroll());
  }
}

function recordView(): void {
  const doc = document.querySelector<HTMLElement>('[data-doc-view]');
  if (doc) {
    const d = doc.dataset;
    recordDoc({ i: d.docView!, t: d.docTitle ?? d.docView!, c: d.docCourse || undefined, k: d.courseSlug || undefined });
    if (d.courseSlug) recordCourse(d.courseSlug);
  }
  const course = document.querySelector<HTMLElement>('[data-course-view]');
  if (course?.dataset.courseView) recordCourse(course.dataset.courseView);
}

let wired = false;
/** Called on every page load (astro:page-load). */
export function initSaved(): void {
  if (!wired) {
    wired = true;
    document.addEventListener('click', (e) => {
      const b = (e.target as Element | null)?.closest<HTMLElement>('[data-save]');
      if (!b?.dataset.id) return;
      e.preventDefault();
      toggleSaved(b.dataset.save as Kind, b.dataset.id);
    });
    // Another tab changed the list.
    addEventListener('storage', (e) => {
      if (e.key === KEY || e.key === null) emit();
    });
    onChange(() => {
      syncDom();
      syncResume();
    });
  }
  recordView();
  syncDom();
  syncResume();
}
