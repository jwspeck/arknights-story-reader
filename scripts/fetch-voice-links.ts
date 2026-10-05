// Looks up each voice artist on Wikidata and saves their IMDb ID and English Wikipedia page, if any.
//
//   npm run fetch-voice-links      (after build-data; then build-data again to publish the links)
//
// Writes data-src/voice-links.json, which build-data copies into public/data/. Only a name that matches
// exactly one person whose occupation is voice actor (seiyū included) counts: a shared name gets no link,
// since the page then falls back to an IMDb name search, which can't point at the wrong person.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { RosterEntry, VoiceLink } from '../src/types';

const roster: RosterEntry[] = JSON.parse(readFileSync('public/data/roster.json', 'utf8'));
// One-word stage names ("Iris", "Kyle") are too common to match safely, so they only get the search link.
const names = [...new Set(roster.flatMap((e) => e.voices.map((v) => v.name)))].filter((n) => /\s/.test(n.trim())).sort();
const OUT = 'data-src/voice-links.json';
if (!existsSync('data-src')) throw new Error('Run from the project folder after `npm run fetch-data`.');

interface Row {
  name: string;
  person: string;
  imdb?: string;
  wiki?: string;
}

async function query(batch: string[]): Promise<Row[]> {
  const values = batch.map((n) => `${JSON.stringify(n)}@en`).join(' ');
  const sparql = `SELECT ?name ?person ?imdb ?wiki WHERE {
    VALUES ?name { ${values} }
    ?person rdfs:label ?name; wdt:P31 wd:Q5; wdt:P106/wdt:P279* wd:Q2405480.
    OPTIONAL { ?person wdt:P345 ?imdb. FILTER(STRSTARTS(?imdb, "nm")) }
    OPTIONAL { ?wiki schema:about ?person; schema:isPartOf <https://en.wikipedia.org/>. }
  }`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/sparql-results+json',
        'User-Agent': 'arknights-story-reader/0.1 (local reader; voice artist links)',
      },
      body: new URLSearchParams({ query: sparql }),
    });
    if (res.ok) {
      const json = await res.json();
      return json.results.bindings.map((b: Record<string, { value: string }>) => ({
        name: b.name.value,
        person: b.person.value,
        imdb: b.imdb?.value,
        wiki: b.wiki?.value,
      }));
    }
    if (attempt >= 4) throw new Error(`Wikidata answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); // rate limited or busy
  }
}

const rows: Row[] = [];
for (let i = 0; i < names.length; i += 80) {
  rows.push(...(await query(names.slice(i, i + 80))));
  process.stdout.write(`\rLooked up ${Math.min(i + 80, names.length)} of ${names.length}`);
}
console.log();

const links: Record<string, VoiceLink> = {};
let ambiguous = 0;
for (const name of names) {
  const people = new Set(rows.filter((r) => r.name === name).map((r) => r.person));
  if (people.size > 1) ambiguous++;
  if (people.size !== 1) continue;
  const mine = rows.filter((r) => r.name === name);
  const imdb = mine.find((r) => r.imdb)?.imdb;
  const wiki = mine.find((r) => r.wiki)?.wiki;
  if (imdb || wiki) links[name] = { imdb, wikipedia: wiki };
}
writeFileSync(OUT, JSON.stringify(links, null, 1));
const withImdb = Object.values(links).filter((l) => l.imdb).length;
const withWiki = Object.values(links).filter((l) => l.wikipedia).length;
console.log(
  `${withImdb} IMDb and ${withWiki} Wikipedia links for ${names.length} artists (${ambiguous} shared names skipped). ` +
    `Wrote ${OUT}; run \`npm run build-data\` to publish.`,
);
