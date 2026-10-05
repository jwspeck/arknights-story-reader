// The operator file at the top of an operator's page: who they are, their fully built stats,
// skills, modules, base skills, archive files and voice lines.

import type { Profile, ProfileForm, ProfileModule, ProfileSkill, Stats } from './types';
import { esc } from './views';

const STATS: { key: keyof Stats; label: string; unit?: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' },
  { key: 'res', label: 'RES' },
  { key: 'redeploy', label: 'Redeploy', unit: 's' },
  { key: 'cost', label: 'DP Cost' },
  { key: 'block', label: 'Block' },
  { key: 'interval', label: 'Attack interval', unit: 's' },
];

const text = (s: string) => esc(s).replace(/\n/g, '<br>');
const num = (n: number) => n.toLocaleString();

function rangeGrid(cells: [number, number][], label: string) {
  if (!cells.length) return '';
  const rows = cells.map((c) => c[0]);
  const cols = cells.map((c) => c[1]);
  const [r0, r1] = [Math.min(0, ...rows), Math.max(0, ...rows)];
  const [c0, c1] = [Math.min(0, ...cols), Math.max(0, ...cols)];
  const on = new Set(cells.map(([r, c]) => `${r},${c}`));
  let html = '';
  for (let r = r1; r >= r0; r--)
    for (let c = c0; c <= c1; c++)
      html += `<span class="${r === 0 && c === 0 ? 'me' : on.has(`${r},${c}`) ? 'on' : ''}"></span>`;
  return `<figure class="range" aria-label="${esc(label)}">
    <div class="range-grid" style="grid-template-columns: repeat(${c1 - c0 + 1}, 12px)">${html}</div>
    <figcaption>${esc(label)}</figcaption>
  </figure>`;
}

function skillCard(s: ProfileSkill, i: number) {
  const meta = [
    s.activation,
    s.recovery,
    `SP ${s.spCost}${s.initSp ? ` (starts at ${s.initSp})` : ''}`,
    s.duration > 0 ? `${s.duration}s` : '',
  ].filter(Boolean);
  return `<article class="prof-card">
    <header><span class="kicker">Skill ${i + 1} · ${esc(s.level)}</span><h4>${esc(s.name)}</h4></header>
    <p class="chips">${meta.map((m) => `<span class="badge">${esc(m)}</span>`).join('')}</p>
    <div class="flex-row"><p class="rich">${s.html}</p>${s.range ? rangeGrid(s.range, 'Skill range') : ''}</div>
  </article>`;
}

function moduleCard(m: ProfileModule, base: Stats) {
  const bonus = m.bonus
    .map((b) => {
      if (b.stat === 'interval') return `<li><span>ASPD</span> <b>+${num(b.value)}</b></li>`;
      const label = STATS.find((s) => s.key === b.stat)?.label ?? b.stat;
      const sign = b.value > 0 ? '+' : '';
      return `<li><span>${label}</span> <b>${sign}${num(b.value)}</b> <span class="muted">→ ${num(base[b.stat] + b.value)}</span></li>`;
    })
    .join('');
  return `<article class="prof-card">
    <header><span class="kicker">${esc(m.code)} · Stage 3</span><h4>${esc(m.name)}</h4></header>
    ${bonus ? `<ul class="bonus">${bonus}</ul>` : ''}
    ${m.traitHtml ? `<p class="rich"><span class="label">Trait</span> ${m.traitHtml}</p>` : ''}
    ${m.talents.map((t) => `<p class="rich"><span class="label">${esc(t.name || 'Talent')}</span> ${t.html}</p>`).join('')}
    ${m.story ? `<details><summary>Module story</summary><p class="file-text">${text(m.story)}</p></details>` : ''}
  </article>`;
}

function formBody(f: ProfileForm) {
  return `
    <h3 class="prof-sub">Stats at max</h3>
    <p class="muted small">Max promotion and level, full potential, max trust.</p>
    <div class="flex-row">
      <dl class="stat-grid">${STATS.map(
        (s) => `<div><dt>${s.label}</dt><dd>${num(f.stats[s.key])}${s.unit ?? ''}</dd></div>`,
      ).join('')}</dl>
      ${rangeGrid(f.range, 'Attack range')}
    </div>

    <h3 class="prof-sub">Trait</h3>
    <p class="rich">${f.traitHtml}</p>

    ${
      f.talents.length
        ? `<h3 class="prof-sub">Talents</h3>${f.talents
            .map((t) => `<p class="rich"><span class="label">${esc(t.name)}</span> ${t.html}</p>`)
            .join('')}`
        : ''
    }

    ${f.skills.length ? `<h3 class="prof-sub" id="skills">Skills</h3><div class="card-grid">${f.skills.map(skillCard).join('')}</div>` : ''}

    ${
      f.modules.length
        ? `<h3 class="prof-sub" id="modules">Modules</h3><div class="card-grid">${f.modules
            .map((m) => moduleCard(m, f.stats))
            .join('')}</div>`
        : '<h3 class="prof-sub" id="modules">Modules</h3><p class="muted">No modules.</p>'
    }`;
}

export function renderProfile(p: Profile): string {
  const main = p.forms[0];
  const facts = [
    ...p.affiliation.map((a) => [a.label, a.name]),
    ...p.info.map((i) => [i.key, i.value]),
    p.illustrators.length ? ['Illustrator', p.illustrators.join(', ')] : null,
    ...p.voices.map((v) => [`Voice (${v.lang})`, v.names.join(', ')]),
    p.obtain ? ['Obtained from', p.obtain] : null,
  ].filter((x): x is string[] => !!x);

  const forms = p.forms.length > 1;
  const files = p.files
    .map(
      (f) => `<details class="file"${f.title === 'Profile' ? ' open' : ''}>
        <summary>${esc(f.title)}</summary><p class="file-text">${text(f.text)}</p></details>`,
    )
    .join('');

  return `<div class="profile">
    <p class="kicker">${esc(p.number)} · ${'★'.repeat(p.rarity)}</p>
    <p class="prof-class">${esc(main.className)} · ${esc(main.branch)} · ${esc(main.position)}${main.tags.length ? ` · ${main.tags.map(esc).join(', ')}` : ''}</p>
    ${p.usage ? `<p class="lede">${esc(p.usage)}${p.quote ? ` <i>“${esc(p.quote)}”</i>` : ''}</p>` : ''}

    <nav class="jump">
      <a href="#prof-about">About</a><a href="#prof-build">Stats &amp; skills</a>
      ${p.files.length ? '<a href="#prof-files">Files</a>' : ''}
      ${p.voiceLines.length ? '<a href="#prof-voice">Voice lines</a>' : ''}
      <a href="#scenes">Scenes</a>
    </nav>

    <h2 class="section-head" id="prof-about">About</h2>
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>

    <h2 class="section-head" id="prof-build">Stats &amp; skills</h2>
    ${
      forms
        ? `<div class="tabs" role="tablist">${p.forms
            .map(
              (f, i) =>
                `<button role="tab" class="tab${i ? '' : ' active'}" data-form="${i}" aria-selected="${!i}">${esc(f.className)}</button>`,
            )
            .join('')}</div>`
        : ''
    }
    ${p.forms.map((f, i) => `<div class="form-body" data-form="${i}"${i ? ' hidden' : ''}>${formBody(f)}</div>`).join('')}

    ${p.potentials.length ? `<h3 class="prof-sub">Potential</h3><ol class="plain-list">${p.potentials.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}

    ${
      p.baseSkills.length
        ? `<h3 class="prof-sub">Base skills</h3>${p.baseSkills
            .map((b) => `<p class="rich"><span class="label">${esc(b.name)}</span> <span class="muted">${esc(b.room)}.</span> ${b.html}</p>`)
            .join('')}`
        : ''
    }

    ${p.files.length ? `<h2 class="section-head" id="prof-files">Files</h2>${files}` : ''}

    ${
      p.voiceLines.length
        ? `<h2 class="section-head" id="prof-voice">Voice lines</h2>
          <details class="file"><summary>${p.voiceLines.length} lines</summary>
            <dl class="voice">${p.voiceLines.map((v) => `<dt>${esc(v.title)}</dt><dd>${text(v.text)}</dd>`).join('')}</dl>
          </details>`
        : ''
    }
  </div>`;
}

/** Wires up the class tabs (Amiya). */
export function bindProfile(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('.tabs .tab').forEach((btn) =>
    btn.addEventListener('click', () => {
      root.querySelectorAll<HTMLButtonElement>('.tabs .tab').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      root.querySelectorAll<HTMLElement>('.form-body').forEach((el) => (el.hidden = el.dataset.form !== btn.dataset.form));
    }),
  );
  // In-page jumps without touching the hash router.
  root.querySelectorAll<HTMLAnchorElement>('.jump a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      root.ownerDocument.getElementById(a.getAttribute('href')!.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    }),
  );
}
