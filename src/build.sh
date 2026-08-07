#!/bin/bash
#
# Usage: ./src/build.sh songs/song-name.json   (from project root)
#        ./src/build.sh                         (builds all songs)
#
set -e
cd "$(dirname "$0")"
mkdir -p ../generated

# Load environment config (.env then .env.local overrides)
if [ -f ../.env ]; then
  set -a; source ../.env; set +a
fi
if [ -f ../.env.local ]; then
  set -a; source ../.env.local; set +a
fi

if [ -n "$1" ]; then
  # Accept paths from project root (src/songs/...) or from src/ (songs/...)
  arg="$1"
  arg="${arg#src/}"  # strip leading src/ if present
  files=("$arg")
else
  files=(songs/*.json)
fi

for song in "${files[@]}"; do
  echo "========================================"
  echo "Building: $song"
  echo "========================================"

  # Extract title from JSON and derive filename (strip leading article + punctuation)
  title=$(node -e "
    const t = JSON.parse(require('fs').readFileSync('$song','utf8')).title;
    console.log(t.replace(/^(A|An|The)\s+/i,'').replace(/[^\w\s]/g,'').replace(/\s+/g,' ').trim());
  ")

  # Generate both .docx files
  node ../dist/generate.js "$song"

  # Verify page counts
  chord="../generated/${title} - Chord.docx"
  lyric="../generated/${title} - Lyric.docx"
  chordCapo="../generated/${title} - Chord Capo.docx"
  maxPages=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$song','utf8')).maxPages || 2)")

  echo ""
  verify_files=("$chord" "$lyric")
  if [ -f "$chordCapo" ]; then
    verify_files+=("$chordCapo")
  fi
  MAX_PAGES="$maxPages" node ../dist/verify.js "${verify_files[@]}"

  echo ""
done

echo "Done."
echo ""
echo "Generated files are in generated/."
echo "Next: preview and visually verify them with pnpm preview."
echo "After verification, use pnpm publish-song <song.json> --dry-run to review publishing."
