// Turns an Arknights story script (.txt) into readable blocks.
// Only text-bearing commands are kept; staging (sound, camera, portraits) is dropped,
// except that portraits are collected so we know who is on screen.

import type { Block } from './types';

export interface ParsedScript {
  blocks: Block[];
  portraits: Set<string>; // operator ids (char_xxx_yyy) whose portrait appears
  unknown: Map<string, number>; // commands we ignored, for debugging
}

const IGNORED = new Set(
  [
    'header', 'dialog', 'delay', 'daley', 'delau', 'blocker', 'playsound', 'stopsound', 'soundvolume',
    'playmusic', 'stopmusic', 'musicvolume', 'camerashake', 'cameraeffect', 'imagetween', 'imagerotate',
    'backgroundtween', 'largebgtween', 'bgeffect', 'effect', 'imgeffect', 'characteraction', 'charactercutin',
    'focusout', 'focusparam', 'curtain', 'tutorial', 'battle', 'inputblocker', 'popupdialog', 'interlude',
    'animtextclean', 'stickerclear', 'cgitem', 'hidecgitem', 'showitem', 'hideitem', 'avgdisplay', 'theater',
    'video', 'skipnode', 'gridbg', 'duration', 'verticalbg', 'hide', 'show', 'timerclear', 'timersticker',
  ],
);

/** Parses `key="value", key2=1.5` argument lists. Keys are lower-cased. */
export function parseArgs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][\w]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s)]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1].toLowerCase()] = m[2] ?? m[3];
  return out;
}

/** Normalises in-game rich text to the small HTML subset the reader renders. */
export function cleanText(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\{@nickname\}/g, 'Doctor')
    .replace(/<\/?(?:color|size|b|p)(?:=[^>]*)?>|<\/>/gi, '')
    .replace(/<(\/?)i>/gi, '\u0001$1i\u0002') // protect italics through escaping
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\u0001(\/?)i\u0002/g, '<$1i>')
    .trim();
}

/** Maps a portrait id such as "char_002_amiya_1#5" or "avg_450_necras_1#13$2" to "char_002_amiya". */
export function portraitToOperator(p: string): string | null {
  const m = /^(?:char|avg)_(\d+)_([a-z0-9]+)/i.exec(p);
  return m ? `char_${m[1]}_${m[2].toLowerCase()}` : null;
}

export function parseScript(src: string): ParsedScript {
  const blocks: Block[] = [];
  const portraits = new Set<string>();
  const unknown = new Map<string, number>();
  let choiceOptions: string[] = [];
  let choiceValues: string[] = [];
  let lastBg = '';
  let multi: { speaker: string; parts: string[] } | null = null;
  let sticker: string[] | null = null;

  const flushMulti = () => {
    if (multi) blocks.push({ t: 'line', speaker: multi.speaker, text: multi.parts.join(' ') });
    multi = null;
  };
  const flushSticker = () => {
    if (sticker?.length) blocks.push({ t: 'caption', text: sticker.join('') });
    sticker = null;
  };
  const push = (b: Block) => {
    flushMulti();
    flushSticker();
    // Collapse runs of scene breaks and avoid a leading one.
    if (b.t === 'scene' && (blocks.length === 0 || blocks[blocks.length - 1].t === 'scene')) return;
    blocks.push(b);
  };

  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;

    // [name="Amiya"]  text: a spoken line.
    const nameTag = /^\[\s*name\s*=\s*"([^"]*)"\s*\](.*)$/i.exec(line);
    if (nameTag) {
      const text = cleanText(nameTag[2]);
      if (text) push({ t: 'line', speaker: cleanText(nameTag[1]), text });
      continue;
    }

    const m = /^\[\s*([A-Za-z]+)\s*(?:\((.*)\))?\s*\](.*)$/.exec(line);
    if (!m) {
      // Untagged row: narration.
      const text = cleanText(line);
      if (text) push({ t: 'narration', text });
      continue;
    }
    const cmd = m[1].toLowerCase();
    const args = parseArgs(m[2] ?? '');
    const rest = m[3];

    switch (cmd) {
      case 'multiline': {
        const speaker = cleanText(args.name ?? '');
        const text = cleanText(rest);
        if (multi && multi.speaker !== speaker) flushMulti();
        flushSticker();
        if (!multi) multi = { speaker, parts: [] };
        if (text) multi.parts.push(text);
        if (args.end === 'true') flushMulti();
        break;
      }
      case 'subtitle': {
        const text = cleanText(args.text ?? '');
        if (text) push({ t: 'caption', text });
        break;
      }
      case 'sticker': {
        const text = cleanText(args.text ?? '');
        if (!text) break;
        // Multi stickers continue the previous one until a new one is positioned (x=...).
        if (args.multi === 'true' && sticker && args.x === undefined) {
          sticker.push((/^\s*\\n/.test(args.text) ? '\n' : ' ') + text);
        } else {
          flushMulti();
          flushSticker();
          sticker = [text];
          if (args.multi !== 'true') flushSticker();
        }
        break;
      }
      case 'animtext': {
        const text = cleanText(rest.replace(/<\/p>|<\/>\s*/g, '\n'));
        if (text) push({ t: 'caption', text });
        break;
      }
      case 'decision': {
        choiceOptions = (args.options ?? '').split(';').map(cleanText);
        choiceValues = (args.values ?? '').split(';');
        push({ t: 'choice', options: choiceOptions });
        break;
      }
      case 'predicate': {
        const refs = (args.references ?? '').split(';');
        if (refs.length >= choiceValues.length) {
          push({ t: 'merge' });
        } else {
          const opts = refs.map((r) => choiceOptions[choiceValues.indexOf(r)]).filter((o) => o !== undefined);
          push({ t: 'branch', options: opts });
        }
        break;
      }
      case 'background':
      case 'largebg':
      case 'image': {
        const img = args.image ?? '';
        if (img && img !== lastBg) push({ t: 'scene' });
        if (cmd !== 'image') lastBg = img;
        break;
      }
      case 'character':
      case 'charslot': {
        for (const k of ['name', 'name2']) {
          const op = args[k] && portraitToOperator(args[k]);
          if (op) portraits.add(op);
        }
        break;
      }
      default:
        if (!IGNORED.has(cmd)) unknown.set(cmd, (unknown.get(cmd) ?? 0) + 1);
    }
  }
  flushMulti();
  flushSticker();
  while (blocks.length && blocks[blocks.length - 1].t === 'scene') blocks.pop();
  // A trailing merge with nothing after it is noise.
  while (blocks.length && blocks[blocks.length - 1].t === 'merge') blocks.pop();
  return { blocks, portraits, unknown };
}
