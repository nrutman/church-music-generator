#!/bin/bash
#
# Checks that all system dependencies are installed.
#
set -e

ok=true

check() {
  local name="$1" cmd="$2" install="$3" verflag="${4:---version}"
  if command -v "$cmd" &>/dev/null; then
    local ver
    ver=$("$cmd" $verflag 2>&1 | head -1)
    printf "  ✓ %-12s %s\n" "$name" "$ver"
  else
    printf "  ✗ %-12s not found — %s\n" "$name" "$install"
    ok=false
  fi
}

echo "Checking dependencies..."
echo ""

# Required
echo "Required:"
check "pdftotext" "pdftotext" "brew install poppler" "-v"
check "pdftoppm"  "pdftoppm"  "brew install poppler" "-v"
check "node"      "node"      "install via nvm or brew"
check "pnpm"      "pnpm"     "npm install -g pnpm"

echo ""

# Optional
echo "Optional:"
if [ -d "/Applications/LibreOffice.app" ] || command -v soffice &>/dev/null; then
  soffice_path="${SOFFICE_PATH:-/Applications/LibreOffice.app/Contents/MacOS/soffice}"
  if [ -x "$soffice_path" ]; then
    ver=$("$soffice_path" --version 2>&1 | head -1)
    printf "  ✓ %-12s %s\n" "LibreOffice" "$ver"
  else
    printf "  ✓ %-12s installed (could not get version)\n" "LibreOffice"
  fi
else
  printf "  ✗ %-12s not found — brew install --cask libreoffice (needed for pnpm preview)\n" "LibreOffice"
fi

if command -v textutil &>/dev/null; then
  printf "  ✓ %-12s available (macOS built-in)\n" "textutil"
else
  printf "  - %-12s not available (macOS only, needed for .doc files)\n" "textutil"
fi

echo ""

if [ "$ok" = true ]; then
  echo "All required dependencies installed."
else
  echo "Some required dependencies are missing. Install them and re-run."
  exit 1
fi
