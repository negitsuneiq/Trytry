// Client-side card rendering. Produces exactly the markup of
// components/DocCard.astro (styles are global under .doc-card), from the shared
// /docs-index.json and the localised labels in #card-cfg.

import '../styles/card.css';
import type { CardCfg, CardRec } from '../lib/cardRec';
import { coverHtml, uniShort } from '../lib/cover';
import { authorsLine, realYear } from '../lib/format';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);

export function readCfg(): CardCfg {
  return JSON.parse(document.getElementById('card-cfg')!.textContent!) as CardCfg;
}

let indexPromise: Promise<CardRec[]> | null = null;

/** Fetches the shared index once per page session; a failure can be retried. */
export function loadIndex(cfg: CardCfg): Promise<CardRec[]> {
  indexPromise ??= fetch(cfg.index)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<CardRec[]>;
    })
    .catch((e) => {
      indexPromise = null;
      throw e;
    });
  return indexPromise;
}

export function cardHtml(r: CardRec, cfg: CardCfg, heading: 'h2' | 'h3' = 'h3'): string {
  const uni = cfg.unis[r.u]?.[0] ?? r.u;
  const cover = r.th
    ? `<img src="${cfg.thumbs}/${esc(r.i)}.webp" alt="" width="600" height="800" loading="lazy" decoding="async">${r.cc ? `<span class="code mono" aria-hidden="true">${esc(r.cc)}</span>` : ''}`
    : coverHtml({ id: r.i, label: r.cc ?? uniShort(r.u, uni), title: r.s ?? r.t, authors: r.a });
  const lvl = cfg.levels[r.l] + (realYear(r.y, r.d) ? ` · ${realYear(r.y, r.d)}` : '');
  const full = r.s ? ` title="${esc(r.t)}"` : '';
  const url = `${cfg.doc}${esc(r.i)}/`;
  return (
    `<article class="card doc-card"><a href="${url}" class="hit hit-cover" tabindex="-1" aria-hidden="true">` +
    `<div class="cover" data-kind="${r.th ? 'thumb' : 'type'}">${cover}</div></a>` +
    (r.k && r.c ? `<p class="mono course"><a href="${cfg.course}${esc(r.k)}/"><span class="v" lang="en">${esc(r.c)}</span></a></p>` : '') +
    `<a href="${url}" class="hit hit-body"><div class="body">` +
    `<${heading} class="title"${full}>${r.x ?? esc(r.s ?? r.t)}</${heading}>` +
    (r.a?.length ? `<p class="authors">${esc(authorsLine(r.a))}</p>` : '') +
    `<p class="mono meta"><span lang="en">${esc(uni)}</span><span aria-hidden="true">·</span><span>${esc(cfg.types[r.ty])}</span></p>` +
    `<p class="topics mono">${esc(r.p.map((tp) => cfg.topics[tp]?.[cfg.lang === 'tr' ? 1 : 0] ?? tp).join(' / '))}</p></div></a>` +
    `<div class="foot"><span class="badges"><span class="chip${r.h ? ' chip-accent' : ''}"><span class="dot" aria-hidden="true"></span>${esc(r.h ? cfg.hosted : cfg.external)}</span>` +
    `<span class="chip">${esc(cfg.licenses[r.li] ?? r.li)}</span></span><span class="mono lvl">${esc(lvl)}</span></div></article>`
  );
}

/** Appends cards built from `recs` to `grid`; `wrap` puts each in a <div> (topic/university grids). */
export function appendCards(grid: HTMLElement, recs: CardRec[], cfg: CardCfg, heading: 'h2' | 'h3', wrap = false): HTMLElement | undefined {
  const tpl = document.createElement('template');
  tpl.innerHTML = recs.map((r) => (wrap ? `<div>${cardHtml(r, cfg, heading)}</div>` : cardHtml(r, cfg, heading))).join('');
  const first = tpl.content.firstElementChild as HTMLElement | null;
  grid.append(tpl.content);
  return first ?? undefined;
}
