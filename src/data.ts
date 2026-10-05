import type { Chapter, Episode, EpisodeRef, Index, Npc, Operator, Profile, RosterEntry, VoiceLink } from './types';

const cache = new Map<string, Promise<unknown>>();
function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`data/${path}`).then((r) => {
        if (!r.ok) throw new Error(`Could not load data/${path} (${r.status}). Did you run \`npm run build-data\`?`);
        return r.json();
      }),
    );
  }
  return cache.get(path) as Promise<T>;
}

export const getIndex = () => load<Index>('index.json');
export const getOperators = () => load<Operator[]>('operators.json');
export const getEpisode = (id: string) => load<Episode>(`episodes/${id}.json`);
export const getNpcs = () => load<Npc[]>('npcs.json');

/** An operator or NPC by id; both can be followed through the story. */
export async function findCharacter(id: string): Promise<Operator | undefined> {
  const list = id.startsWith('npc-') ? await getNpcs() : await getOperators();
  return list.find((o) => o.id === id);
}

export const characterHref = (id: string) => (id.startsWith('npc-') ? `#/npc/${id}` : `#/operator/${id}`);

export const getVoiceLinks = (): Promise<Record<string, VoiceLink>> =>
  load<Record<string, VoiceLink>>('voice-links.json').catch(() => ({}));
export const getRoster = () => load<RosterEntry[]>('roster.json');
/** The operator's file, or null when there isn't one (rebuild data to add them). */
export const getProfile = (id: string) => load<Profile>(`profiles/${id}.json`).catch(() => null);

export interface EpisodeInfo extends EpisodeRef {
  chapter: Chapter;
}

export async function episodeMap(): Promise<Map<string, EpisodeInfo>> {
  const idx = await getIndex();
  const m = new Map<string, EpisodeInfo>();
  for (const chapter of idx.chapters) for (const e of chapter.episodes) m.set(e.id, { ...e, chapter });
  return m;
}

/** A reading context decides what "next" and "previous" mean. */
export type Context = { kind: 'story' } | { kind: 'op'; opId: string };

export function parseContext(s: string | null): Context {
  if (s?.startsWith('op:')) return { kind: 'op', opId: s.slice(3) };
  return { kind: 'story' };
}

export function contextParam(c: Context): string {
  return c.kind === 'op' ? `?ctx=op:${c.opId}` : '';
}

/** Episode ids in reading order for a context. */
export async function sequence(c: Context): Promise<string[]> {
  const idx = await getIndex();
  const all = idx.chapters.flatMap((ch) => ch.episodes.map((e) => e.id));
  if (c.kind === 'story') return all;
  const op = await findCharacter(c.opId);
  const ids = new Set(op?.episodes.map((h) => h.id));
  return all.filter((id) => ids.has(id));
}

export function chapterLabel(ch: Chapter): string {
  return `Episode ${String(ch.num).padStart(2, '0')}`;
}
