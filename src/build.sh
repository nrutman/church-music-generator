#!/bin/bash
#
# Usage: ./src/build.sh songs/song-name.json   (from project root)
#        ./src/build.sh                         (builds all songs)
#
set -e
cd "$(dirname "$0")"
mkdir -p ../generated

if [ -n "$1" ]; then
  files=("$1")
else
  files=(songs/*.json)
fi

for song in "${files[@]}"; do
  echo "========================================"
  echo "Building: $song"
  echo "========================================"

  # Extract title from JSON for verification
  title=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$song','utf8')).title)")

  # Generate both .docx files
  node ../dist/generate.js "$song"

  # Verify page counts
  chord="../generated/${title} - Chord.docx"
  lyric="../generated/${title} - Lyric.docx"

  echo ""
  node ../dist/verify.js "$chord" "$lyric"

  echo ""
done

echo "Done."
