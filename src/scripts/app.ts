// Site-wide motion and interaction. Runs on every client-side navigation
// (astro:page-load) and tears down on astro:before-swap.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const coarse = matchMedia('(pointer: coarse)');

let lenis: Lenis | null = null;
let cleanups: (() => void)[] = [];

function initLenis() {
  if (lenis || reduced.matches) return;
  // Touch scrolling stays native (syncTouch off): it already feels right on tablets.
  lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function initCursor() {
  const el = document.querySelector<HTMLElement>('.cursor');
  if (!el || !fine.matches || el.dataset.bound) return;
  el.dataset.bound = '1';
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

function initSplits() {
  if (reduced.matches) return;
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    const tween = gsap.from(split.lines, {
      yPercent: 110,
      duration: 1.25,
      ease: 'expo.out',
      stagger: 0.09,
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
    cleanups.push(() => {
      tween.scrollTrigger?.kill();
      tween.kill();
      split.revert();
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

function initCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) =>
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
      const label = b.querySelector('[data-copy-label]');
      if (label) {
        const prev = label.textContent;
        label.textContent = b.dataset.copied ?? '✓';
        setTimeout(() => (label.textContent = prev), 1600);
      }
    }),
  );
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
        if (!d) return;
        const next = tabs[(i + d + tabs.length) % tabs.length];
        next.focus();
        select(next);
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
  const tasks = [initLenis, initCursor, initSplits, initMagnetic, initHero, () => ScrollTrigger.refresh()];
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
  lenis?.scrollTo(0, { immediate: true });
});
