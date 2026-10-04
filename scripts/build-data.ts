// Reads the Arknights EN dump and writes the reader's data to public/data/.
//
//   npm run build-data -- [path/to/en/gamedata]
//
// Defaults to data-src/en/gamedata (where `npm run fetch-data` puts it), or $AK_GAMEDATA.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseScript } from '../src/parser';
import type { Chapter, Episode, Index, Operator, OperatorHit } from '../src/types';

const root = resolve(process.argv[2] ?? process.env.AK_GAMEDATA ?? 'data-src/en/gamedata');
const out = resolve('public/data');
if (!existsSync(join(root, 'excel/story_review_table.json'))) {
  console.error(`No dump found at ${root}. Run \`npm run fetch-data\` or pass the path to en/gamedata.`);
  process.exit(1);
}

const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const readText = (p: string) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '');

// Names too common as ordinary words to count as a mention (they still count when the operator speaks).
const MENTION_STOPLIST = new Set(['May', 'Doc']);

interface ReviewEntry {
  id: string;
  name: string;
  entryType: string;
  infoUnlockDatas: {
    storyId: string;
    storySort: number;
    storyCode: string | null;
    storyName: string;
    avgTag: string | null;
    storyTxt: string;
    storyInfo: string | null;
  }[];
}

const review: Record<string, ReviewEntry> = readJson('excel/story_review_table.json');
const chars: Record<string, { name: string; profession: string }> = readJson('excel/character_table.json');
const dataVersion = readText('excel/data_version.txt').match(/VersionControl:(\S+)/)?.[1] ?? 'unknown';

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'episodes'), { recursive: true });

// Main story only for now; other entry types (ACTIVITY, MINI_ACTIVITY, operator records) come later.
const mainline = Object.values(review)
  .filter((e) => e.entryType === 'MAINLINE')
  .map((e) => ({ e, num: Number(e.id.replace(/\D/g, '')) }))
  .sort((a, b) => a.num - b.num);

const operators = Object.entries(chars)
  .filter(([id, c]) => id.startsWith('char_') && c.profession !== 'TOKEN' && c.profession !== 'TRAP')
  .map(([id, c]) => ({
    id,
    name: c.name,
    re: MENTION_STOPLIST.has(c.name)
      ? null
      : new RegExp(`(?<![\\w'])${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w'])`, 'g'),
    hits: [] as OperatorHit[],
  }));

const chapters: Chapter[] = [];
const unknown = new Map<string, number>();
let episodeCount = 0;

for (const { e, num } of mainline) {
  const chapter: Chapter = { id: e.id, num, name: e.name, episodes: [] };
  for (const s of [...e.infoUnlockDatas].sort((a, b) => a.storySort - b.storySort)) {
    const src = readText(`story/${s.storyTxt}.txt`);
    if (!src) {
      console.warn(`missing script: ${s.storyTxt}`);
      continue;
    }
    const parsed = parseScript(src);
    for (const [k, v] of parsed.unknown) unknown.set(k, (unknown.get(k) ?? 0) + v);

    const ep: Episode = {
      id: s.storyId,
      code: s.storyCode ?? '',
      name: s.storyName,
      tag: s.avgTag ?? '',
      chapterId: e.id,
      blocks: parsed.blocks,
    };
    writeFileSync(join(out, 'episodes', `${ep.id}.json`), JSON.stringify(ep));
    const synopsis = s.storyInfo ? readText(`story/[uc]${s.storyInfo}.txt`).trim() : '';
    chapter.episodes.push({ id: ep.id, code: ep.code, name: ep.name, tag: ep.tag, synopsis });
    episodeCount++;

    // Who is in this episode: speaking lines, mentions in anyone's text, and portraits.
    const said = new Map<string, number>();
    let allText = '';
    for (const b of parsed.blocks) {
      if (b.t === 'line') said.set(b.speaker, (said.get(b.speaker) ?? 0) + 1);
      if ('text' in b) allText += b.text + '\n';
      if (b.t === 'choice' || b.t === 'branch') allText += b.options.join('\n') + '\n';
    }
    for (const op of operators) {
      const lines = said.get(op.name) ?? 0;
      const mentions = op.re ? (allText.match(op.re)?.length ?? 0) : 0;
      const onScreen = parsed.portraits.has(op.id);
      if (lines || mentions || onScreen) op.hits.push({ id: ep.id, lines, mentions, onScreen });
    }
  }
  chapters.push(chapter);
}

const index: Index = { dataVersion, builtAt: new Date().toISOString(), chapters };
writeFileSync(join(out, 'index.json'), JSON.stringify(index));

const opsOut: Operator[] = operators
  .filter((o) => o.hits.length)
  .map((o) => ({ id: o.id, name: o.name, episodes: o.hits }))
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(out, 'operators.json'), JSON.stringify(opsOut));

console.log(
  `Wrote ${chapters.length} chapters, ${episodeCount} episodes, ${opsOut.length} operators (data ${dataVersion}) to ${out}`,
);
if (unknown.size) {
  const list = [...unknown].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`);
  console.log(`Ignored unrecognised commands: ${list.join(', ')}`);
}
