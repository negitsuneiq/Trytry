// Deterministic generative covers for documents without a PDF preview.
// Each topic has a motif; the document id seeds its parameters, so a cover is
// stable across builds and unique per document.

import type { Topic } from './topics';

const W = 300;
const H = 400;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);
const path = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
// Stroke styles live in global.css (.gs / .ga) to keep inline SVG small.
const S = 'class="gs"';
const A = 'class="ga"';
/** Many straight segments as a single path element. */
const segs = (ls: [number, number, number, number][], attrs: string) =>
  ls.length ? `<path ${attrs} d="${ls.map(([a, b, c, d]) => `M${f(a)} ${f(b)}L${f(c)} ${f(d)}`).join('')}"/>` : '';
/** Many dots as one path of zero-length round-capped segments. */
const dots = (pts: [number, number][], cls: 'gd' | 'gda', opacity = 1) =>
  pts.length ? `<path class="${cls}" stroke-opacity="${opacity}" d="${pts.map(([x, y]) => `M${f(x)} ${f(y)}h0`).join('')}"/>` : '';

type Motif = Topic['motif'];
type Gen = (r: () => number) => string;

const cx = W / 2;
const cy = H / 2 - 20;

const motifs: Record<Motif, Gen> = {
  curve(r) {
    // Partial Fourier sums of a square wave.
    const terms = 3 + Math.floor(r() * 5);
    let out = '';
    for (let k = 1; k <= terms; k++) {
      const pts: [number, number][] = [];
      for (let x = 20; x <= W - 20; x += 4) {
        const t = ((x - 20) / (W - 40)) * Math.PI * 4;
        let y = 0;
        for (let n = 1; n <= k * 2; n += 2) y += Math.sin(n * t) / n;
        pts.push([x, cy - y * 70]);
      }
      out += `<path d="${path(pts)}" ${k === terms ? A : S} stroke-opacity="${k === terms ? 1 : 0.18 + k * 0.05}"/>`;
    }
    return out;
  },
  spectrum(r) {
    const n = 28 + Math.floor(r() * 20);
    const lit: [number, number, number, number][] = [];
    const rest: [number, number, number, number][] = [[20, cy + 80, W - 20, cy + 80]];
    for (let i = 0; i < n; i++) {
      const x = 24 + (i / (n - 1)) * (W - 48);
      const h = 20 + Math.abs(Math.sin(i * 0.7 + r() * 0.5)) * 160 * Math.exp(-i / n);
      (i % 7 === 0 ? lit : rest).push([x, cy + 80, x, cy + 80 - h]);
    }
    return segs(rest, `${S} stroke-opacity=".45"`) + segs(lit, A);
  },
  lattice(r) {
    // Hasse diagram of a boolean lattice B3 or B4.
    const n = r() > 0.5 ? 4 : 3;
    const levels: number[][] = Array.from({ length: n + 1 }, () => []);
    for (let m = 0; m < 1 << n; m++) levels[popcount(m)].push(m);
    const pos = new Map<number, [number, number]>();
    levels.forEach((lv, k) =>
      lv.forEach((m, i) => pos.set(m, [cx + (i - (lv.length - 1) / 2) * (200 / Math.max(lv.length, 2)), cy + 120 - k * (240 / n)])),
    );
    const edges: [number, number, number, number][] = [];
    for (let m = 0; m < 1 << n; m++)
      for (let b = 0; b < n; b++)
        if (!(m & (1 << b))) edges.push([...pos.get(m)!, ...pos.get(m | (1 << b))!]);
    let out = segs(edges, `${S} stroke-opacity=".35"`);
    const hi = Math.floor(r() * (1 << n));
    for (const [m, [x, y]] of pos) out += `<circle cx="${f(x)}" cy="${f(y)}" r="${m === hi ? 5 : 3}" fill="${m === hi ? 'var(--accent)' : 'var(--fg)'}"/>`;
    return out;
  },
  spiral(r) {
    // Sacks-style spiral: integers on a Fermat spiral, primes highlighted.
    const N = 420;
    const rot = r() * Math.PI * 2;
    const primes: [number, number][] = [];
    const rest: [number, number][] = [];
    for (let n = 1; n < N; n++) {
      const a = n * 2.39996 + rot;
      const d = Math.sqrt(n) * 6.2;
      (isPrime(n) ? primes : rest).push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
    }
    return dots(rest, 'gd', 0.3) + dots(primes, 'gda');
  },
  contour(r) {
    // Real points of an elliptic curve y² = x³ + ax + b over level sets.
    const a = -1 - r() * 2;
    const b = 0.2 + r() * 1.2;
    let out = '';
    for (let k = 1; k <= 7; k++) {
      out += `<ellipse cx="${cx}" cy="${cy}" rx="${f(k * 18)}" ry="${f(k * 13)}" ${S} stroke-opacity="${0.08 + k * 0.03}" transform="rotate(${f(-20 + r() * 4)} ${cx} ${cy})"/>`;
    }
    const top: [number, number][] = [];
    const bot: [number, number][] = [];
    for (let x = -2.5; x <= 2.6; x += 0.01) {
      const v = x ** 3 + a * x + b;
      if (v < 0) {
        if (top.length) {
          out += `<path d="${path(top)}" ${A}/><path d="${path(bot)}" ${A}/>`;
          top.length = bot.length = 0;
        }
        continue;
      }
      const y = Math.sqrt(v);
      top.push([cx + x * 50, cy - y * 50]);
      bot.push([cx + x * 50, cy + y * 50]);
    }
    if (top.length) out += `<path d="${path(top)}" ${A}/><path d="${path(bot)}" ${A}/>`;
    return out;
  },
  polygon(r) {
    const sides = 3 + Math.floor(r() * 5);
    let out = '';
    for (let k = 0; k < 14; k++) {
      const R = 120 * Math.pow(0.88, k);
      const rot = k * (0.18 + r() * 0.02);
      const pts: [number, number][] = [];
      for (let i = 0; i <= sides; i++) {
        const t = rot + (i / sides) * Math.PI * 2 - Math.PI / 2;
        pts.push([cx + Math.cos(t) * R, cy + Math.sin(t) * R]);
      }
      out += `<path d="${path(pts)}" ${k === 0 ? A : S} stroke-opacity="${k === 0 ? 1 : 0.55 - k * 0.03}"/>`;
    }
    return out;
  },
  knot(r) {
    // (p, q) torus knot projected to the plane.
    const choices: [number, number][] = [[2, 3], [2, 5], [3, 4], [3, 5], [2, 7], [3, 7]];
    const [p, q] = choices[Math.floor(r() * choices.length)];
    const pts: [number, number][] = [];
    for (let i = 0; i <= 600; i++) {
      const t = (i / 600) * Math.PI * 2;
      const rr = 70 + 40 * Math.cos(q * t);
      pts.push([cx + rr * Math.cos(p * t), cy + rr * Math.sin(p * t)]);
    }
    return `<path d="${path(pts)}" ${A} stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="110" ${S} stroke-opacity=".12"/>`;
  },
  graph(r) {
    const n = 9 + Math.floor(r() * 6);
    const pts: [number, number][] = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2 - Math.PI / 2;
      return [cx + Math.cos(t) * 110, cy + Math.sin(t) * 110];
    });
    const edges: [number, number, number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (r() < 0.28) edges.push([...pts[i], ...pts[j]]);
    let out = segs(edges, `${S} stroke-opacity=".3"`);
    // A highlighted Hamiltonian-looking cycle on the hull.
    out += `<path d="${path([...pts, pts[0]])}" ${A} stroke-opacity=".9"/>`;
    for (const [x, y] of pts) out += `<circle cx="${f(x)}" cy="${f(y)}" r="3.5" fill="var(--bg)" stroke="var(--fg)"/>`;
    return out;
  },
  tree(r) {
    let out = '';
    const depth = 5;
    const walk = (x: number, y: number, d: number, spread: number, lit: boolean) => {
      if (d === depth) {
        out += `<circle cx="${f(x)}" cy="${f(y)}" r="2" fill="${lit ? 'var(--accent)' : 'var(--fg)'}"/>`;
        return;
      }
      const go = r() > 0.5;
      for (const s of [-1, 1]) {
        const nx = x + s * spread;
        const ny = y + 52;
        const onPath = lit && (s === 1) === go;
        out += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(nx)}" y2="${f(ny)}" ${onPath ? A : S} stroke-opacity="${onPath ? 1 : 0.35}"/>`;
        walk(nx, ny, d + 1, spread / 2, onPath);
      }
    };
    walk(cx, 60, 0, 72, true);
    return out;
  },
  walk(r) {
    let out = '';
    for (let k = 0; k < 6; k++) {
      let y = cy;
      const pts: [number, number][] = [];
      for (let x = 20; x <= W - 20; x += 3) {
        y += (r() - 0.5) * 12;
        pts.push([x, y]);
      }
      out += `<path d="${path(pts)}" ${k === 0 ? A : S} stroke-opacity="${k === 0 ? 1 : 0.3}"/>`;
    }
    return out + `<line x1="20" x2="${W - 20}" y1="${cy}" y2="${cy}" ${S} stroke-opacity=".2" stroke-dasharray="2 4"/>`;
  },
  bars(r) {
    const mu = cx + (r() - 0.5) * 40;
    const sd = 40 + r() * 16;
    let d = '';
    const pts: [number, number][] = [];
    for (let x = 24; x < W - 24; x += 12) {
      const h = Math.exp(-(((x + 6 - mu) / sd) ** 2) / 2) * 180 * (0.82 + r() * 0.3);
      d += `M${x} ${f(cy + 90)}v${f(-h)}h10v${f(h)}`;
    }
    const out = `<path d="${d}" ${S} stroke-opacity=".4"/>`;
    for (let x = 20; x <= W - 20; x += 2) pts.push([x, cy + 90 - Math.exp(-(((x - mu) / sd) ** 2) / 2) * 180]);
    return out + `<path d="${path(pts)}" ${A} stroke-width="1.4"/>`;
  },
  flow(r) {
    // Direction field of a linear system with a highlighted trajectory.
    const a = -0.4 + r() * 0.3;
    const b = 1;
    const c = -1;
    const d = -0.2 + r() * 0.3;
    const field: [number, number, number, number][] = [];
    for (let gx = 30; gx <= W - 30; gx += 22)
      for (let gy = 50; gy <= H - 90; gy += 22) {
        const x = (gx - cx) / 60;
        const y = (gy - cy) / 60;
        const u = a * x + b * y;
        const v = c * x + d * y;
        const m = Math.hypot(u, v) || 1;
        field.push([gx, gy, gx + (u / m) * 9, gy + (v / m) * 9]);
      }
    const out = segs(field, `${S} stroke-opacity=".35"`);
    let x = 1.8;
    let y = 0;
    const pts: [number, number][] = [];
    for (let i = 0; i < 1400; i++) {
      if (i % 4 === 0) pts.push([cx + x * 60, cy + y * 60]);
      const u = a * x + b * y;
      const v = c * x + d * y;
      x += u * 0.01;
      y += v * 0.01;
    }
    return out + `<path d="${path(pts)}" ${A} stroke-width="1.4"/>`;
  },
  orbit(r) {
    // Chirikov standard map, a few orbits.
    const K = 0.6 + r() * 0.9;
    const lit: [number, number][] = [];
    const rest: [number, number][] = [];
    const TAU = Math.PI * 2;
    for (let o = 0; o < 8; o++) {
      let p = r() * TAU;
      let q = r() * TAU;
      for (let i = 0; i < 110; i++) {
        p = (p + K * Math.sin(q)) % TAU;
        q = (q + p) % TAU;
        const x = 30 + (((q + TAU) % TAU) / TAU) * (W - 60);
        const y = 50 + (((p + TAU) % TAU) / TAU) * (H - 140);
        (o === 0 ? lit : rest).push([x, y]);
      }
    }
    return dots(rest, 'gd', 0.4) + dots(lit, 'gda');
  },
  grid(r) {
    // A jittered triangulated mesh.
    const cols = 8;
    const rows = 10;
    const P: [number, number][][] = [];
    for (let i = 0; i <= rows; i++) {
      P.push([]);
      for (let j = 0; j <= cols; j++) {
        const edge = i === 0 || j === 0 || i === rows || j === cols;
        P[i].push([30 + (j / cols) * (W - 60) + (edge ? 0 : (r() - 0.5) * 16), 40 + (i / rows) * (H - 120) + (edge ? 0 : (r() - 0.5) * 16)]);
      }
    }
    let mesh = '';
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const [a, b, c, d] = [P[i][j], P[i][j + 1], P[i + 1][j], P[i + 1][j + 1]];
        mesh += `${path([a, b, d, c, a])}M${f(a[0])} ${f(a[1])}L${f(d[0])} ${f(d[1])}`;
      }
    const out = `<path d="${mesh}" ${S} stroke-opacity=".28"/>`;
    const ri = 2 + Math.floor(r() * (rows - 4));
    const rj = 2 + Math.floor(r() * (cols - 4));
    const [a, b, d] = [P[ri][rj], P[ri][rj + 1], P[ri + 1][rj + 1]];
    return out + `<path d="${path([a, b, d, a])}" stroke="var(--accent)" fill="var(--accent)" fill-opacity=".25"/>`;
  },
  wave(r) {
    // Interference of two point sources.
    const s1: [number, number] = [cx - 50 - r() * 20, cy];
    const s2: [number, number] = [cx + 50 + r() * 20, cy];
    let out = '';
    for (let k = 1; k < 12; k++) {
      out += `<circle cx="${f(s1[0])}" cy="${f(s1[1])}" r="${k * 16}" ${S} stroke-opacity="${0.4 - k * 0.025}"/>`;
      out += `<circle cx="${f(s2[0])}" cy="${f(s2[1])}" r="${k * 16}" ${k === 6 ? A : S} stroke-opacity="${k === 6 ? 1 : 0.4 - k * 0.025}"/>`;
    }
    return out;
  },
  rose(r) {
    const k = [2, 3, 4, 5, 7][Math.floor(r() * 5)];
    const d = r() > 0.5 ? 1 : 3;
    let out = '';
    for (let layer = 0; layer < 3; layer++) {
      const pts: [number, number][] = [];
      const R = 120 - layer * 30;
      for (let i = 0; i <= 700; i++) {
        const t = (i / 700) * Math.PI * 2 * d;
        const rr = R * Math.cos((k / d) * t);
        pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
      }
      out += `<path d="${path(pts)}" ${layer === 0 ? A : S} stroke-opacity="${layer === 0 ? 1 : 0.3}"/>`;
    }
    return out;
  },
};

function popcount(n: number) {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

function isPrime(n: number) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

/** Inner SVG markup for a cover; the caller supplies the <svg> wrapper. */
export function coverSvg(id: string, motif: Motif): string {
  const r = rng(hash(id + motif));
  // Axis ticks frame every cover, echoing graph paper.
  const ticks: [number, number, number, number][] = [[20, H - 40, W - 20, H - 40]];
  for (let x = 20; x <= W - 20; x += 20) ticks.push([x, H - 40, x, H - (x % 100 === 20 ? 48 : 44)]);
  const frame = segs(ticks, `${S} stroke-opacity=".3"`);
  return frame + motifs[motif](r);
}

export const COVER_VIEWBOX = `0 0 ${W} ${H}`;
