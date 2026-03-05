#!/bin/bash
#
# Usage: ./build.sh songs/song-name.json
#        ./build.sh                        (builds all songs in songs/)
#
set -e
cd "$(dirname "$0")"

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
  node generate.js "$song"

  # Verify page counts
  chord="../${title} - Chord.docx"
  lyric="../${title} - Lyric.docx"

  echo ""
  node verify.js "$chord" "$lyric"

  echo ""
done

echo "Done."
