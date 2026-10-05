// Browse operators by what their files say: faction, race, place of birth, voice artist, height.
//   #/browse                  the list of things to browse by
//   #/browse/race             every race, with how many operators
//   #/browse/race/Feline      a summary of one race and its operators
//   #/browse/height           every operator, sortable by height

import { getRoster, getVoiceLinks } from './data';
import type { RosterEntry, VoiceLink } from './types';
import { esc } from './views';

export type FieldKey = 'faction' | 'race' | 'birthplace' | 'voice';

interface Field {
  title: string; // index page heading
  one: string; // what a single value is called
  values: (e: RosterEntry) => { value: string; note?: string }[];
  noteLabel?: string; // column for the per-operator note, e.g. the role or language
}

export const FIELDS: Record<FieldKey, Field> = {
  faction: {
    title: 'Nations & factions',
    one: 'Faction',
    values: (e) => e.factions.map((f) => ({ value: f.name, note: f.label })),
    noteLabel: 'Tie',
  },
  race: { title: 'Races', one: 'Race', values: (e) => e.races.map((value) => ({ value })) },
  birthplace: {
    title: 'Places of birth',
    one: 'Place of birth',
    values: (e) => (e.birthplace ? [{ value: e.birthplace }] : []),
  },
  voice: {
    title: 'Voice artists',
    one: 'Voice artist',
    values: (e) => e.voices.map((v) => ({ value: v.name, note: v.lang })),
    noteLabel: 'Language',
  },
};

export const browseHref = (field: FieldKey | 'height', value?: string) =>
  `#/browse/${field}${value ? `/${encodeURIComponent(value)}` : ''}`;

const opHref = (e: RosterEntry) => `#/operator/${e.id}`;
const stars = (n: number) => '★'.repeat(n);

// --- Sortable table -------------------------------------------------------

interface Column {
  label: string;
  cell: (e: RosterEntry) => string; // HTML
  sort: (e: RosterEntry) => string | number | null; // null sorts last either way
  num?: boolean;
}

const COLS = {
  name: { label: 'Operator', cell: (e) => `<a href="${opHref(e)}">${esc(e.name)}</a>`, sort: (e) => e.name },
  rarity: { label: 'Rarity', cell: (e) => `<span class="stars">${stars(e.rarity)}</span>`, sort: (e) => e.rarity, num: true },
  cls: { label: 'Class', cell: (e) => `${esc(e.className)} <span class="muted">· ${esc(e.branch)}</span>`, sort: (e) => `${e.className} ${e.branch}` },
  height: {
    label: 'Height',
    cell: (e) => (e.height ? esc(e.height) : '<span class="muted">—</span>'),
    sort: (e) => e.heightCm,
    num: true,
  },
  race: {
    label: 'Race',
    cell: (e) => e.races.map((r) => `<a href="${browseHref('race', r)}">${esc(r)}</a>`).join(' / ') || '<span class="muted">—</span>',
    sort: (e) => e.races.join('/') || null,
  },
  birthplace: {
    label: 'Place of birth',
    cell: (e) => (e.birthplace ? `<a href="${browseHref('birthplace', e.birthplace)}">${esc(e.birthplace)}</a>` : '<span class="muted">—</span>'),
    sort: (e) => e.birthplace || null,
  },
} satisfies Record<string, Column>;

function sortableTable(host: HTMLElement, rows: RosterEntry[], cols: Column[], initial: { col: number; dir: 1 | -1 }) {
  let { col, dir } = initial;
  const draw = () => {
    const key = cols[col].sort;
    const sorted = [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return c * dir || a.name.localeCompare(b.name);
    });
    host.innerHTML = `<div class="table-wrap"><table class="roster">
      <thead><tr>${cols
        .map(
          (c, i) =>
            `<th${c.num ? ' class="num"' : ''} aria-sort="${i === col ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">
              <button data-col="${i}">${esc(c.label)}${i === col ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`,
        )
        .join('')}</tr></thead>
      <tbody>${sorted.map((e) => `<tr>${cols.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.cell(e)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
    host.querySelectorAll<HTMLButtonElement>('th button').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.col);
        dir = i === col ? ((-dir) as 1 | -1) : cols[i].num ? -1 : 1;
        col = i;
        draw();
      }),
    );
  };
  draw();
}

// --- Pages ------------------------------------------------------------------

function counts(rows: RosterEntry[], field: FieldKey) {
  const m = new Map<string, number>();
  for (const e of rows) for (const v of new Set(FIELDS[field].values(e).map((x) => x.value))) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function chipList(field: FieldKey, list: [string, number][], limit = 16) {
  const shown = list.slice(0, limit);
  return `<p class="chips">${shown
    .map(([v, n]) => `<a class="badge" href="${browseHref(field, v)}"><span class="badge-text">${esc(v)}</span> <span class="muted">${n}</span></a>`)
    .join('')}${list.length > limit ? `<a class="badge" href="${browseHref(field)}"><span class="badge-text">+${list.length - limit} more</span></a>` : ''}</p>`;
}

export async function renderBrowseHome(app: HTMLElement) {
  const roster = await getRoster();
  const card = (href: string, title: string, meta: string) =>
    `<li><a class="card" href="${href}"><span class="card-title">${esc(title)}</span><span class="card-meta">${esc(meta)}</span></a></li>`;
  app.innerHTML = `<section class="page">
    <h1>Browse operators</h1>
    <p class="lede">Group all ${roster.length} operators by what their files say.</p>
    <ol class="card-list">
      ${(Object.keys(FIELDS) as FieldKey[]).map((f) => card(browseHref(f), FIELDS[f].title, `${counts(roster, f).length} entries`)).join('')}
      ${card(browseHref('height'), 'Heights', `${roster.filter((e) => e.heightCm).length} operators, sortable`)}
    </ol>
  </section>`;
}

export async function renderBrowseIndex(app: HTMLElement, field: FieldKey) {
  const roster = await getRoster();
  const f = FIELDS[field];
  const list = counts(roster, field);
  const grid = (items: [string, number][]) =>
    `<ul class="op-grid">${items
      .map(
        ([v, n]) => `<li data-name="${esc(v.toLowerCase())}"><a href="${browseHref(field, v)}">
          <span class="op-name">${esc(v)}</span><span class="op-count">${n}</span></a></li>`,
      )
      .join('')}</ul>`;
  // Voice artists are split by language; the filter still searches every section.
  const body =
    field === 'voice'
      ? voiceLanguages(roster)
          .map(
            ([lang, items]) => `<section class="value-group">
              <h2 class="section-head">${esc(lang)} <span class="muted count"></span></h2>${grid(items)}</section>`,
          )
          .join('')
      : grid(list);
  app.innerHTML = `<section class="page">
    <a class="back" href="#/browse">← Browse</a>
    <h1>${esc(f.title)}</h1>
    <p class="lede">${list.length} ${esc(f.title.toLowerCase())} across ${roster.length} operators.</p>
    <input id="val-filter" class="search" type="search" placeholder="Filter" autocomplete="off" />
    ${body}
  </section>`;
  const input = app.querySelector<HTMLInputElement>('#val-filter')!;
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    app.querySelectorAll<HTMLElement>('.op-grid li').forEach((li) => (li.hidden = !!q && !li.dataset.name!.includes(q)));
    app.querySelectorAll<HTMLElement>('.value-group').forEach((g) => {
      const shown = g.querySelectorAll('li:not([hidden])').length;
      g.hidden = shown === 0;
      g.querySelector('.count')!.textContent = String(shown);
    });
  };
  input.addEventListener('input', filter);
  filter();
}

/** IMDb and Wikipedia pages for a voice artist, matched on Wikidata; otherwise an IMDb name search. */
function externalLinks(name: string, link: VoiceLink | undefined) {
  const a = (href: string, label: string) => `<a href="${esc(href)}" target="_blank" rel="noopener">${label} ↗</a>`;
  const items = [
    link?.imdb ? a(`https://www.imdb.com/name/${link.imdb}/`, 'IMDb') : '',
    link?.wikipedia ? a(link.wikipedia, 'Wikipedia') : '',
    link?.imdb ? '' : a(`https://www.imdb.com/find/?q=${encodeURIComponent(name)}&s=nm`, 'Search IMDb'),
  ].filter(Boolean);
  return `<p class="external-links">${items.join('')}</p>`;
}

const LANGUAGE_ORDER =['EN', 'JP', 'KR', 'CN - Mandarin'];

/** Voice artists per language (EN, JP, KR, CN, then any others), each with how many operators they voice in it. */
function voiceLanguages(roster: RosterEntry[]): [string, [string, number][]][] {
  const byLang = new Map<string, Map<string, number>>();
  for (const e of roster)
    for (const v of e.voices) {
      if (!byLang.has(v.lang)) byLang.set(v.lang, new Map());
      const m = byLang.get(v.lang)!;
      m.set(v.name, (m.get(v.name) ?? 0) + 1);
    }
  const rank = (l: string) => (LANGUAGE_ORDER.includes(l) ? LANGUAGE_ORDER.indexOf(l) : LANGUAGE_ORDER.length);
  return [...byLang]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([lang, m]) => [
      lang === 'CN - Mandarin' ? 'CN' : lang,
      [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    ]);
}

export async function renderBrowseValue(app: HTMLElement, field: FieldKey, value: string) {
  const roster = await getRoster();
  const f = FIELDS[field];
  const notes = new Map<string, string>();
  const rows = roster.filter((e) => {
    const hits = f.values(e).filter((x) => x.value === value);
    if (hits.length) notes.set(e.id, [...new Set(hits.map((h) => h.note).filter(Boolean))].join(', '));
    return hits.length > 0;
  });
  if (!rows.length) {
    app.innerHTML = `<section class="page"><a class="back" href="${browseHref(field)}">← ${esc(f.title)}</a>
      <h1>${esc(value)}</h1><p class="lede">No operators found.</p></section>`;
    return;
  }

  const classes = new Map<string, number>();
  for (const e of rows) classes.set(e.className, (classes.get(e.className) ?? 0) + 1);
  const heights = rows.map((e) => e.heightCm).filter((h): h is number => h !== null);
  const avg = heights.length ? Math.round(heights.reduce((a, b) => a + b, 0) / heights.length) : null;
  const story = rows.filter((e) => e.inStory).length;
  const related = (Object.keys(FIELDS) as FieldKey[])
    .filter((k) => k !== field && k !== 'voice')
    .map((k) => {
      const list = counts(rows, k);
      return list.length ? `<h3 class="prof-sub">${esc(FIELDS[k].title)}</h3>${chipList(k, list)}` : '';
    })
    .join('');
  const roles =
    field === 'faction'
      ? [...new Set([...notes.values()].flatMap((n) => n.split(', ')))].filter(Boolean)
      : field === 'voice'
        ? [...new Set([...notes.values()])]
        : [];

  app.innerHTML = `<section class="page">
    <a class="back" href="${browseHref(field)}">← ${esc(f.title)}</a>
    <p class="kicker">${esc(f.one)}${roles.length ? ` · ${roles.map(esc).join(', ')}` : ''}</p>
    <h1>${esc(value)}</h1>
    ${field === 'voice' ? externalLinks(value, (await getVoiceLinks())[value]) : `
      <dl class="stat-grid summary-stats">
        <div><dt>Operators</dt><dd>${rows.length}</dd></div>
        <div><dt>In the main story</dt><dd>${story}</dd></div>
        <div><dt>Average height</dt><dd>${avg ? `${avg}cm` : '—'}</dd></div>
        <div><dt>Classes</dt><dd>${classes.size}</dd></div>
      </dl>
      <h3 class="prof-sub">Classes</h3>
      <p class="chips">${[...classes]
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `<span class="badge">${esc(c)} <span class="muted">${n}</span></span>`)
        .join('')}</p>
      ${related}
      `}
    <h2 class="section-head">Operators</h2>
    <div id="roster-table"></div>
  </section>`;

  const cols: Column[] = [COLS.name, COLS.rarity, COLS.cls];
  if (f.noteLabel) cols.push({ label: f.noteLabel, cell: (e) => esc(notes.get(e.id) ?? ''), sort: (e) => notes.get(e.id) || null });
  if (field !== 'race') cols.push(COLS.race);
  if (field !== 'birthplace') cols.push(COLS.birthplace);
  cols.push(COLS.height);
  sortableTable(app.querySelector('#roster-table')!, rows, cols, { col: 0, dir: 1 });
}

export async function renderHeights(app: HTMLElement, highlight?: string) {
  const roster = await getRoster();
  const known = roster.filter((e) => e.heightCm !== null);
  const sorted = known.map((e) => e.heightCm!).sort((a, b) => a - b);
  app.innerHTML = `<section class="page">
    <a class="back" href="#/browse">← Browse</a>
    <h1>Heights</h1>
    <p class="lede">${known.length} operators list a height, from ${sorted[0]}cm to ${sorted[sorted.length - 1]}cm.
      ${roster.length - known.length} more are undisclosed or not given in centimetres; they sort last.
      Click a column to sort.</p>
    <div id="roster-table"></div>
  </section>`;
  const host = app.querySelector<HTMLElement>('#roster-table')!;
  sortableTable(host, roster, [COLS.name, COLS.height, COLS.race, COLS.birthplace, COLS.cls, COLS.rarity], { col: 1, dir: -1 });
  if (highlight) {
    const row = host.querySelector(`a[href="#/operator/${CSS.escape(highlight)}"]`)?.closest('tr');
    row?.classList.add('hl');
    row?.scrollIntoView({ block: 'center' });
  }
}
