// Browsing pages: chapter list, chapter detail, operator list, operator detail.

import { WORDS_PER_MINUTE } from './cast';
import { chapterLabel, episodeMap, findCharacter, getIndex, getNpcs, getOperators, getProfile, getRoster } from './data';
import { bindProfile, renderProfile } from './profile-view';
import type { Chapter, EpisodeRef, Npc } from './types';

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

const READING_SPEED_NOTE = `Reading time at ${WORDS_PER_MINUTE} words per minute, an average adult reading speed`;

function readingTime(words: number): string {
  const min = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** One scene on a chapter page: its length, the game's overview, and who's in it. */
function sceneRow(e: EpisodeRef, npcIds: Map<string, string>) {
  const who = e.cast
    .map((c) => {
      const href = c.operatorId ? `#/operator/${c.operatorId}` : npcIds.has(c.name) ? `#/npc/${npcIds.get(c.name)}` : '';
      const title = [c.lines ? `${c.lines} line${c.lines > 1 ? 's' : ''}` : '', c.mentions ? `named ${c.mentions}×` : '']
        .filter(Boolean)
        .join(', ');
      const name = href ? `<a href="${href}">${esc(c.name)}</a>` : esc(c.name);
      return `<span class="${c.lines ? 'speaks' : 'named'}" title="${esc(title)}">${name}</span>`;
    })
    .join(', ');
  // Prologue scenes have no code; drop the column so the name and overview line up at the left.
  return `<li class="ep-row scene-row${e.code ? '' : ' no-code'}" id="scene-${esc(e.id)}">
    <a href="#/read/${e.id}">
      ${e.code ? `<span class="ep-code">${esc(e.code)}</span>` : ''}
      <span class="ep-name">${esc(e.name)}</span>
      ${e.tag ? `<span class="pill ${tagClass(e.tag)}">${esc(e.tag)}</span>` : ''}
      <span class="ep-len" title="${READING_SPEED_NOTE}">${e.lines.toLocaleString()} lines · about ${readingTime(e.words)}</span>
    </a>
    <div class="scene-detail">
      ${e.synopsis ? `<p class="synopsis">${esc(e.synopsis)}</p>` : ''}
      ${who ? `<p class="ep-cast"><span class="label">Characters</span> ${who}</p>` : ''}
    </div>
  </li>`;
}

/** A chapter's scenes, each with its overview, length and cast. `focus` scrolls to and marks one scene. */
export async function renderChapter(app: HTMLElement, id: string, focus?: string) {
  const [idx, npcs] = await Promise.all([getIndex(), getNpcs()]);
  const at = idx.chapters.findIndex((c) => c.id === id);
  if (at < 0) return notFound(app);
  const ch = idx.chapters[at];
  const npcIds = new Map(npcs.map((n) => [n.name, n.id]));
  const lines = ch.episodes.reduce((n, e) => n + e.lines, 0);
  const words = ch.episodes.reduce((n, e) => n + e.words, 0);
  const neighbour = (c: Chapter | undefined, label: string, cls: string) =>
    c
      ? `<a class="scene-nav ${cls}" href="#/chapter/${c.id}">
          <span class="kicker">${label}</span>
          <span class="scene-nav-name">${chapterLabel(c)} · ${esc(c.name)}</span>
        </a>`
      : `<span class="scene-nav ${cls}"></span>`;

  app.innerHTML = `<section class="page">
    <a class="back" href="#/">← Chapters</a>
    <p class="kicker">${chapterLabel(ch)}</p>
    <h1>${esc(ch.name)}</h1>
    <p class="scene-stats">${ch.episodes.length} scenes · ${lines.toLocaleString()} lines ·
      <span class="hint" title="${READING_SPEED_NOTE}">about ${readingTime(words)} to read</span></p>
    <a class="btn primary" href="#/read/${ch.episodes[0].id}">Start reading</a>
    <ol class="ep-list">${ch.episodes.map((e) => sceneRow(e, npcIds)).join('')}</ol>
    <nav class="scene-navs">
      ${neighbour(idx.chapters[at - 1], '← Previous Chapter', 'prev')}
      ${neighbour(idx.chapters[at + 1], 'Next Chapter →', 'next')}
    </nav>
  </section>`;

  if (focus) {
    const row = app.querySelector<HTMLElement>(`#scene-${CSS.escape(focus)}`);
    if (row) {
      row.classList.add('focus');
      setTimeout(() => row.scrollIntoView({ block: 'center' })); // after the router's scroll-to-top
    }
  }
}

/** #/scene/<id>: the scene's place on its chapter page. */
export async function renderScene(app: HTMLElement, id: string) {
  const info = (await episodeMap()).get(id);
  if (!info) return notFound(app);
  return renderChapter(app, info.chapter.id, id);
}

/** The character list: every operator, then every named NPC in the story. */
export async function renderOperators(app: HTMLElement) {
  const [ops, roster, npcs] = await Promise.all([getOperators(), getRoster(), getNpcs()]);
  const scenes = new Map(ops.map((o) => [o.id, o.episodes.length]));
  const tile = (href: string, name: string, n: number) =>
    `<li data-name="${esc(name.toLowerCase())}"${n ? '' : ' class="no-scenes"'}><a href="${href}">
      <span class="op-name">${esc(name)}</span>
      <span class="op-count" title="${n} scene${n === 1 ? '' : 's'} in the main story">${n || '—'}</span>
    </a></li>`;
  app.innerHTML = `<section class="page">
    <h1>Characters</h1>
    <p class="lede">Pick a character to see their file and read every scene they speak in, appear in, or are mentioned in.
      The number is how many main-story scenes they're in.</p>
    <input id="op-filter" class="search" type="search" placeholder="Filter characters" autocomplete="off" />
    <h2 class="section-head">Operators <span class="muted count" data-of="ops"></span></h2>
    <label class="check"><input type="checkbox" id="story-only" /> Only operators in the main story</label>
    <ul class="op-grid" data-list="ops">${roster.map((o) => tile(`#/operator/${o.id}`, o.name, scenes.get(o.id) ?? 0)).join('')}</ul>
    <h2 class="section-head">NPCs <span class="muted count" data-of="npcs"></span></h2>
    <p class="muted small">Named story characters who aren't playable: anyone who speaks under a name, or is a known NPC, and isn't an operator.</p>
    <ul class="op-grid" data-list="npcs">${npcs.map((n) => tile(`#/npc/${n.id}`, n.name, n.episodes.length)).join('')}</ul>
  </section>`;
  const input = app.querySelector<HTMLInputElement>('#op-filter')!;
  const storyOnly = app.querySelector<HTMLInputElement>('#story-only')!;
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    app.querySelectorAll<HTMLElement>('.op-grid').forEach((list) => {
      let shown = 0;
      list.querySelectorAll<HTMLElement>('li').forEach((li) => {
        li.hidden =
          (!!q && !li.dataset.name!.includes(q)) || (list.dataset.list === 'ops' && storyOnly.checked && li.classList.contains('no-scenes'));
        if (!li.hidden) shown++;
      });
      app.querySelector(`[data-of="${list.dataset.list}"]`)!.textContent = String(shown);
    });
  };
  input.addEventListener('input', filter);
  storyOnly.addEventListener('change', filter);
  filter();
  input.focus();
}

function npcFiles(npc: Npc) {
  return npc.files.length
    ? `<div class="profile"><p class="kicker">NPC</p>${npc.files
        .map(
          (f) => `<details class="file" open><summary>${esc(f.title)}</summary>
            <p class="file-text">${esc(f.text).replace(/\n/g, '<br>')}</p></details>`,
        )
        .join('')}</div>`
    : `<p class="kicker">NPC</p>`;
}

/** An operator's or NPC's page: their file, then the scenes they're in. */
export async function renderOperator(app: HTMLElement, id: string) {
  const [op, eps] = await Promise.all([findCharacter(id), episodeMap()]);
  const npc = id.startsWith('npc-') ? (op as Npc | undefined) : undefined;
  if (!op) {
    // Not in the main story, but browse pages link every operator: show just their file.
    const profile = await getProfile(id);
    if (!profile) return notFound(app);
    app.innerHTML = `<section class="page">
      <a class="back" href="#/operators">← Characters</a>
      <h1>${esc(profile.name)}</h1>
      ${renderProfile(profile).replace('<a href="#scenes">Scenes</a>', '')}
      <h2 class="section-head">Scenes</h2>
      <p class="lede">${esc(profile.name)} isn't in the main story yet.</p>
    </section>`;
    bindProfile(app);
    return;
  }
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

  const profile = npc ? null : await getProfile(op.id);
  app.innerHTML = `<section class="page">
    <a class="back" href="#/operators">← Characters</a>
    <h1>${esc(op.name)}</h1>
    ${profile ? renderProfile(profile) : npc ? npcFiles(npc) : ''}
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
