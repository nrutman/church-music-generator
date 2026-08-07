#!/usr/bin/env python3
"""Extract chord-to-lyric-character mappings from OCR TSV files.

Renders PDF pages to images via pdftoppm, OCRs them with tesseract,
then maps chord X positions to lyric characters — same logic as
extract-chord-positions.py but using OCR bounding boxes instead of
pdftotext -bbox (which can have misaligned coordinates on web-printed PDFs).

Usage:
    python3 src/extract-chords-ocr.py <path-to-source-pdf>

Requires: poppler (pdftoppm), tesseract
"""

import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass

CHORD_RE = re.compile(
    r"^[A-G][#b♯♭]?"
    r"(?:m(?:aj|in)?|M|dim|aug|sus[24]?|add|dom)?"
    r"[0-9]*"
    r"(?:/[A-G][#b♯♭]?)?"
    r"$"
)

SECTION_LABELS = {
    "VERSE",
    "CHORUS",
    "BRIDGE",
    "INTRO",
    "INTRO:",
    "TAG",
    "OUTRO",
    "STANZA",
    "TURN",
    "[INTRO]",
    "[CHORUS",
    "[BRIDGE",
    "[TURN",
    "[STANZA",
    "[VERSE",
    "[TAG",
    "[OUTRO",
}
ANNOTATIONS = {"(to", "CHORUS)", "3X)", "2X)", "(F)", "(Bb)"}


def is_chord(word: str) -> bool:
    if word in ("|", "/"):
        return True
    # Strip surrounding parens/brackets for detection
    clean = word.strip("()[]")
    return bool(CHORD_RE.match(clean))


def is_label_or_annotation(word: str) -> bool:
    if word in ANNOTATIONS:
        return True
    if word.rstrip(":]").lstrip("[") in SECTION_LABELS or word in SECTION_LABELS:
        return True
    if word.strip("[]"):
        stripped = word.strip("[]")
        if stripped in SECTION_LABELS or stripped.rstrip(":") in SECTION_LABELS:
            return True
    return bool(word.rstrip("]").isdigit() or word.isdigit())


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


def render_and_ocr(pdf_path: str) -> list[Word]:
    """Render PDF to images and OCR each page, returning all words with coordinates."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Render PDF pages to PNG at 300 DPI
        prefix = os.path.join(tmpdir, "page")
        subprocess.run(
            ["pdftoppm", "-r", "300", "-png", pdf_path, prefix],
            check=True,
            capture_output=True,
        )

        pages = sorted(f for f in os.listdir(tmpdir) if f.endswith(".png"))
        all_words: list[Word] = []
        y_offset = 0.0

        for page_file in pages:
            page_path = os.path.join(tmpdir, page_file)
            # tesseract has issues with /tmp paths; copy to cwd
            local_name = f"_ocr_temp_{page_file}"
            try:
                os.link(page_path, local_name)
            except OSError:
                import shutil

                shutil.copy2(page_path, local_name)

            try:
                result = subprocess.run(
                    [
                        "tesseract",
                        local_name,
                        "stdout",
                        "--psm",
                        "4",
                        "-c",
                        "tessedit_create_tsv=1",
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                page_height = 0.0
                for line in result.stdout.strip().split("\n")[1:]:  # skip header
                    parts = line.split("\t")
                    if len(parts) < 12:
                        continue
                    level = int(parts[0])
                    if level != 5:  # level 5 = word
                        continue
                    text = parts[11].strip()
                    if not text:
                        continue
                    left = float(parts[6])
                    top = float(parts[7])
                    width = float(parts[8])
                    height = float(parts[9])
                    bottom = top + height
                    page_height = max(page_height, bottom)
                    all_words.append(
                        Word(
                            text=text,
                            x_min=left,
                            y_min=top + y_offset,
                            x_max=left + width,
                            y_max=top + height + y_offset,
                        )
                    )
                y_offset += page_height + 100  # gap between pages
            finally:
                os.unlink(local_name)

    return all_words


def group_into_lines(words: list[Word], tolerance: float = 15.0) -> list[list[Word]]:
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
    if positions and chord_x > positions[-1][1] + 15:
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
    print("Rendering PDF pages and running OCR...")
    words = render_and_ocr(pdf_path)
    print(f"Found {len(words)} words across all pages.")
    lines = group_into_lines(words)

    print("=" * 78)
    print("CHORD POSITION EXTRACTION (OCR)")
    print("=" * 78)

    i = 0
    while i < len(lines):
        line_type = classify_line(lines[i])
        if line_type == "chord" and i + 1 < len(lines):
            next_type = classify_line(lines[i + 1])
            if next_type == "lyric":
                chord_words = [
                    w for w in lines[i] if is_chord(w.text) and w.text not in ("|", "/")
                ]
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
                    # Strip parens for chord name but use original x position
                    chord_name = cw.text.strip("()")
                    idx, ch = map_chord_to_char(cw.x_min, lyric_text, positions)
                    trailing = " (TRAILING)" if idx >= len(lyric_text) else ""
                    if ch == " " and idx + 1 < len(lyric_text):
                        idx += 1
                        ch = lyric_text[idx]
                    print(
                        f"  {chord_name:>8s} → charIndex={idx:>3d}"
                        f"  char='{ch}'  x={cw.x_min:.0f}{trailing}"
                    )
                    chords_parts.append(f'["{chord_name}", {idx}]')

                print(f'  "chords": [{", ".join(chords_parts)}]')
                i += 2
                continue
        i += 1


if __name__ == "__main__":
    main()
