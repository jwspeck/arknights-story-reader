// Downloads (or updates) just the EN story and index files from ArknightsAssets/ArknightsGamedata.
// Written in Node rather than sh so it also works on Windows.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const DIR = 'data-src';
const git = (...args: string[]) => execFileSync('git', args, { stdio: 'inherit' });

if (existsSync(`${DIR}/.git`)) {
  git('-C', DIR, 'pull', '--depth', '1', '--ff-only');
} else {
  git('clone', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/ArknightsAssets/ArknightsGamedata', DIR);
  git('-C', DIR, 'sparse-checkout', 'set', 'en/gamedata/story', 'en/gamedata/excel');
}
console.log(`Dump is in ${DIR}/en/gamedata. Now run: npm run build-data`);
