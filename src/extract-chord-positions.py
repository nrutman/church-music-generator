#!/usr/bin/env python3
"""Extract chord-to-lyric-character mappings from a source chord sheet PDF.

Uses pdftotext -bbox to get exact X/Y coordinates for every word, then maps
each chord symbol to the lyric character directly below it.

Usage:
    python3 src/extract-chord-positions.py <path-to-source-pdf>

Requires: poppler (brew install poppler) for pdftotext.
"""

import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass

# Matches any standard chord symbol: root note (A-G) with optional sharp/flat,
# optional quality (m, maj, min, dim, aug, sus, add, dom), optional extensions
# (7, 9, 11, 13), and optional slash bass note.
CHORD_RE = re.compile(
    r"^[A-G][#b♯♭]?"  # root note + optional accidental
    r"(?:m(?:aj|in)?|M|dim|aug|sus[24]?|add|dom)?"  # optional quality
    r"[0-9]*"  # optional extension (7, 9, 11, 13)
    r"(?:/[A-G][#b♯♭]?)?"  # optional slash bass note
    r"$"
)

SECTION_LABELS = {"VERSE", "CHORUS", "BRIDGE", "INTRO", "INTRO:", "TAG", "OUTRO"}
ANNOTATIONS = {"(to", "CHORUS)", "3X)", "2X)"}


def is_chord(word: str) -> bool:
    """Check if a word is a chord symbol using regex pattern matching."""
    if word == "|":
        return True  # bar line marker
    return bool(CHORD_RE.match(word))


def is_label_or_annotation(word: str) -> bool:
    """Check if a word is a section label, number, or annotation."""
    if word in SECTION_LABELS or word in ANNOTATIONS:
        return True
    if word.isdigit():
        return True
    return False


@dataclass
class Word:
    text: str
    x_min: float
    y_min: float
    x_max: float
    y_max: float

    @property
    def y_center(self) -> float:
        return (self.y_min + self.y_max) / 2

    @property
    def width(self) -> float:
        return self.x_max - self.x_min


def extract_words(pdf_path: str) -> list[Word]:
    """Run pdftotext -bbox and parse the XML output."""
    result = subprocess.run(
        ["pdftotext", "-bbox", pdf_path, "-"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Error running pdftotext: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    xml_text = result.stdout.replace(' xmlns="http://www.w3.org/1999/xhtml"', "")
    root = ET.fromstring(xml_text)
    words = []
    for page_idx, page in enumerate(root.findall(".//page")):
        # Offset Y by page height so words on different pages never merge into one line
        page_height = float(page.get("height", 1000))
        y_offset = page_idx * page_height
        for elem in page.findall("word"):
            words.append(
                Word(
                    text=elem.text or "",
                    x_min=float(elem.get("xMin", 0)),
                    y_min=float(elem.get("yMin", 0)) + y_offset,
                    x_max=float(elem.get("xMax", 0)),
                    y_max=float(elem.get("yMax", 0)) + y_offset,
                )
            )
    return words


def group_into_lines(words: list[Word], tolerance: float = 5.0) -> list[list[Word]]:
    """Group words into horizontal lines based on Y position."""
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (w.y_center, w.x_min))
    lines: list[list[Word]] = []
    current: list[Word] = [sorted_words[0]]
    for word in sorted_words[1:]:
        if abs(word.y_center - current[0].y_center) < tolerance:
            current.append(word)
        else:
            current.sort(key=lambda w: w.x_min)
            lines.append(current)
            current = [word]
    current.sort(key=lambda w: w.x_min)
    lines.append(current)
    return lines


def classify_line(words: list[Word]) -> str:
    """Classify a line as 'chord', 'lyric', or 'other'.

    Classification happens at the LINE level, not the word level. This prevents
    chord-like words in lyrics (e.g., "A" in "A mighty fortress") from being
    mistaken for chords. A line is only "chord" if >50% of its words match the
    chord regex — lyric lines with scattered chord-like words won't qualify.
    """
    non_label = [w for w in words if not is_label_or_annotation(w.text)]
    if not non_label:
        return "other"
    chord_count = sum(1 for w in non_label if is_chord(w.text))
    if chord_count / len(non_label) > 0.5:
        return "chord"
    has_lowercase = any(
        any(c.islower() for c in w.text) for w in words if len(w.text) > 1
    )
    if has_lowercase and len(words) > 1:
        return "lyric"
    return "other"


def build_char_map(lyric_words: list[Word]) -> tuple[str, list[tuple[float, float]]]:
    """Build full lyric text and per-character (x_min, x_max) positions."""
    text = ""
    positions: list[tuple[float, float]] = []
    for i, word in enumerate(lyric_words):
        if i > 0:
            prev_xmax = lyric_words[i - 1].x_max
            text += " "
            positions.append((prev_xmax, word.x_min))
        char_w = word.width / max(len(word.text), 1)
        for j, ch in enumerate(word.text):
            x0 = word.x_min + j * char_w
            x1 = word.x_min + (j + 1) * char_w
            text += ch
            positions.append((x0, x1))
    return text, positions


def map_chord_to_char(
    chord_x: float, lyric_text: str, positions: list[tuple[float, float]]
) -> tuple[int, str]:
    """Find which character index a chord's X position falls on."""
    # If past the last character, it's trailing
    if positions and chord_x > positions[-1][1] + 5:
        return len(lyric_text), "(trailing)"
    best_idx = 0
    best_dist = float("inf")
    for idx, (x0, x1) in enumerate(positions):
        if x0 <= chord_x <= x1:
            return idx, lyric_text[idx]
        dist = min(abs(chord_x - x0), abs(chord_x - x1))
        if dist < best_dist:
            best_dist = dist
            best_idx = idx
    ch = lyric_text[best_idx] if best_idx < len(lyric_text) else "(trailing)"
    return best_idx, ch


def main() -> None:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path-to-source-pdf>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    words = extract_words(pdf_path)
    lines = group_into_lines(words)

    print("=" * 78)
    print("CHORD POSITION EXTRACTION")
    print("=" * 78)

    i = 0
    while i < len(lines):
        line_type = classify_line(lines[i])
        if line_type == "chord" and i + 1 < len(lines):
            next_type = classify_line(lines[i + 1])
            if next_type == "lyric":
                chord_words = [
                    w for w in lines[i] if is_chord(w.text) and w.text != "|"
                ]
                # Filter out section labels from the lyric line
                lyric_words = [
                    w for w in lines[i + 1] if not is_label_or_annotation(w.text)
                ]
                if not lyric_words:
                    i += 2
                    continue

                lyric_text, positions = build_char_map(lyric_words)
                print(f'\nLYRIC: "{lyric_text}"')

                chords_parts = []
                for cw in chord_words:
                    idx, ch = map_chord_to_char(cw.x_min, lyric_text, positions)
                    trailing = " (TRAILING)" if idx >= len(lyric_text) else ""
                    # If it landed on a space, nudge right to the next letter
                    if ch == " " and idx + 1 < len(lyric_text):
                        idx += 1
                        ch = lyric_text[idx]
                    print(
                        f"  {cw.text:>8s} → charIndex={idx:>3d}"
                        f"  char='{ch}'  x={cw.x_min:.1f}{trailing}"
                    )
                    chords_parts.append(f'["{cw.text}", {idx}]')

                print(f'  "chords": [{", ".join(chords_parts)}]')
                i += 2
                continue
        i += 1


if __name__ == "__main__":
    main()
