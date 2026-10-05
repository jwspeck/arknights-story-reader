// Reads the Arknights EN dump and writes the reader's data to public/data/.
//
//   npm run build-data -- [path/to/en/gamedata]
//
// Defaults to data-src/en/gamedata (where `npm run fetch-data` puts it), or $AK_GAMEDATA.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CastFinder, sceneStats } from '../src/cast';
import { parseScript, type ParsedScript } from '../src/parser';
import { plainText, ProfileBuilder, rosterEntry } from './profiles';
import type { Chapter, Episode, Index, Npc, Operator, OperatorHit, RosterEntry } from '../src/types';

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
const npcHits = new Map<string, OperatorHit[]>(); // named non-operators, by name

// Parse everything first: telling character names from role labels needs the whole story.
const scripts = new Map<string, ParsedScript>();
for (const { e } of mainline) {
  for (const s of e.infoUnlockDatas) {
    const src = readText(`story/${s.storyTxt}.txt`);
    if (src) scripts.set(s.storyId, parseScript(src));
    else console.warn(`missing script: ${s.storyTxt}`);
  }
}
const castFinder = new CastFinder(
  [...scripts.values()].map((p) => p.blocks),
  operators,
  MENTION_STOPLIST,
);

for (const { e, num } of mainline) {
  const chapter: Chapter = { id: e.id, num, name: e.name, episodes: [] };
  for (const s of [...e.infoUnlockDatas].sort((a, b) => a.storySort - b.storySort)) {
    const parsed = scripts.get(s.storyId);
    if (!parsed) continue;
    for (const [k, v] of parsed.unknown) unknown.set(k, (unknown.get(k) ?? 0) + v);

    const ep: Episode = {
      id: s.storyId,
      code: s.storyCode ?? '',
      name: s.storyName,
      tag: s.avgTag ?? '',
      chapterId: e.id,
      blocks: parsed.blocks,
      ...sceneStats(parsed.blocks),
      cast: castFinder.find(parsed.blocks),
    };
    for (const c of ep.cast) {
      if (c.operatorId) continue;
      if (!npcHits.has(c.name)) npcHits.set(c.name, []);
      npcHits.get(c.name)!.push({ id: ep.id, lines: c.lines, mentions: c.mentions, onScreen: false });
    }
    writeFileSync(join(out, 'episodes', `${ep.id}.json`), JSON.stringify(ep));
    const synopsis = s.storyInfo ? readText(`story/[uc]${s.storyInfo}.txt`).trim() : '';
    chapter.episodes.push({ id: ep.id, code: ep.code, name: ep.name, tag: ep.tag, synopsis, lines: ep.lines, words: ep.words, cast: ep.cast });
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

// NPCs: every named character in the story who isn't an operator, plus intel files where the game has them.
const handbook = readJson('excel/handbook_info_table.json');
const npcFiles = new Map<string, Npc['files']>();
for (const n of Object.values<{ npcId: string; name: string }>(handbook.npcDict)) {
  const files = (handbook.handbookDict[n.npcId]?.storyTextAudio ?? []).flatMap(
    (sec: { storyTitle: string; stories: { storyText: string }[] }) =>
      sec.stories.map((st) => ({ title: sec.storyTitle, text: plainText(st.storyText ?? '') })),
  );
  if (files.length) npcFiles.set(n.name, files);
}
const slug = (name: string) =>
  'npc-' + name.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
const npcsOut: Npc[] = [...npcHits]
  .map(([name, episodes]) => ({ id: slug(name), name, episodes, files: npcFiles.get(name) ?? [] }))
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(out, 'npcs.json'), JSON.stringify(npcsOut));

// Operator files: stats, skills, modules, archives and voice lines, one JSON per operator.
const profileTables = Object.fromEntries(
  [
    'character_table', 'char_patch_table', 'skill_table', 'uniequip_table', 'battle_equip_table', 'range_table',
    'handbook_info_table', 'handbook_team_table', 'charword_table', 'skin_table', 'building_data', 'gamedata_const',
  ].map((name) => [name, name === 'character_table' ? chars : readJson(`excel/${name}.json`)]),
);
const profiles = new ProfileBuilder(profileTables);
mkdirSync(join(out, 'profiles'), { recursive: true });
let profileCount = 0;
const roster: RosterEntry[] = [];
const inStory = new Set(opsOut.map((o) => o.id));
for (const op of operators) {
  try {
    const p = profiles.build(op.id);
    writeFileSync(join(out, 'profiles', `${op.id}.json`), JSON.stringify(p));
    roster.push(rosterEntry(p, inStory.has(op.id)));
    profileCount++;
  } catch (err) {
    console.warn(`profile ${op.id} (${op.name}) failed: ${(err as Error).message}`);
  }
}
roster.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(out, 'roster.json'), JSON.stringify(roster));
// Voice artist IMDb/Wikipedia links, if `npm run fetch-voice-links` has been run.
const voiceLinks = resolve('data-src/voice-links.json');
writeFileSync(join(out, 'voice-links.json'), existsSync(voiceLinks) ? readFileSync(voiceLinks, 'utf8') : '{}');

console.log(
  `Wrote ${chapters.length} chapters, ${episodeCount} episodes, ${opsOut.length} operators, ${npcsOut.length} NPCs, ${profileCount} operator files (data ${dataVersion}) to ${out}`,
);
if (unknown.size) {
  const list = [...unknown].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`);
  console.log(`Ignored unrecognised commands: ${list.join(', ')}`);
}
