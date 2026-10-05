// Works out which named characters are in a scene, and how long a scene is to read.
// Runs at build time over the whole story so it can tell names ("Manfred") from role labels ("Reunion Member").

import type { Block, CastMember } from './types';

/** Average adult silent reading speed for English prose (Brysbaert 2019). */
export const WORDS_PER_MINUTE = 238;

// Words the story capitalises like names but that are peoples, ranks or roles. A speaker label containing
// one ("Sarkaz Drifter", "Royal Guard", "Infected Patrol Unit") is a description, not a name.
const NOT_NAMES = new Set([
  'Sarkaz', 'Lungmenite', 'Sargonian', 'Kazimierzian', 'Iberian', 'Ursus', 'Victorian', 'Londinium', 'Reunion',
  'Infected', 'Guard', 'Shieldguard', 'Swordguard', 'Knight', 'Scout', 'Operator', 'Operators', 'Unit',
  'Squadmember', 'Member', 'Resident', 'Supervisor', 'Drifter', 'Confessarius', 'Sentinel', 'Censor', 'Host',
]);

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Blocks shown as a line of text in the reader. */
export function textBlocks(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.t === 'line' || b.t === 'narration' || b.t === 'caption') out.push(plain(b.text));
    else if (b.t === 'choice') out.push(...b.options.map(plain));
  }
  return out;
}

export function sceneStats(blocks: Block[]): { lines: number; words: number } {
  const texts = textBlocks(blocks);
  const words = texts.reduce((n, t) => n + (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0), 0);
  return { lines: texts.length, words };
}

interface Matcher {
  name: string;
  operatorId?: string;
  re: RegExp | null; // null: only counts when speaking
}

export class CastFinder {
  private matchers: Matcher[] = [];

  /**
   * @param scenes every scene's blocks, used to learn which speaker labels are real names
   * @param operators playable characters, which always count as names
   * @param stoplist names never matched in text (they still count when speaking)
   */
  constructor(scenes: Block[][], operators: { id: string; name: string }[], stoplist: Set<string>) {
    const corpus = scenes.flatMap(textBlocks).join('\n');
    const lowerCounts = new Map<string, number>();
    for (const w of corpus.match(/\b[a-z][a-z'-]*\b/g) ?? []) lowerCounts.set(w, (lowerCounts.get(w) ?? 0) + 1);
    const lowerCount = (word: string) => lowerCounts.get(word.toLowerCase()) ?? 0;
    const common = (word: string) => lowerCount(word) >= 3;
    // Capitalised mid-sentence, i.e. used as a proper noun rather than starting a sentence.
    const midSentence = (name: string) => new RegExp(`(?<=[\\p{Ll},;] )${reEsc(name)}(?![\\w'])`, 'gu');
    const midCount = (name: string) => corpus.match(midSentence(name))?.length ?? 0;

    const byName = new Map<string, Matcher>();
    const add = (name: string, operatorId?: string) => {
      if (byName.has(name)) return;
      let re: RegExp | null = null;
      if (!stoplist.has(name)) {
        // Ordinary words like "Will" or "Red" only count as a name mid-sentence.
        re = name.split(/\s+/).some(common) ? midSentence(name) : new RegExp(`(?<![\\w'])${reEsc(name)}(?![\\w'])`, 'g');
      }
      byName.set(name, { name, operatorId, re });
    };

    for (const o of operators) add(o.name, o.id);
    add('Doctor');

    const speakers = new Set<string>();
    for (const blocks of scenes) for (const b of blocks) if (b.t === 'line') speakers.add(b.speaker);
    for (const s of speakers) if (this.isName(s, lowerCount, midCount)) add(s);

    this.matchers = [...byName.values()];
  }

  private isName(label: string, lowerCount: (w: string) => number, midCount: (n: string) => number): boolean {
    if (!label || /^['"*]|[?&#]|\bvoice\b|\d$/i.test(label)) return false;
    const words = label.split(/\s+/);
    if (words.some((w) => NOT_NAMES.has(w))) return false;
    if (words.some((w) => !/^\p{Lu}/u.test(w) && w !== 'of' && w !== 'de')) return false; // "Some seven..."
    if (words.length > 1 && /^[A-Z]$/.test(words[words.length - 1])) return false; // "Soldier A"
    // Someone has to call them this mid-sentence ("...said Tatiana"), which rules out "Female" or "Rioter".
    const mid = midCount(label);
    if (!words.some((w) => w.length > 2 && lowerCount(w) >= 3)) return mid >= 1;
    // A label that is also an ordinary word must be used as a proper noun more often than not:
    // "Duke of Caster" and "Ace" yes, "Will" no.
    return mid >= 2 && mid >= lowerCount(label);
  }

  /** Named characters in a scene, most present first. */
  find(blocks: Block[]): CastMember[] {
    const said = new Map<string, number>();
    for (const b of blocks) if (b.t === 'line') said.set(b.speaker, (said.get(b.speaker) ?? 0) + 1);
    const text = textBlocks(blocks).join('\n');
    const cast: CastMember[] = [];
    for (const m of this.matchers) {
      const lines = said.get(m.name) ?? 0;
      const mentions = m.re ? (text.match(m.re)?.length ?? 0) : 0;
      if (lines || mentions) cast.push({ name: m.name, operatorId: m.operatorId, lines, mentions });
    }
    return cast.sort((a, b) => b.lines - a.lines || b.mentions - a.mentions || a.name.localeCompare(b.name));
  }
}
