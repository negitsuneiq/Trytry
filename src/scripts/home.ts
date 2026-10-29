// Home page choreography. The page reads like a paper (title, definition,
// lemma, proof, theorem, Q.E.D.) and the scroll turns its pages: the title
// scene dollies through a desk of real first pages, the definition inks in
// word by word, the departments run sideways, the proof's ribbons draw
// themselves and the tombstone fills. Built inside gsap.matchMedia, so
// reduced motion gets the static layout and every resize rebuilds cleanly.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

type Off = () => void;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

export function initHome(): Off | null {
  const home = $('[data-home]');
  if (!home) return null;

  const mm = gsap.matchMedia();
  mm.add(
    {
      motion: '(prefers-reduced-motion: no-preference)',
      reduce: '(prefers-reduced-motion: reduce)',
      wide: '(min-width: 760px)',
    },
    (ctx) => {
      const { reduce, wide } = ctx.conditions as Record<string, boolean>;
      if (reduce) return staticState(home);
      const offs = [titleScene(home), definitionScene(home), departments(home), flow(home, wide), shelf(home), qed(home), margin(home)];
      return () => offs.forEach((o) => o());
    },
  );

  const offs = [flowFocus(home), shelfPreview(home)];
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
    .to(titlepage, { opacity: 0, y: -90, scale: 0.94, ease: 'power2.in', duration: 0.32 }, 0)
    .to(fades, { opacity: 0, duration: 0.12 }, 0);
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
  tl.to({}, { duration: words.length * 0.18 }); // hold the finished sentence

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
      end: () => `+=${dist() * 0.8}`,
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

// ── Proof: the ink panel opens and the ribbons draw ────────────────────────
function flow(home: HTMLElement, wide: boolean): Off {
  const stage = $('[data-flow-stage]', home)!;
  const panel = $('[data-flow-panel]', stage)!;
  gsap.fromTo(
    panel,
    { clipPath: 'inset(6% 4% 0% 4% round 32px)' },
    { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: stage, start: 'top bottom', end: 'top top', scrub: true } },
  );
  const clip = $<SVGRectElement>('[data-flow-clip]', stage);
  if (!wide || !clip) return () => gsap.set(panel, { clearProps: 'clipPath' });

  const tl = gsap.timeline({ scrollTrigger: { trigger: stage, start: 'top top', end: '+=100%', pin: true, scrub: 0.6 } });
  tl.from($$('.node.src', stage), { opacity: 0, x: 14, stagger: 0.03, duration: 0.25 }, 0)
    .fromTo(clip, { attr: { width: 300 } }, { attr: { width: 1000 }, ease: 'power1.inOut', duration: 1 }, 0.15)
    .from($$('.node.tgt', stage), { opacity: 0, x: -14, stagger: 0.03, duration: 0.25 }, 0.75);
  return () => gsap.set(panel, { clearProps: 'clipPath' });
}

function flowFocus(home: HTMLElement): Off {
  const svg = $<SVGSVGElement>('[data-flow]', home);
  if (!svg) return () => {};
  const ribs = $$<SVGPathElement>('.rib', svg);
  const nodes = $$<SVGAElement>('[data-node]', svg);
  const focus = (key?: string, side?: string) => {
    svg.classList.toggle('has-focus', !!key);
    const linked = new Set<string>();
    for (const r of ribs) {
      const on = !!key && (side === 's' ? r.dataset.s === key : r.dataset.t === key);
      r.classList.toggle('on', on);
      if (on) linked.add(r.dataset.s!).add(r.dataset.t!);
    }
    for (const n of nodes) n.classList.toggle('on', linked.has(n.dataset.node!));
  };
  const over = (e: Event) => {
    const n = (e.target as Element).closest<SVGAElement>('[data-node]');
    focus(n?.dataset.node, n?.dataset.side);
  };
  const out = () => focus();
  svg.addEventListener('pointerover', over);
  svg.addEventListener('pointerleave', out);
  svg.addEventListener('focusin', over);
  svg.addEventListener('focusout', out);
  return () => {
    svg.removeEventListener('pointerover', over);
    svg.removeEventListener('pointerleave', out);
    svg.removeEventListener('focusin', over);
    svg.removeEventListener('focusout', out);
  };
}

// ── Theorem: books rise onto the shelf ─────────────────────────────────────
function shelf(home: HTMLElement): Off {
  const box = $('[data-shelf]', home);
  if (!box) return () => {};
  gsap.from($$('.spines li', box), {
    yPercent: 104,
    ease: 'power3.out',
    stagger: 0.07,
    scrollTrigger: { trigger: box, start: 'top 85%', end: 'top 35%', scrub: 0.8 },
  });
  return () => {};
}

function shelfPreview(home: HTMLElement): Off {
  const spines = $$<HTMLAnchorElement>('[data-book]', home);
  const cards = $$('[data-card]', home);
  if (!spines.length) return () => {};
  const show = (i: string) => {
    cards.forEach((c) => (c.hidden = c.dataset.card !== i));
    spines.forEach((s) => s.classList.toggle('is-pulled', s.dataset.book === i));
  };
  const pick = (e: Event) => show((e.currentTarget as HTMLElement).dataset.book!);
  spines.forEach((s) => {
    s.addEventListener('pointerenter', pick);
    s.addEventListener('focus', pick);
  });
  show('0');
  return () =>
    spines.forEach((s) => {
      s.removeEventListener('pointerenter', pick);
      s.removeEventListener('focus', pick);
    });
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
  scenes.forEach((sc, i) =>
    ScrollTrigger.create({
      trigger: sc,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => {
        if (!self.isActive) return;
        label.textContent = `§ ${i + 1} · ${sc.dataset.label}`;
        page.textContent = `${i + 1} / ${scenes.length}`;
        aside.toggleAttribute('data-ink', sc.dataset.scene === 'topics');
      },
    }),
  );
  ScrollTrigger.create({
    trigger: home,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => fill.style.setProperty('--p', self.progress.toFixed(3)),
  });
  return () => aside.removeAttribute('data-ink');
}
