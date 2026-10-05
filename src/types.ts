// Shared shapes for the generated data in public/data/.

export type Block =
  | { t: 'line'; speaker: string; text: string }
  | { t: 'narration'; text: string }
  | { t: 'caption'; text: string }
  | { t: 'choice'; options: string[] }
  | { t: 'branch'; options: string[] } // following blocks belong to these choices
  | { t: 'merge' } // branches rejoin
  | { t: 'scene' }; // background change

export interface Episode {
  id: string;
  code: string;
  name: string;
  tag: string; // "Before Operation", "After Operation", "Interlude"
  chapterId: string;
  blocks: Block[];
  lines: number; // lines of text shown in the reader
  words: number;
  cast: CastMember[];
}

/** An operator's in-game file, built from the excel tables. Fields ending in `html` are pre-escaped. */
export interface Profile {
  id: string;
  name: string;
  number: string; // "R001"
  rarity: number; // stars
  usage: string; // recruitment blurb
  quote: string;
  obtain: string;
  affiliation: { label: string; name: string }[]; // nation / allegiance / squad, then other ties
  info: { key: string; value: string }[]; // from the Basic Info file: race, birthplace, height...
  illustrators: string[];
  voices: { lang: string; names: string[] }[];
  forms: ProfileForm[]; // usually one; Amiya has three classes
  potentials: string[];
  baseSkills: { name: string; room: string; html: string }[];
  files: { title: string; text: string }[];
  voiceLines: { title: string; text: string }[];
}

/** External pages for a voice artist (public/data/voice-links.json, keyed by name). */
export interface VoiceLink {
  imdb?: string; // nm1234567
  wikipedia?: string; // full en.wikipedia.org URL
}

/** One row of public/data/roster.json: what the browse pages group and sort operators by. */
export interface RosterEntry {
  id: string;
  name: string;
  rarity: number;
  className: string;
  branch: string;
  inStory: boolean; // has scenes in the main story
  factions: { label: string; name: string }[]; // Nation / Allegiance / Squad / Also tied to
  races: string[];
  birthplace: string;
  height: string; // as written in the file
  heightCm: number | null;
  voices: { lang: string; name: string }[];
}

export interface ProfileForm {
  id: string;
  className: string; // "Caster"
  branch: string; // "Core Caster"
  position: string; // "Ranged"
  tags: string[];
  stats: Stats; // max promotion and level, full potential, max trust
  range: [number, number][]; // [row, col] cells, the operator at [0, 0]
  traitHtml: string;
  talents: { name: string; html: string }[];
  skills: ProfileSkill[];
  modules: ProfileModule[];
}

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  res: number;
  redeploy: number; // seconds
  cost: number;
  block: number;
  interval: number; // seconds between attacks
}

export interface ProfileSkill {
  name: string;
  level: string; // "Mastery 3"
  activation: string; // "Manual", "Auto", "Passive"
  recovery: string; // "Auto Recovery", "Offensive Recovery"...
  spCost: number;
  initSp: number;
  duration: number;
  html: string;
  range: [number, number][] | null;
}

export interface ProfileModule {
  name: string;
  code: string; // "CCR-Y"
  bonus: { stat: keyof Stats; value: number }[]; // at stage 3
  traitHtml: string; // what stage 3 adds to or makes of the trait
  talents: { name: string; html: string }[]; // talents as stage 3 changes them
  story: string;
}

export interface CastMember {
  name: string;
  operatorId?: string; // set when the character is a playable operator
  lines: number; // lines spoken
  mentions: number; // times named in the text
}

export interface EpisodeRef {
  id: string;
  code: string;
  name: string;
  tag: string;
  synopsis: string; // the game's skip-story summary
  lines: number;
  words: number;
  cast: CastMember[];
}

export interface Chapter {
  id: string;
  num: number;
  name: string;
  episodes: EpisodeRef[];
}

export interface Index {
  dataVersion: string;
  builtAt: string;
  chapters: Chapter[];
}

export interface OperatorHit {
  id: string; // episode id
  lines: number; // lines spoken
  mentions: number; // times named in others' text
  onScreen: boolean; // portrait shown
}

export interface Operator {
  id: string; // char_xxx, or npc-<slug> for story characters who aren't operators
  name: string;
  episodes: OperatorHit[];
}

/** A named story character who isn't a playable operator (public/data/npcs.json). */
export interface Npc extends Operator {
  files: { title: string; text: string }[]; // intel files, for the few NPCs the game has them for
}
