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

# Track generated files for copying
generated_files=()

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

  generated_files+=("$chord" "$lyric")
  if [ -f "$chordCapo" ]; then
    generated_files+=("$chordCapo")
  fi
  echo ""
done

echo "Done."

# Copy generated files to destination directory
if [ -n "$DEST_DIR" ]; then
  dest="${DEST_DIR/#\~/$HOME}"
  if [ ! -d "$dest" ]; then
    echo "Warning: DEST_DIR '$DEST_DIR' does not exist. Skipping copy."
  else
    echo ""
    echo "Copying to $DEST_DIR..."
    for f in "${generated_files[@]}"; do
      cp "$f" "$dest/"
      echo "  $(basename "$f")"
    done
  fi
else
  echo ""
  read -rp "Copy generated files to (blank to skip): " user_dest
  if [ -n "$user_dest" ]; then
    dest="${user_dest/#\~/$HOME}"
    if [ ! -d "$dest" ]; then
      echo "Directory '$user_dest' does not exist. Skipping copy."
    else
      echo "Copying to $user_dest..."
      for f in "${generated_files[@]}"; do
        cp "$f" "$dest/"
        echo "  $(basename "$f")"
      done
      echo ""
      echo "Tip: Set DEST_DIR=$user_dest in .env.local to skip this prompt next time."
    fi
  fi
fi
