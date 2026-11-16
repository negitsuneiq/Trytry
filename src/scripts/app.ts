// Site-wide interaction. Runs on every client-side navigation
// (astro:page-load) and tears down on astro:before-swap.
// GSAP is NOT imported here: inner pages only need the tiny code below (reveals,
// heading line reveal, progress bar), and Lenis is a separate small chunk. The home
// page (the only one with scroll scenes) pulls GSAP in through ./home.

import type Lenis from 'lenis';
import { initSaved } from './saved';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let lenis: Lenis | null = null;
let lenisLoading = false;
let ownRaf = 0;
let cleanups: (() => void)[] = [];

/** Lenis smooth scrolling. Own rAF loop, until the home page hands it to GSAP's ticker. */
async function initLenis(withGsap: boolean) {
  if (reduced.matches) return;
  if (!lenis && !lenisLoading) {
    lenisLoading = true;
    const { default: LenisCtor } = await import('lenis');
    // Touch scrolling stays native (syncTouch off): it already feels right on tablets.
    lenis = new LenisCtor({ lerp: 0.11, wheelMultiplier: 0.95 });
    const loop = (t: number) => {
      lenis?.raf(t);
      ownRaf = requestAnimationFrame(loop);
    };
    ownRaf = requestAnimationFrame(loop);
  }
  if (withGsap && lenis && ownRaf) {
    const home = await import('./home');
    cancelAnimationFrame(ownRaf);
    ownRaf = 0;
    home.driveLenis(lenis);
  }
}

function initReveals() {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduced.matches) {
    items.forEach((i) => i.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  items.forEach((i) => io.observe(i));
  cleanups.push(() => io.disconnect());
}

/** Plain-text headings: each line slides up out of a clipping mask (the .split-line styles), one after another. */
function initSplits() {
  if (reduced.matches) return;
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const text = el.textContent?.trim() ?? '';
    if (!text || el.children.length) return;
    // Measure the lines by wrapping every word, then rebuild one block per line.
    el.textContent = '';
    const words = text.split(/\s+/).map((w) => {
      const sp = document.createElement('span');
      sp.style.display = 'inline-block';
      sp.textContent = w;
      el.append(sp, ' ');
      return sp;
    });
    const lines: string[][] = [];
    let top = NaN;
    for (const w of words) {
      if (w.offsetTop !== top) {
        top = w.offsetTop;
        lines.push([]);
      }
      lines[lines.length - 1].push(w.textContent!);
    }
    el.textContent = '';
    const inner = lines.map((l) => {
      const line = document.createElement('div');
      line.className = 'split-line';
      const span = document.createElement('span');
      span.textContent = l.join(' ');
      span.style.transform = 'translateY(110%)';
      line.append(span);
      el.append(line);
      return span;
    });
    const anims: Animation[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        inner.forEach((span, i) => {
          const a = span.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], {
            duration: 1250,
            delay: i * 90,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'backwards',
          });
          span.style.transform = '';
          anims.push(a);
        });
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    cleanups.push(() => {
      io.disconnect();
      anims.forEach((a) => a.cancel());
      el.textContent = text;
    });
  });
}

function initCounters() {
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    const pad = el.dataset.pad ? Number(el.dataset.pad) : 0;
    const fmt = (n: number) => String(Math.round(n)).padStart(pad, '0');
    if (reduced.matches) {
      el.textContent = fmt(to);
      return;
    }
    el.textContent = fmt(0);
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / 2200);
          el.textContent = fmt(to * (1 - (1 - k) ** 3));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { rootMargin: '0px 0px -5% 0px' },
    );
    io.observe(el);
    cleanups.push(() => {
      io.disconnect();
      cancelAnimationFrame(raf);
    });
  });
}

/** Reading progress, from native scroll position. */
function initProgress() {
  const bar = document.querySelector<HTMLElement>('[data-progress]');
  if (!bar) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', (max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0).toFixed(4));
  };
  const on = () => raf || (raf = requestAnimationFrame(update));
  addEventListener('scroll', on, { passive: true });
  addEventListener('resize', on, { passive: true });
  update();
  cleanups.push(() => {
    removeEventListener('scroll', on);
    removeEventListener('resize', on);
    cancelAnimationFrame(raf);
  });
}

/** KaTeX styles are not part of the global stylesheet: load them when math shows up in the DOM (e.g. client-built cards). */
function watchMath() {
  const loaded = () => !!document.querySelector('link[data-katex]');
  const has = () => !!document.querySelector('.katex');
  const load = async () => {
    if (loaded()) return;
    const { default: href } = await import('katex/dist/katex.min.css?url');
    if (loaded()) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.katex = '';
    document.head.append(link);
  };
  if (loaded()) return;
  if (has()) return void load();
  let timer = 0;
  const mo = new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (has()) {
        mo.disconnect();
        load();
      }
    }, 150);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  cleanups.push(() => {
    clearTimeout(timer);
    mo.disconnect();
  });
}

function initLangMemory() {
  document.querySelectorAll<HTMLAnchorElement>('[data-lang-link]').forEach((a) =>
    a.addEventListener('click', () => {
      try {
        localStorage.setItem('ol-lang', a.dataset.langLink!);
      } catch {}
    }),
  );
}

function initMenu() {
  const btn = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const panel = document.getElementById('site-menu');
  if (!btn || !panel) return;
  const set = (open: boolean) => {
    btn.setAttribute('aria-expanded', String(open));
    panel.dataset.open = String(open);
    document.documentElement.classList.toggle('menu-open', open);
    open ? lenis?.stop() : lenis?.start();
  };
  const toggle = () => set(btn.getAttribute('aria-expanded') !== 'true');
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && set(false);
  btn.addEventListener('click', toggle);
  document.addEventListener('keydown', esc);
  cleanups.push(() => {
    set(false);
    btn.removeEventListener('click', toggle);
    document.removeEventListener('keydown', esc);
  });
}

const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 1));
let generation = 0;

document.addEventListener('astro:page-load', () => {
  // Cheap, needed at once.
  initLangMemory();
  initMenu();
  initSaved();
  initReveals();
  initCounters();
  initSplits();
  initProgress();
  watchMath();
  // Smooth scrolling is set up when the browser is idle.
  const gen = ++generation;
  const home = !!document.querySelector('[data-home]');
  idle(async () => {
    if (gen !== generation) return; // navigated away meanwhile
    await initLenis(home);
    if (home && gen === generation && !reduced.matches) (await import('./home')).refreshScroll();
  });
});

document.addEventListener('astro:before-swap', () => {
  generation++;
  cleanups.forEach((c) => c());
  cleanups = [];
});

document.addEventListener('astro:after-swap', () => {
  lenis?.scrollTo(0, { immediate: true });
});
