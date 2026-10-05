import './style.css'; // through Vite so edits hot-reload
import { FIELDS, renderBrowseHome, renderBrowseIndex, renderBrowseValue, renderHeights, type FieldKey } from './browse';
import { parseContext } from './data';
import { renderReader } from './reader';
import { notFound, renderChapter, renderChapters, renderOperator, renderOperators, renderScene } from './views';

const app = document.getElementById('app')!;
let cleanup: (() => void) | void;

async function route() {
  cleanup?.();
  cleanup = undefined;
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  const isReader = parts[0] === 'read';

  document.body.classList.toggle('reading', isReader);
  if (!isReader && document.body.classList.contains('immersive')) {
    document.body.classList.remove('immersive');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  document.querySelectorAll<HTMLElement>('#site-header [data-tab]').forEach((a) => {
    const tab =
      ['operators', 'operator', 'npc'].includes(parts[0]) ? 'operators' : parts[0] === 'browse' ? 'browse' : 'chapters';
    a.classList.toggle('active', a.dataset.tab === tab);
  });

  try {
    switch (parts[0]) {
      case undefined:
        return await renderChapters(app);
      case 'chapter':
        return await renderChapter(app, parts[1]);
      case 'scene':
        return await renderScene(app, parts[1]);
      case 'operators':
        return await renderOperators(app);
      case 'operator':
      case 'npc':
        return await renderOperator(app, parts[1]);
      case 'browse': {
        const field = parts[1];
        if (!field) return await renderBrowseHome(app);
        if (field === 'height') return await renderHeights(app, params.get('op') ?? undefined);
        if (!(field in FIELDS)) return notFound(app);
        if (!parts[2]) return await renderBrowseIndex(app, field as FieldKey);
        return await renderBrowseValue(app, field as FieldKey, decodeURIComponent(parts.slice(2).join('/')));
      }
      case 'read': {
        const at = params.get('at');
        cleanup = await renderReader(app, parts[1], parseContext(params.get('ctx')), at === 'end' || at === 'start' ? at : 'resume');
        return;
      }
      default:
        return notFound(app);
    }
  } catch (err) {
    app.innerHTML = `<section class="page"><h1>Something went wrong</h1><p class="lede"></p></section>`;
    app.querySelector('.lede')!.textContent = String((err as Error).message ?? err);
  } finally {
    if (!isReader) window.scrollTo(0, 0);
  }
}

// Theme: follow the system unless the reader picks one.
const THEMES = ['auto', 'light', 'dark'] as const;
function applyTheme(t: string) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
let theme = (() => {
  try {
    return localStorage.getItem('theme') ?? 'auto';
  } catch {
    return 'auto';
  }
})();
applyTheme(theme);
document.getElementById('theme-toggle')!.addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme as (typeof THEMES)[number]) + 1) % THEMES.length];
  applyTheme(theme);
  try {
    localStorage.setItem('theme', theme);
  } catch {}
});

window.addEventListener('hashchange', route);
route();
