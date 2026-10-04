// Browsing pages: chapter list, chapter detail, operator list, operator detail.

import { chapterLabel, episodeMap, getIndex, getOperators } from './data';
import type { EpisodeRef } from './types';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function tagClass(tag: string) {
  return tag.startsWith('Before') ? 'before' : tag.startsWith('After') ? 'after' : 'interlude';
}

function episodeRow(e: EpisodeRef, href: string, extra = '') {
  return `<li class="ep-row">
    <a href="${href}">
      <span class="ep-code">${esc(e.code)}</span>
      <span class="ep-name">${esc(e.name)}</span>
      ${e.tag ? `<span class="pill ${tagClass(e.tag)}">${esc(e.tag)}</span>` : ''}
      ${extra}
    </a>
    ${e.synopsis ? `<p class="synopsis">${esc(e.synopsis)}</p>` : ''}
  </li>`;
}

export async function renderChapters(app: HTMLElement) {
  const idx = await getIndex();
  app.innerHTML = `<section class="page">
    <h1>Main Story</h1>
    <ol class="card-list">
      ${idx.chapters
        .map(
          (ch) => `<li><a class="card" href="#/chapter/${ch.id}">
            <span class="card-kicker">${chapterLabel(ch)}</span>
            <span class="card-title">${esc(ch.name)}</span>
            <span class="card-meta">${ch.episodes.length} scenes</span>
          </a></li>`,
        )
        .join('')}
    </ol>
    <p class="fineprint">Game data ${esc(idx.dataVersion)}, built ${new Date(idx.builtAt).toLocaleDateString()}</p>
  </section>`;
}

export async function renderChapter(app: HTMLElement, id: string) {
  const idx = await getIndex();
  const ch = idx.chapters.find((c) => c.id === id);
  if (!ch) return notFound(app);
  app.innerHTML = `<section class="page">
    <a class="back" href="#/">← Chapters</a>
    <p class="kicker">${chapterLabel(ch)}</p>
    <h1>${esc(ch.name)}</h1>
    <a class="btn primary" href="#/read/${ch.episodes[0].id}">Start reading</a>
    <ol class="ep-list">${ch.episodes.map((e) => episodeRow(e, `#/read/${e.id}`)).join('')}</ol>
  </section>`;
}

export async function renderOperators(app: HTMLElement) {
  const ops = await getOperators();
  app.innerHTML = `<section class="page">
    <h1>Operators</h1>
    <p class="lede">Pick an operator to read every scene they speak in, appear in, or are mentioned in.</p>
    <input id="op-filter" class="search" type="search" placeholder="Filter operators" autocomplete="off" />
    <ul class="op-grid">
      ${ops
        .map(
          (o) => `<li data-name="${esc(o.name.toLowerCase())}"><a href="#/operator/${o.id}">
            <span class="op-name">${esc(o.name)}</span>
            <span class="op-count">${o.episodes.length}</span>
          </a></li>`,
        )
        .join('')}
    </ul>
  </section>`;
  const input = app.querySelector<HTMLInputElement>('#op-filter')!;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    app.querySelectorAll<HTMLElement>('.op-grid li').forEach((li) => {
      li.hidden = !!q && !li.dataset.name!.includes(q);
    });
  });
  input.focus();
}

export async function renderOperator(app: HTMLElement, id: string) {
  const [ops, eps] = await Promise.all([getOperators(), episodeMap()]);
  const op = ops.find((o) => o.id === id);
  if (!op) return notFound(app);
  const ctx = `?ctx=op:${op.id}`;
  const speaking = op.episodes.filter((h) => h.lines > 0).length;

  const draw = (onlySpeaking: boolean) => {
    const hits = op.episodes.filter((h) => !onlySpeaking || h.lines > 0);
    const groups = new Map<string, typeof hits>();
    for (const h of hits) {
      const ch = eps.get(h.id)!.chapter.id;
      if (!groups.has(ch)) groups.set(ch, []);
      groups.get(ch)!.push(h);
    }
    return [...groups]
      .map(([, hs]) => {
        const ch = eps.get(hs[0].id)!.chapter;
        return `<h2 class="group-head"><span class="kicker">${chapterLabel(ch)}</span> ${esc(ch.name)}</h2>
          <ol class="ep-list">${hs
            .map((h) => {
              const badges = [
                h.lines ? `<span class="badge speak">${h.lines} line${h.lines > 1 ? 's' : ''}</span>` : '',
                h.mentions ? `<span class="badge">named ${h.mentions}×</span>` : '',
                h.onScreen && !h.lines ? `<span class="badge">on screen</span>` : '',
              ].join('');
              return episodeRow(eps.get(h.id)!, `#/read/${h.id}${ctx}`, `<span class="badges">${badges}</span>`);
            })
            .join('')}</ol>`;
      })
      .join('');
  };

  app.innerHTML = `<section class="page">
    <a class="back" href="#/operators">← Operators</a>
    <h1>${esc(op.name)}</h1>
    <p class="lede">${op.episodes.length} scenes in the main story, speaking in ${speaking}.</p>
    <div class="row">
      <a class="btn primary" href="#/read/${op.episodes[0].id}${ctx}">Read all in order</a>
      <label class="check"><input type="checkbox" id="only-speaking" /> Only scenes where ${esc(op.name)} speaks</label>
    </div>
    <div id="op-eps">${draw(false)}</div>
  </section>`;
  app.querySelector<HTMLInputElement>('#only-speaking')!.addEventListener('change', (e) => {
    app.querySelector('#op-eps')!.innerHTML = draw((e.target as HTMLInputElement).checked);
  });
}

export function notFound(app: HTMLElement) {
  app.innerHTML = `<section class="page"><h1>Not found</h1><a href="#/">Back to chapters</a></section>`;
}
