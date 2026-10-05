// Browsing pages: chapter list, chapter detail, operator list, operator detail.

import { WORDS_PER_MINUTE } from './cast';
import { chapterLabel, episodeMap, getEpisode, getIndex, getOperators, getProfile, sequence } from './data';
import { bindProfile, renderProfile } from './profile-view';
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
    <ol class="ep-list">${ch.episodes.map((e) => episodeRow(e, `#/scene/${e.id}`)).join('')}</ol>
  </section>`;
}

function readingTime(words: number): string {
  const min = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** A scene's summary page: overview, cast, length, and links to its neighbours. */
export async function renderScene(app: HTMLElement, id: string) {
  const [eps, seq] = await Promise.all([episodeMap(), sequence({ kind: 'story' })]);
  const info = eps.get(id);
  if (!info) return notFound(app);
  const ep = await getEpisode(id);
  const pos = seq.indexOf(id);
  const prev = pos > 0 ? eps.get(seq[pos - 1])! : null;
  const next = pos < seq.length - 1 ? eps.get(seq[pos + 1])! : null;
  const n = (x: number) => x.toLocaleString();

  const neighbour = (e: EpisodeRef | null, label: string, cls: string) =>
    e
      ? `<a class="scene-nav ${cls}" href="#/scene/${e.id}">
          <span class="kicker">${label}</span>
          <span class="scene-nav-name">${esc(e.code)} ${esc(e.name)}${e.tag ? ` · ${esc(e.tag)}` : ''}</span>
        </a>`
      : `<span class="scene-nav ${cls}"></span>`;

  const castRow = (c: (typeof ep.cast)[number]) => {
    const name = c.operatorId ? `<a href="#/operator/${c.operatorId}">${esc(c.name)}</a>` : esc(c.name);
    const badges = [
      c.lines ? `<span class="badge speak">${c.lines} line${c.lines > 1 ? 's' : ''}</span>` : '',
      c.mentions ? `<span class="badge">named ${c.mentions}×</span>` : '',
    ].join('');
    return `<li><span class="cast-name">${name}</span><span class="badges">${badges}</span></li>`;
  };

  app.innerHTML = `<section class="page scene-page">
    <a class="back" href="#/chapter/${info.chapter.id}">← ${esc(info.chapter.name)}</a>
    <p class="kicker">${chapterLabel(info.chapter)} · ${esc(ep.code)}${ep.tag ? ` · ${esc(ep.tag)}` : ''}</p>
    <h1>${esc(ep.name)}</h1>
    <p class="scene-stats">${n(ep.lines)} lines · ${n(ep.words)} words · about ${readingTime(ep.words)} to read
      <span class="fineprint">(at ${WORDS_PER_MINUTE} words per minute, an average adult reading speed)</span></p>
    <a class="btn primary" href="#/read/${id}">Start reading</a>

    <h2 class="section-head">Scene Overview</h2>
    <p class="overview">${info.synopsis ? esc(info.synopsis) : '<span class="muted">The game has no summary for this scene.</span>'}</p>

    <h2 class="section-head">Characters in this scene</h2>
    ${
      ep.cast.length
        ? `<ul class="cast-list">${ep.cast.map(castRow).join('')}</ul>`
        : '<p class="muted">No named characters.</p>'
    }

    <nav class="scene-navs">
      ${neighbour(prev, '← Previous Chapter', 'prev')}
      ${neighbour(next, 'Next Chapter →', 'next')}
    </nav>
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

  const profile = await getProfile(op.id);
  app.innerHTML = `<section class="page">
    <a class="back" href="#/operators">← Operators</a>
    <h1>${esc(op.name)}</h1>
    ${profile ? renderProfile(profile) : ''}
    <h2 class="section-head" id="scenes">Scenes</h2>
    <p class="lede">${op.episodes.length} scenes in the main story, speaking in ${speaking}.</p>
    <div class="row">
      <a class="btn primary" href="#/read/${op.episodes[0].id}${ctx}">Read all in order</a>
      <label class="check"><input type="checkbox" id="only-speaking" /> Only scenes where ${esc(op.name)} speaks</label>
    </div>
    <div id="op-eps">${draw(false)}</div>
  </section>`;
  bindProfile(app);
  app.querySelector<HTMLInputElement>('#only-speaking')!.addEventListener('change', (e) => {
    app.querySelector('#op-eps')!.innerHTML = draw((e.target as HTMLInputElement).checked);
  });
}

export function notFound(app: HTMLElement) {
  app.innerHTML = `<section class="page"><h1>Not found</h1><a href="#/">Back to chapters</a></section>`;
}
