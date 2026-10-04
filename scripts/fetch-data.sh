#!/bin/sh
# Downloads (or updates) just the EN story and index files from ArknightsAssets/ArknightsGamedata.
set -e
DIR=data-src
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --depth 1 --ff-only
else
  git clone --depth 1 --filter=blob:none --sparse https://github.com/ArknightsAssets/ArknightsGamedata "$DIR"
  git -C "$DIR" sparse-checkout set en/gamedata/story en/gamedata/excel
fi
echo "Dump is in $DIR/en/gamedata. Now run: npm run build-data"
