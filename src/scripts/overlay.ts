// Shared helpers for the two modal surfaces (mobile menu, library filter sheet):
// a reference-counted scroll lock and a focus trap that makes the rest of the
// page inert while a surface is open.

type LockListener = (locked: boolean) => void;

const holders = new Set<string>();
const listeners = new Set<LockListener>();

export function isLocked() {
  return holders.size > 0;
}

/** Called whenever the page becomes locked or unlocked (e.g. to stop Lenis). */
export function onLockChange(fn: LockListener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function lockScroll(id: string) {
  holders.add(id);
  sync();
}

export function unlockScroll(id: string) {
  holders.delete(id);
  sync();
}

function sync() {
  const locked = holders.size > 0;
  document.documentElement.classList.toggle('menu-open', locked);
  listeners.forEach((fn) => fn(locked));
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );
}

interface TrapOptions {
  /** Element that receives focus first (default: first focusable in the container). */
  initial?: HTMLElement | null;
  /** Elements outside the container that stay interactive. */
  keep?: Element[];
  /** Called when the user presses Escape. */
  onEscape: () => void;
}

/**
 * Makes everything outside `container` inert, moves focus in, keeps Tab inside
 * and reports Escape. Returns a function that undoes all of it (it does not
 * move focus; the caller restores it).
 */
export function trapFocus(container: HTMLElement, opts: TrapOptions): () => void {
  const inerted: HTMLElement[] = [];
  const keep = opts.keep ?? [];
  for (let el: HTMLElement | null = container; el && el !== document.body; el = el.parentElement) {
    const parent: HTMLElement | null = el.parentElement;
    if (!parent) break;
    for (const sib of parent.children) {
      if (sib === el || !(sib instanceof HTMLElement)) continue;
      if (/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(sib.tagName) || sib.classList.contains('cursor')) continue;
      if (sib.tagName.toLowerCase() === 'astro-route-announcer') continue;
      if (keep.some((k) => sib === k || sib.contains(k))) continue;
      if (!sib.inert) {
        sib.inert = true;
        inerted.push(sib);
      }
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      opts.onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables(container);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (!active || !container.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKey);

  const target = opts.initial ?? focusables(container)[0];
  target?.focus({ preventScroll: true });

  return () => {
    document.removeEventListener('keydown', onKey);
    inerted.forEach((el) => (el.inert = false));
  };
}
