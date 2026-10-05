import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CastFinder, sceneStats } from '../src/cast';
import type { Block } from '../src/types';

test('scene stats count reader lines and words', () => {
  const blocks: Block[] = [
    { t: 'line', speaker: 'W', text: "Ha, <i>don't</i> move." },
    { t: 'scene' },
    { t: 'narration', text: 'Smoke rises.' },
    { t: 'choice', options: ['Wait.', 'Run!'] },
  ];
  assert.deepEqual(sceneStats(blocks), { lines: 4, words: 7 });
});

test('cast keeps names and drops role labels', () => {
  const scenes: Block[][] = [
    [
      { t: 'line', speaker: 'Manfred', text: 'The guard will stay here. I will go.' },
      { t: 'line', speaker: 'Royal Guard', text: 'Yes, Manfred. We guard the gate, as Ines said.' },
      { t: 'line', speaker: 'Will', text: 'I will ask the guard if Ines is coming.' },
      { t: 'narration', text: 'Will you go? The guard, the guard, the guard.' },
    ],
  ];
  const finder = new CastFinder(scenes, [{ id: 'char_4087_ines', name: 'Ines' }], new Set());
  assert.deepEqual(finder.find(scenes[0]), [
    { name: 'Manfred', operatorId: undefined, lines: 1, mentions: 1 },
    { name: 'Ines', operatorId: 'char_4087_ines', lines: 0, mentions: 2 },
  ]);
});
