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
}

export interface EpisodeRef {
  id: string;
  code: string;
  name: string;
  tag: string;
  synopsis: string;
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
  id: string; // char_xxx
  name: string;
  episodes: OperatorHit[];
}
