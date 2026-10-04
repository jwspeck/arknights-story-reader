// The book-style reader: one scene laid out in CSS columns and flipped a page (or spread) at a time.

import { chapterLabel, contextParam, episodeMap, getEpisode, getOperators, sequence, type Context } from './data';
import type { Block } from './types';
import { esc } from './views';

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: positions just aren't remembered */
    }
  },
};

const FONT_SIZES = [15, 16, 17, 18, 19, 20, 22, 24, 26, 28];

function renderBlocks(blocks: Block[], opName: string | null): string {
  const mention = opName
    ? new RegExp(`(?<![\\w'])(${opName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w'])`, 'g')
    : null;
  const mark = (t: string) => (mention ? t.replace(mention, '<mark>$1</mark>') : t).replace(/\n/g, '<br>');

  let html = '';
  let inBranch = false;
  let lastSpeaker = '';
  blocks.forEach((b, i) => {
    const d = `data-i="${i}"`;
    switch (b.t) {
      case 'line': {
        const same = b.speaker === lastSpeaker;
        const hl = opName && b.speaker === opName ? ' hl' : '';
        html += `<p class="line${same ? ' cont' : ''}${hl}" ${d}><span class="who">${same ? '' : b.speaker}</span><span class="say">${mark(b.text)}</span></p>`;
        lastSpeaker = b.speaker;
        return;
      }
      case 'narration':
        html += `<p class="narr" ${d}>${mark(b.text)}</p>`;
        break;
      case 'caption':
        html += `<p class="caption" ${d}>${mark(b.text)}</p>`;
        break;
      case 'scene':
        if (inBranch) {
          html += `</div>`;
          inBranch = false;
        }
        html += `<p class="scene-break" ${d} aria-hidden="true">⁂</p>`;
        break;
      case 'choice':
        if (inBranch) {
          html += `</div>`;
          inBranch = false;
        }
        html += `<div class="choice" ${d}><span class="choice-label">Doctor</span><ul>${b.options
          .map((o) => `<li>${o}</li>`)
          .join('')}</ul></div>`;
        break;
      case 'branch':
        if (inBranch) html += `</div>`;
        html += `<div class="branch"><p class="branch-label" ${d}>If you chose “${b.options.join('” or “')}”</p>`;
        inBranch = true;
        break;
      case 'merge':
        if (inBranch) {
          html += `</div>`;
          inBranch = false;
        }
        break;
    }
    lastSpeaker = '';
  });
  if (inBranch) html += `</div>`;
  return html;
}

export async function renderReader(
  app: HTMLElement,
  id: string,
  ctx: Context,
  startAt: 'resume' | 'start' | 'end',
): Promise<() => void> {
  const [ep, eps, seq, ops] = await Promise.all([getEpisode(id), episodeMap(), sequence(ctx), getOperators()]);
  const info = eps.get(id)!;
  const op = ctx.kind === 'op' ? ops.find((o) => o.id === ctx.opId) : undefined;
  const pos = seq.indexOf(id);
  const prevId = pos > 0 ? seq[pos - 1] : null;
  const nextId = pos >= 0 && pos < seq.length - 1 ? seq[pos + 1] : null;
  const cp = contextParam(ctx);
  const backHref = op ? `#/operator/${op.id}` : `#/chapter/${info.chapter.id}`;
  const backLabel = op ? op.name : info.chapter.name;
  const nextInfo = nextId ? eps.get(nextId)! : null;

  app.innerHTML = `<section class="reader">
    <div class="reader-bar">
      <a class="back" href="${backHref}">← ${esc(backLabel)}</a>
      <div class="reader-title">
        <span class="kicker">${chapterLabel(info.chapter)} · ${esc(ep.code)}</span>
        <span>${esc(ep.name)}</span>
      </div>
      <div class="reader-tools">
        <button class="icon-btn" data-act="smaller" title="Smaller text">A−</button>
        <button class="icon-btn" data-act="larger" title="Larger text">A+</button>
        <button class="icon-btn" data-act="immersive" title="Read mode (F)">⛶</button>
      </div>
    </div>
    <div class="book" tabindex="0">
      <div class="flow">
        <header class="ep-head" data-i="-1">
          <p class="kicker">${chapterLabel(info.chapter)} · ${esc(ep.code)}${ep.tag ? ` · ${esc(ep.tag)}` : ''}</p>
          <h1>${esc(ep.name)}</h1>
          ${info.synopsis ? `<p class="ep-synopsis">${esc(info.synopsis)}</p>` : ''}
          ${op ? `<p class="ep-following">Following ${esc(op.name)} · scene ${pos + 1} of ${seq.length}</p>` : ''}
        </header>
        ${renderBlocks(ep.blocks, op?.name ?? null)}
        <footer class="ep-end">
          <p>End of ${esc(ep.code)} ${esc(ep.name)}${ep.tag ? ` (${esc(ep.tag)})` : ''}</p>
          ${nextInfo ? `<a class="btn" href="#/read/${nextId}${cp}">Next: ${esc(nextInfo.code)} ${esc(nextInfo.name)} →</a>` : '<p>That is the last scene here.</p>'}
        </footer>
      </div>
    </div>
    <div class="reader-foot">
      <button class="nav-btn" data-act="prev" title="Previous page (←)">‹</button>
      <div class="progress"><div class="progress-fill"></div></div>
      <span class="page-count"></span>
      <button class="nav-btn" data-act="next" title="Next page (→)">›</button>
    </div>
    <button class="exit-immersive" data-act="immersive" title="Leave read mode (F)">✕</button>
  </section>`;

  const reader = app.querySelector<HTMLElement>('.reader')!;
  const book = reader.querySelector<HTMLElement>('.book')!;
  const flow = reader.querySelector<HTMLElement>('.flow')!;
  const fill = reader.querySelector<HTMLElement>('.progress-fill')!;
  const counter = reader.querySelector<HTMLElement>('.page-count')!;

  let fs = Number(store.get('fontSize')) || 19;
  let view = 0;
  let views = 1;
  let stride = 0;
  let anchor = startAt === 'resume' ? Number(store.get(`pos:${id}`) ?? -1) : -1;

  const blocksEls = () => [...flow.querySelectorAll<HTMLElement>('[data-i]')];

  function layout() {
    document.documentElement.style.setProperty('--fs', `${fs}px`);
    const w = book.clientWidth - parseFloat(getComputedStyle(book).paddingLeft) * 2;
    const perView = w >= 900 ? 2 : 1;
    const gap = perView === 2 ? 72 : 48;
    flow.style.columnCount = String(perView);
    flow.style.columnGap = `${gap}px`;
    flow.style.width = `${w}px`;
    stride = w + gap;
    const colW = (w - gap * (perView - 1)) / perView;
    const left = flow.getBoundingClientRect().left;
    let right = 0;
    for (const el of flow.children) right = Math.max(right, (el as HTMLElement).getBoundingClientRect().right - left);
    const cols = Math.max(1, Math.round((right + gap) / (colW + gap)));
    views = Math.max(1, Math.ceil(cols / perView));
  }

  /** The view (spread) that contains block `i`. */
  function viewOf(i: number) {
    const el = flow.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (!el) return 0;
    const x = el.getBoundingClientRect().left - flow.getBoundingClientRect().left;
    return Math.min(views - 1, Math.max(0, Math.floor((x + 4) / stride)));
  }

  /** The first block that starts on the current view. */
  function firstOnView() {
    const left = flow.getBoundingClientRect().left;
    for (const el of blocksEls()) {
      const x = el.getBoundingClientRect().left - left;
      if (x >= view * stride - 4) return Number(el.dataset.i);
    }
    return -1;
  }

  function show(animate = true) {
    flow.style.transition = animate ? '' : 'none';
    flow.style.transform = `translateX(${-view * stride}px)`;
    counter.textContent = `${view + 1} / ${views}`;
    fill.style.width = `${views > 1 ? (view / (views - 1)) * 100 : 100}%`;
    anchor = firstOnView();
    store.set(`pos:${id}`, String(anchor));
  }

  function relayout() {
    const keep = anchor;
    layout();
    view = keep >= 0 ? viewOf(keep) : 0;
    show(false);
  }

  function go(delta: number) {
    const target = view + delta;
    if (target < 0) {
      if (prevId) location.hash = `#/read/${prevId}${cp}${cp ? '&' : '?'}at=end`;
      return;
    }
    if (target >= views) {
      if (nextId) location.hash = `#/read/${nextId}${cp}${cp ? '&' : '?'}at=start`;
      return;
    }
    view = target;
    show();
  }

  function toggleImmersive() {
    const on = !document.body.classList.contains('immersive');
    document.body.classList.toggle('immersive', on);
    if (on) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    requestAnimationFrame(relayout);
  }

  // Initial layout, then jump to the right place.
  layout();
  view = startAt === 'end' ? views - 1 : anchor >= 0 ? viewOf(anchor) : 0;
  show(false);
  book.focus({ preventScroll: true });

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (['ArrowRight', 'PageDown', 'ArrowDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) go(1);
    else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) go(-1);
    else if (e.key === 'f' || e.key === 'F') toggleImmersive();
    else if (e.key === 'Home') (view = 0), show();
    else if (e.key === 'End') (view = views - 1), show();
    else return;
    e.preventDefault();
  };

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'prev') return go(-1);
    if (act === 'next') return go(1);
    if (act === 'immersive') return toggleImmersive();
    if (act === 'smaller' || act === 'larger') {
      const i = FONT_SIZES.indexOf(fs);
      fs = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (i < 0 ? 4 : i) + (act === 'larger' ? 1 : -1)))];
      store.set('fontSize', String(fs));
      return relayout();
    }
    // Tap the left or right edge of the page to flip, like a book.
    if (!t.closest('.book') || t.closest('a') || getSelection()?.toString()) return;
    const r = book.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.3) go(-1);
    else if (x > 0.7) go(1);
  };

  let touchX: number | null = null;
  const onTouchStart = (e: TouchEvent) => (touchX = e.touches[0].clientX);
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(relayout, 120);
  };
  const onFullscreen = () => {
    if (!document.fullscreenElement && document.body.classList.contains('immersive')) {
      document.body.classList.remove('immersive');
      requestAnimationFrame(relayout);
    }
  };

  window.addEventListener('keydown', onKey);
  reader.addEventListener('click', onClick);
  book.addEventListener('touchstart', onTouchStart, { passive: true });
  book.addEventListener('touchend', onTouchEnd);
  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onFullscreen);
  document.fonts?.ready.then(relayout);

  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('fullscreenchange', onFullscreen);
    // Read mode carries over when flipping into the next scene; leaving the reader ends it.
  };
}
