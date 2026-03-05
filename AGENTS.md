# Agent Instructions

**Read `README.md` first.** It contains the project overview, song JSON format, build pipeline, layout rules, and project structure. Always keep both `README.md` and this file up to date when making changes.

**Always generate both a chord sheet and a lyric sheet for every song.**

This file contains the precise format specifications that agents need to produce correctly formatted `.docx` files. Everything below supplements (not duplicates) what's in README.md.

---

## Providence Church Chord Sheet Format

### Page Layout

- US Letter (8.5" x 11")
- Margins: 0.5" top/bottom, 1" left/right
- Font: Arial throughout

### Styles

| Style              | Font  | Size         | Weight | Other                                                   |
| ------------------ | ----- | ------------ | ------ | ------------------------------------------------------- |
| Title              | Arial | 24pt (sz 48) | Bold   | ALL CAPS, centered                                      |
| Body Text (lyrics) | Arial | 18pt (sz 36) | Bold   | Indent: left 720 + firstLine 720 DXA                    |
| Chords - 1st Line  | Arial | 10pt (sz 20) | Normal | Italic. Contains section label + chords                 |
| Chords             | Arial | 10pt (sz 20) | Normal | Italic. Indent: left 1440 DXA                           |
| Section labels     | Arial | 12pt (sz 24) | Bold   | ALL CAPS, not italic. Inline at start of Chords-1stLine |

### Section Labels

Section labels (VERSE 1, CHORUS, VERSE 3, FINAL CHORUS, INTRO, etc.) appear at the beginning of the `Chords-1stLine` paragraph with overridden formatting: bold, not italic, caps, 12pt. The chords follow on the same line after tabs.

### Document Structure

```
[empty paragraph]
[Title - centered, bold, caps]
[empty paragraph]

[Chords-1stLine: "VERSE 1" + tab + chords]
[BodyText: lyric line]
[Chords: chords]
[BodyText: lyric line]
...
[two empty paragraphs between sections]

[Chords-1stLine: "CHORUS" + tab + chords]
[BodyText: lyric line]
...
```

Chord lines and lyric lines alternate — each chord line sits directly above its corresponding lyric line. Chords are positioned using tabs and spaces to align approximately over the syllable where the chord change occurs.

### Header

- Left: "Providence Church (Updated DD Mon YYYY)" — Arial, 8pt
- Right: "Page X of Y" — Arial, 8pt
- Tab stops: center at 4320, right at 8640

### Footer

- Centered, Arial, 10pt
- Line 1: "SONG TITLE IN CAPS Words and Music by [composers]"
- Line 2: "© [year] [publisher info]"
- Line 3: "CCLI #1210714" — this is Providence Church's CCLI license number (constant across all songs, NOT the per-song CCLI number)

### Page Fit Verification

After generating a .docx, always estimate whether each page fits. Approximate line heights:

- Title: ~36pt
- Lyric line (BodyText 18pt): ~22pt
- Chord line (10pt): ~14pt
- Chords-1stLine (10pt): ~14pt
- Empty/gap line: ~22pt

Usable page height is ~670pt (US Letter minus 0.5" top/bottom margins minus header/footer). If estimated content exceeds this, adjust the layout (drop chord lines from a verse, remove repeated sections, etc.) and regenerate.

---

## Providence Church Lyric Sheet Format

Lyric sheets share the same page layout, header, footer, and Title style as chord sheets. The differences are:

### Styles (Lyric Sheet)

Only two styles are needed: **Title** and **BodyText** (same definitions as the chord sheet).

### Document Structure (Lyric Sheet)

```
[empty paragraph]
[Title - centered, bold, caps]
[empty paragraph]

[BodyText (ind left=0 firstLine=0): "VERSE 1" (caps, 12pt) + tab + first lyric line (18pt bold)]
[BodyText: lyric line]
[BodyText: lyric line]
...
[one empty paragraph between sections]

[BodyText (ind left=0 firstLine=0): "CHORUS" (caps, 12pt) + tab + first lyric line]
[BodyText: lyric line]
...
```

Key differences from chord sheets:

- **No chord lines.** Lyrics only.
- **Section label + first lyric on the same paragraph.** The label is a TextRun with caps/12pt, followed by a tab, then the first lyric line at standard BodyText size. The paragraph uses BodyText style with indent overridden to `left: 0, firstLine: 0`.
- **Single empty line between sections** (chord sheets use two).
- **No intro section** (intros are chords-only, irrelevant for lyrics).
- **Include all verses and choruses.** Since there are no chord lines taking up space, lyric sheets are more compact. Same 2-page max and never-split-sections rules apply.
- **Naming convention:** `Song Name - Lyric.docx` (chord sheets use `Song Name - Chord.docx`).

### Layout Rules (Lyric Sheet)

Same rules as chord sheets (2-page max, never split sections, long line font reduction) except:

- All verses and the chorus are always included (no need to drop content for space).
- The chorus appears where it naturally falls, same as chord sheets.

---

## Dependencies

- **Node.js** with **pnpm** (`pnpm install`)
- **poppler** (`brew install poppler`) for PDF text extraction and rendering
- macOS `textutil` for reading legacy `.doc` files
