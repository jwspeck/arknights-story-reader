import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanText, parseArgs, parseScript, portraitToOperator } from '../src/parser';

test('spoken lines, narration and scene breaks', () => {
  const { blocks } = parseScript(`[HEADER(key="x", is_skippable=true)]
[Background(image="bg_a")]
[name="Amiya"]  Doctor, {@nickname}!
The wind howls.
[Background(image="bg_b")]
[Background(image="bg_b")]
[name="Kal'tsit"]Hm.`);
  assert.deepEqual(blocks, [
    { t: 'line', speaker: 'Amiya', text: 'Doctor, Doctor!' },
    { t: 'narration', text: 'The wind howls.' },
    { t: 'scene' },
    { t: 'line', speaker: "Kal'tsit", text: 'Hm.' },
  ]);
});

test('multiline rows join into one line', () => {
  const { blocks } = parseScript(`[multiline(name="Eblana")]As for the party...
[multiline(name="Eblana")]Don't tell me.
[name="W"]Ha.`);
  assert.deepEqual(blocks, [
    { t: 'line', speaker: 'Eblana', text: "As for the party... Don't tell me." },
    { t: 'line', speaker: 'W', text: 'Ha.' },
  ]);
});

test('decisions become a choice with branches that merge', () => {
  const { blocks } = parseScript(`[Decision(options="Yes.;No.", values="1;2")]
[Predicate(references="1")]
[name="A"]Good.
[Predicate(references="2")]
[name="A"]Pity.
[Predicate(references="1;2")]
[name="A"]Anyway.`);
  assert.deepEqual(blocks, [
    { t: 'choice', options: ['Yes.', 'No.'] },
    { t: 'branch', options: ['Yes.'] },
    { t: 'line', speaker: 'A', text: 'Good.' },
    { t: 'branch', options: ['No.'] },
    { t: 'line', speaker: 'A', text: 'Pity.' },
    { t: 'merge' },
    { t: 'line', speaker: 'A', text: 'Anyway.' },
  ]);
});

test('subtitles and multi stickers become captions', () => {
  const { blocks } = parseScript(`[Subtitle(text="Act 1\\n——\\nScene 1", x=300)]
[Sticker(id="st1", multi = true, text="What is", x=1)]
[Sticker(id="st1", multi = true, text="kung fu?")]
[Sticker(id="st1", multi = true, text="\\nNext.")]
[stickerclear]`);
  assert.deepEqual(blocks, [
    { t: 'caption', text: 'Act 1\n——\nScene 1' },
    { t: 'caption', text: "What is kung fu?\nNext." },
  ]);
});

test('portraits map to operator ids', () => {
  assert.equal(portraitToOperator('char_002_amiya_1#5'), 'char_002_amiya');
  assert.equal(portraitToOperator('avg_450_necras_1#13$2'), 'char_450_necras');
  assert.equal(portraitToOperator('avg_npc_1698_1#1$1'), null);
  const { portraits } = parseScript('[Character(name="char_130_doberm_ex")]\n[charslot(slot="m",name="avg_450_necras_1#1$2")]');
  assert.deepEqual([...portraits].sort(), ['char_130_doberm', 'char_450_necras']);
});

test('rich text is reduced to safe italics', () => {
  assert.equal(cleanText('<color=#FF4200><i>Run</i></color> & <b>hide</b>'), '<i>Run</i> &amp; hide');
  assert.equal(cleanText('a <script>'), 'a &lt;script&gt;');
  assert.deepEqual(parseArgs('a="x, y", B = 2, c=true'), { a: 'x, y', b: '2', c: 'true' });
});
