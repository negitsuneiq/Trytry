// Home page choreography. The page reads like a paper (title, definition,
// lemma, theorem, Q.E.D.) and the scroll turns its pages: the title scene
// dollies through a desk of real first pages, the definition inks in word
// by word, the departments run sideways, the library follows as plain
// document flow and the tombstone fills. Built inside gsap.matchMedia, so
// reduced motion gets the static layout and every resize rebuilds cleanly.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

type Off = () => void;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
/** Scroll distance of the rail pin per pixel of sideways travel (was 0.8). */
const RAIL_SCROLL = 0.42;
const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

export function initHome(): Off | null {
  const home = $('[data-home]');
  if (!home) return null;

  const mm = gsap.matchMedia();
  mm.add(
    {
      motion: '(prefers-reduced-motion: no-preference)',
      reduce: '(prefers-reduced-motion: reduce)',
    },
    (ctx) => {
      const { reduce } = ctx.conditions as Record<string, boolean>;
      if (reduce) return staticState(home);
      const offs = [titleScene(home), definitionScene(home), departments(home), qed(home), margin(home)];
      return () => offs.forEach((o) => o());
    },
  );

  const offs = [watchLibrary(home)];
  // Web fonts change line heights, and every pin below them moves.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  return () => {
    mm.revert();
    offs.forEach((o) => o());
  };
}

/** Reduced motion: everything visible and finished, nothing pinned. */
function staticState(home: HTMLElement): Off {
  const def = $('.def-scene', home);
  def?.classList.add('is-static');
  return () => def?.classList.remove('is-static');
}

// ── Title: a dolly through the desk ─────────────────────────────────────────
function titleScene(home: HTMLElement): Off {
  const stage = $('[data-title-stage]', home)!;
  const storm = $('[data-storm]', stage)!;
  const titlepage = $('[data-titlepage]', stage)!;
  const fades = $$('[data-fade]', stage);
  const P = 1000; // matches the CSS perspective
  const DOLLY = 1700;
  const pages = $$('.pg', storm).map((el, i) => ({
    el,
    x: parseFloat(el.style.getPropertyValue('--x')),
    y: parseFloat(el.style.getPropertyValue('--y')),
    z: Number(el.dataset.z),
    r: parseFloat(el.style.getPropertyValue('--r')),
    phase: i * 1.7,
  }));
  const state = { p: 0 };
  let time = 0;
  // The next scene slides over this one at the end of the pin (see index.astro).
  home.classList.add('is-staged');

  const render = () => {
    const vw = innerWidth / 100;
    const vh = innerHeight / 100;
    for (const pg of pages) {
      const k = (P - pg.z) / P; // keeps the resting layout in screen space
      const z = pg.z + state.p * DOLLY;
      const bob = Math.sin(time * 0.7 + pg.phase) * 7;
      pg.el.style.transform = `translate3d(${(pg.x * vw * k).toFixed(1)}px, ${(pg.y * vh * k + bob).toFixed(1)}px, ${z.toFixed(1)}px) rotate(${(pg.r * (1 + state.p * 2)).toFixed(2)}deg)`;
      const o = z > 640 ? Math.max(0, 1 - (z - 640) / 260) : 1;
      pg.el.style.opacity = o.toFixed(3);
      pg.el.style.visibility = o === 0 ? 'hidden' : '';
    }
  };
  const tick = (_: number, dt: number) => {
    time += dt / 1000;
    render();
  };
  let ticking = false;
  const run = (on: boolean) => {
    if (on === ticking) return;
    ticking = on;
    on ? gsap.ticker.add(tick) : gsap.ticker.remove(tick);
  };

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: stage,
      start: 'top top',
      end: '+=165%',
      pin: true,
      scrub: 0.5,
      onToggle: (self) => run(self.isActive),
    },
  });
  tl.to(state, { p: 1, ease: 'power1.in', duration: 1 }, 0)
    // The definition slides over the last ~60% of this pin. The title only
    // dims (never to nothing) so no empty band shows above the sheet's edge.
    .to(titlepage, { opacity: 0.22, y: () => -innerHeight * 0.16, scale: 0.96, ease: 'power2.in', duration: 0.5 }, 0.3)
    .to(fades, { opacity: 0.22, duration: 0.2 }, 0.3);
  run(true);

  // The desk leans a little toward the pointer.
  let offPointer: Off = () => {};
  if (fine()) {
    const ry = gsap.quickTo(storm, 'rotationY', { duration: 1.4, ease: 'power3.out' });
    const rx = gsap.quickTo(storm, 'rotationX', { duration: 1.4, ease: 'power3.out' });
    const move = (e: PointerEvent) => {
      ry((e.clientX / innerWidth - 0.5) * 7);
      rx(-(e.clientY / innerHeight - 0.5) * 5);
    };
    addEventListener('pointermove', move, { passive: true });
    offPointer = () => removeEventListener('pointermove', move);
  }

  return () => {
    home.classList.remove('is-staged');
    run(false);
    offPointer();
    pages.forEach((pg) => {
      pg.el.style.transform = '';
      pg.el.style.opacity = '';
      pg.el.style.visibility = '';
    });
  };
}

// ── Definition: the sentence inks in, the terms get underlined ─────────────
function definitionScene(home: HTMLElement): Off {
  const stage = $('[data-def-stage]', home)!;
  const def = $('[data-def]', stage)!;
  const split = SplitText.create(def, { type: 'words', wordsClass: 'w', tag: 'span' });
  const words = split.words as HTMLElement[];
  const terms = $$('[data-term]', def);
  const rows = $$('[data-tally]', stage);

  gsap.set(words, { opacity: 0.13 });
  const tl = gsap.timeline({
    scrollTrigger: { trigger: stage, start: 'top top', end: '+=150%', pin: true, scrub: 0.5 },
  });
  tl.to(words, { opacity: 1, ease: 'none', duration: 1, stagger: 1 });
  // Hold the finished sentence: the next sheet starts sliding over the
  // paragraph about 60% into this pin, so the ink must be done before that.
  tl.to({}, { duration: words.length * 1.4 });

  const total = tl.duration();
  const at = terms.map((term) => (words.findIndex((w) => term.contains(w)) + 1) / total);
  tl.eventCallback('onUpdate', () => {
    const p = tl.progress();
    terms.forEach((term, i) => {
      const on = p >= at[i];
      term.classList.toggle('is-on', on);
      rows.find((r) => r.dataset.tally === term.dataset.term)?.classList.toggle('is-on', on);
    });
  });

  return () => {
    split.revert();
    terms.forEach((t) => t.classList.remove('is-on'));
    rows.forEach((r) => r.classList.remove('is-on'));
  };
}

// ── Lemma: the departments, sideways ────────────────────────────────────────
function departments(home: HTMLElement): Off {
  const stage = $('[data-rail-stage]', home)!;
  const track = $('[data-track]', stage)!;
  const axis = $('[data-axis]', stage)!;
  const label = $('[data-marker-label]', axis)!;
  const plates = $$('.plates > li', track);
  track.scrollLeft = 0;
  track.classList.add('is-driven');
  axis.classList.add('is-driven');

  const dist = () => Math.max(0, track.scrollWidth - innerWidth);
  const tween = gsap.to(track, {
    x: () => -dist(),
    ease: 'none',
    scrollTrigger: {
      trigger: stage,
      start: 'top top',
      // The rail moves about 2.4x faster than the page scrolls: a long row, a short pin.
      end: () => `+=${dist() * RAIL_SCROLL}`,
      pin: true,
      scrub: 0.6,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        axis.style.setProperty('--p', self.progress.toFixed(4));
        label.textContent = String(Math.min(plates.length, 1 + Math.floor(self.progress * plates.length))).padStart(2, '0');
      },
    },
  });

  // Numerals drift against the rail, so the plates read as layered.
  plates.forEach((li) => {
    const rank = $('[data-rank]', li);
    if (!rank) return;
    gsap.fromTo(
      rank,
      { xPercent: 22 },
      { xPercent: -22, ease: 'none', scrollTrigger: { trigger: li, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } },
    );
  });

  return () => {
    track.classList.remove('is-driven');
    axis.classList.remove('is-driven');
  };
}

// ── Q.E.D.: the tombstone fills ────────────────────────────────────────────
function qed(home: HTMLElement): Off {
  const tomb = $('[data-tomb]', home);
  const fill = $('[data-tomb-fill]', home);
  if (!tomb || !fill) return () => {};
  gsap.fromTo(fill, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: tomb, start: 'top 92%', end: 'bottom 50%', scrub: true } });
  return () => {};
}

// ── Running margin: section label and page count ──────────────────────────
function margin(home: HTMLElement): Off {
  const aside = $('.margin', home);
  const label = $('[data-margin-label]', home);
  const page = $('[data-margin-page]', home);
  const fill = $('[data-margin-fill]', home);
  if (!aside || !label || !page || !fill) return () => {};
  const scenes = $$('[data-scene]', home);
  // Numbers follow the headings on the page: Definition 1, Lemma 2, Theorem 3.
  // The title sheet is 0 and the tombstone closes the proof.
  const last = scenes.length - 1;
  const steps = last - 1;
  scenes.forEach((sc, i) =>
    ScrollTrigger.create({
      trigger: sc,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => {
        if (!self.isActive) return;
        label.textContent = `§ ${i === last ? '∎' : i} · ${sc.dataset.label}`;
        page.textContent = `${Math.min(i, steps)} / ${steps}`;
      },
    }),
  );
  // The footer is not part of the proof: the running margin leaves with the page.
  ScrollTrigger.create({
    trigger: home,
    start: 'top top',
    end: 'bottom 45%',
    onLeave: () => aside.classList.add('is-off'),
    onEnterBack: () => aside.classList.remove('is-off'),
  });
  ScrollTrigger.create({
    trigger: home,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => fill.style.setProperty('--p', self.progress.toFixed(3)),
  });
  return () => aside.classList.remove('is-off');
}

// ── Library: client-rendered, so the page height changes after load ────────
// The grid arrives from /docs-index.json, and grows with "Show more" and with
// every filter. Pins and the progress bar below/around it need fresh
// measurements each time (Lenis follows the document height by itself).
function watchLibrary(home: HTMLElement): Off {
  const lib = $('[data-library]', home);
  if (!lib || !('ResizeObserver' in window)) return () => {};
  let timer = 0;
  let last = home.offsetHeight;
  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (Math.abs(home.offsetHeight - last) < 1) return;
      last = home.offsetHeight;
      ScrollTrigger.refresh();
    }, 120);
  });
  ro.observe(lib);
  return () => {
    clearTimeout(timer);
    ro.disconnect();
  };
}
