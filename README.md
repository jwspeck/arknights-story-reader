# Arknights Story Reader

A local, text-only reader for the Arknights main story (Global/EN). Scenes are paged like a book,
with a full-screen read mode, and you can browse by chapter or follow a single operator through
every scene they speak in, appear in, or are named in.

## Setup

Needs Node 20+ and git.

```sh
npm install
npm run fetch-data   # sparse-clones the EN story + index files (~80 MB) into data-src/
npm run build-data   # parses them into public/data/
npm run dev          # open http://localhost:5173
```

To refresh after a game update: `npm run fetch-data && npm run build-data`.
If you already have a dump elsewhere: `npm run build-data -- /path/to/en/gamedata`.

Data comes from [ArknightsAssets/ArknightsGamedata](https://github.com/ArknightsAssets/ArknightsGamedata).
The story text belongs to Hypergryph/Yostar; keep the dump and the built data local.

## Reading

| Key | Action |
| --- | --- |
| → / Space / PgDn | Next page (continues into the next scene at the end) |
| ← / Shift+Space / PgUp | Previous page |
| Home / End | First / last page of the scene |
| F | Toggle read mode (full screen, text only) |

You can also click or tap the left or right edge of the page, or swipe. Wide windows show a
two-page spread. Your place in each scene and your text size are remembered in the browser.

Clicking a scene in a chapter opens its summary page first: the game's skip-story overview, the named
characters in it, how many lines it has and roughly how long it takes to read (at 238 words per minute),
and links to the previous and next scenes.

When you open a scene from an operator's page, next/previous walk through only that operator's
scenes, their lines are marked in the margin, and their name is highlighted where others mention it.

## How it works

- `scripts/build-data.ts` reads `excel/story_review_table.json` (the story index) and every main-story
  script, and writes `public/data/index.json`, `operators.json`, and one JSON file per scene.
- `src/parser.ts` turns the game's script format (`[name="Amiya"] text`, narration rows,
  `Decision`/`Predicate` choices, subtitles, stickers) into simple blocks and drops staging commands.
- `src/reader.ts` lays a scene out in CSS columns and flips between them.
- Operator matching: a scene counts if the operator speaks (speaker name matches), their portrait is
  shown, or their name appears as a whole word in the text. "May" and "Doc" are excluded from
  name matching because they collide with ordinary words.
- `scripts/profiles.ts` writes `public/data/profiles/<id>.json` for every operator: affiliations and Basic Info,
  stats at max promotion and level with full potential and max trust, trait, talents, skills at their top
  rank, modules at stage 3, potential, base skills, archive files and voice lines. `src/profile-view.ts`
  shows it at the top of the operator page.
- `src/cast.ts` builds each scene's character list from operators plus speaker labels that the story
  uses as names (someone calls them that mid-sentence), so "Manfred" is listed but "Royal Guard" is not.

`npm test` runs the parser tests.
