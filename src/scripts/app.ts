// Site-wide motion and interaction. Runs on every client-side navigation
// (astro:page-load) and tears down on astro:before-swap.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { isLocked, lockScroll, onLockChange, trapFocus, unlockScroll } from './overlay';

gsap.registerPlugin(ScrollTrigger);

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const coarse = matchMedia('(pointer: coarse)');

let lenis: Lenis | null = null;
let cursorBound = false;
let cleanups: (() => void)[] = [];

// Lenis follows the shared scroll lock (mobile menu, filter sheet).
onLockChange((locked) => (locked ? lenis?.stop() : lenis?.start()));

function initLenis() {
  if (lenis || reduced.matches) return;
  // Touch scrolling stays native (syncTouch off): it already feels right on tablets.
  lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  if (isLocked()) lenis.stop();
}

function initCursor() {
  const el = document.querySelector<HTMLElement>('.cursor');
  if (!el || !fine.matches || el.dataset.bound) return;
  el.dataset.bound = '1';
  cursorBound = true;
  document.documentElement.classList.add('has-cursor');
  const dot = el.querySelector<HTMLElement>('.cursor-dot')!;
  const ring = el.querySelector<HTMLElement>('.cursor-ring')!;
  const label = el.querySelector<HTMLElement>('.cursor-label')!;
  let x = -100;
  let y = -100;
  let rx = x;
  let ry = y;
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    },
    { passive: true },
  );
  gsap.ticker.add(() => {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    const t = `translate3d(${rx}px, ${ry}px, 0)`;
    ring.style.transform = t;
    label.style.transform = t;
  });
  document.addEventListener('pointerover', (e) => {
    const target = (e.target as Element).closest<HTMLElement>('a, button, [data-cursor], label, select');
    el.classList.toggle('is-hover', !!target);
    label.textContent = target?.dataset.cursor ?? '';
  });
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

function initCounters() {
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    const pad = el.dataset.pad ? Number(el.dataset.pad) : 0;
    const fmt = (n: number) => String(Math.round(n)).padStart(pad, '0');
    if (reduced.matches) {
      el.textContent = fmt(to);
      return;
    }
    const obj = { v: 0 };
    el.textContent = fmt(0);
    const tween = gsap.to(obj, {
      v: to,
      duration: 2.2,
      ease: 'power3.out',
      onUpdate: () => (el.textContent = fmt(obj.v)),
      scrollTrigger: { trigger: el, start: 'top 95%' },
    });
    cleanups.push(() => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
  });
}

function initMagnetic() {
  if (!fine.matches || reduced.matches) return;
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    const strength = Number(el.dataset.magnetic) || 0.3;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * strength);
      yTo((e.clientY - r.top - r.height / 2) * strength);
    };
    const leave = () => {
      xTo(0);
      yTo(0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    cleanups.push(() => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    });
  });
}

function initHero() {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-lorenz]');
  if (!canvas) return;
  let destroy: (() => void) | null = null;
  let cancelled = false;
  const go = () =>
    import('./lorenz').then(({ mountLorenz }) => {
      if (!cancelled) destroy = mountLorenz(canvas, { reducedMotion: reduced.matches, coarse: coarse.matches });
    });
  // Defer WebGL until the page is idle so it never competes with first paint.
  const id = 'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 400);
  cleanups.push(() => {
    cancelled = true;
    'cancelIdleCallback' in window ? cancelIdleCallback(id as number) : clearTimeout(id as number);
    destroy?.();
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
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!btn || !panel || !header) return;
  const wide = matchMedia('(min-width: 1024px)');
  let release: (() => void) | null = null;

  const set = (open: boolean, restoreFocus = false) => {
    if (open === (btn.getAttribute('aria-expanded') === 'true')) return;
    btn.setAttribute('aria-expanded', String(open));
    panel.dataset.open = String(open);
    if (open) {
      lockScroll('menu');
      release = trapFocus(header, {
        initial: panel.querySelector<HTMLElement>('a'),
        onEscape: () => set(false, true),
      });
    } else {
      release?.();
      release = null;
      unlockScroll('menu');
      if (restoreFocus) btn.focus();
    }
  };
  const toggle = () => set(btn.getAttribute('aria-expanded') !== 'true', true);
  // The menu only exists below 1024px: crossing the breakpoint must unlock the page.
  const onWide = (e: MediaQueryListEvent) => e.matches && set(false);
  btn.addEventListener('click', toggle);
  wide.addEventListener('change', onWide);
  cleanups.push(() => {
    set(false);
    btn.removeEventListener('click', toggle);
    wide.removeEventListener('change', onWide);
  });
}

function initCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => {
    const label = b.querySelector<HTMLElement>('[data-copy-label]');
    const original = label?.textContent ?? '';
    let timer = 0;
    b.addEventListener('click', async () => {
      const src = document.getElementById(b.dataset.copy!);
      if (!src) return;
      try {
        await navigator.clipboard.writeText(src.textContent ?? '');
      } catch {
        const range = document.createRange();
        range.selectNodeContents(src);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        document.execCommand('copy');
      }
      if (label) {
        clearTimeout(timer);
        label.textContent = b.dataset.copied ?? '✓';
        timer = window.setTimeout(() => (label.textContent = original), 1600);
      }
    });
  });
}

function initTabs() {
  document.querySelectorAll<HTMLElement>('[role="tablist"]').forEach((list) => {
    const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const select = (tab: HTMLButtonElement) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')!)!.hidden = !on;
      }
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        const to = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : d ? (i + d + tabs.length) % tabs.length : -1;
        if (to < 0) return;
        e.preventDefault();
        tabs[to].focus();
        select(tabs[to]);
      });
    });
  });
}

const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 1));
let generation = 0;

document.addEventListener('astro:page-load', () => {
  // Cheap, needed at once.
  initLangMemory();
  initMenu();
  initCopy();
  initTabs();
  initReveals();
  initCounters();
  // Heavier set-up runs as separate idle tasks so no single task blocks input.
  const gen = ++generation;
  const tasks = [initLenis, initCursor, initMagnetic, initHero, () => ScrollTrigger.refresh()];
  const next = () => {
    if (gen !== generation) return; // navigated away meanwhile
    tasks.shift()?.();
    if (tasks.length) idle(next);
  };
  idle(next);
});

document.addEventListener('astro:before-swap', () => {
  generation++;
  cleanups.forEach((c) => c());
  cleanups = [];
});

document.addEventListener('astro:after-swap', () => {
  // ClientRouter replaces every attribute on <html>, so classes that scripts
  // added (the `js` flag, the custom-cursor flag) must be put back.
  const root = document.documentElement;
  root.classList.add('js');
  if (cursorBound) root.classList.add('has-cursor');
  if (isLocked()) root.classList.add('menu-open');
  (lenis as unknown as { updateClassName?: () => void } | null)?.updateClassName?.();
  lenis?.scrollTo(0, { immediate: true });
});
