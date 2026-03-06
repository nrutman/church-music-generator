#!/bin/bash
#
# Converts generated .docx files to PDF and opens them for preview.
#
# Usage: ./src/preview.sh                           (preview all)
#        ./src/preview.sh "Song Name"               (preview one song)
#        ./src/preview.sh "Song Name" --no-open     (convert only, don't open)
#
set -e

SOFFICE="${SOFFICE_PATH:-/Applications/LibreOffice.app/Contents/MacOS/soffice}"
GENERATED="$(cd "$(dirname "$0")/.." && pwd)/generated"
PREVIEW="$GENERATED/preview"

# Start fresh each run
rm -rf "$PREVIEW"
mkdir -p "$PREVIEW"

if [ ! -x "$SOFFICE" ]; then
  echo "Error: LibreOffice not found at $SOFFICE"
  echo "Install: brew install --cask libreoffice"
  echo "Or set SOFFICE_PATH to your soffice binary."
  exit 1
fi

no_open=false
song_filter=""

for arg in "$@"; do
  if [ "$arg" = "--no-open" ]; then
    no_open=true
  else
    song_filter="$arg"
  fi
done

# Collect .docx files to convert
files=()
if [ -n "$song_filter" ]; then
  for f in "$GENERATED/$song_filter"*.docx; do
    [ -f "$f" ] && files+=("$f")
  done
  if [ ${#files[@]} -eq 0 ]; then
    echo "No .docx files found matching: $song_filter"
    echo "Available files:"
    ls "$GENERATED"/*.docx 2>/dev/null | sed 's|.*/||' || echo "  (none)"
    exit 1
  fi
else
  for f in "$GENERATED"/*.docx; do
    [ -f "$f" ] && files+=("$f")
  done
  if [ ${#files[@]} -eq 0 ]; then
    echo "No .docx files in $GENERATED/. Run pnpm generate first."
    exit 1
  fi
fi

# Convert each to PDF
pdfs=()
for f in "${files[@]}"; do
  name=$(basename "$f" .docx)
  echo "Converting: $name.docx → PDF"
  "$SOFFICE" --headless --convert-to pdf --outdir "$PREVIEW" "$f" 2>/dev/null
  pdfs+=("$PREVIEW/$name.pdf")
done

echo ""
echo "Generated PDFs:"
for pdf in "${pdfs[@]}"; do
  echo "  $(basename "$pdf")"
done

if [ "$no_open" = false ] && [ "$(uname)" = "Darwin" ]; then
  echo ""
  echo "Opening in Preview..."
  open "${pdfs[@]}"
fi

# Previews are stored in generated/preview/ and auto-cleaned on next run.
# To manually clean: pnpm clean-previews
