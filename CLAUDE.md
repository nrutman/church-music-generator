# Music Chord & Lyric Sheet Generator

This project generates guitar chord sheet and lyric sheet `.docx` files in the Providence Church format. **Always generate both a chord sheet and a lyric sheet for every song.**

## Directory Structure

- `/` — Generated `.docx` chord sheets and lyric sheets (output files)
- `src/` — Generator scripts and code
- `src/songs/` — Song data files (JSON) — one per song, kept for re-generation and debugging
- `src/node_modules/` — Dependencies (docx npm package)

Keep generated documents in the root and code/data in `src/`.

## Source Sheets (Reference)

Existing chord sheets: `/Users/nathan/Google Drive/My Drive/Music/Chord Sheets/`
Existing lyric sheets: `/Users/nathan/Google Drive/My Drive/Music/Lyric Sheets/`

These are `.doc` and `.docx` files. Use them as formatting reference. The `.docx` files can be unpacked for XML inspection using the docx skill's unpack script. The `.doc` files can be read with `textutil -convert txt -stdout "file.doc"` on macOS.

## Providence Church Chord Sheet Format

All chord sheets follow this precise format:

### Page Layout
- US Letter (8.5" x 11")
- Margins: 0.5" top/bottom, 1" left/right
- Font: Arial throughout

### Styles

| Style | Font | Size | Weight | Other |
|-------|------|------|--------|-------|
| Title | Arial | 24pt (sz 48) | Bold | ALL CAPS, centered |
| Body Text (lyrics) | Arial | 18pt (sz 36) | Bold | Indent: left 720 + firstLine 720 DXA |
| Chords - 1st Line | Arial | 10pt (sz 20) | Normal | Italic. Contains section label + chords |
| Chords | Arial | 10pt (sz 20) | Normal | Italic. Indent: left 1440 DXA |
| Section labels | Arial | 12pt (sz 24) | Bold | ALL CAPS, not italic. Inline at start of Chords-1stLine |

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

### Layout Rules

1. **2-page maximum.** A chord sheet must never exceed 2 pages. After generating, always verify the output fits in 2 pages by estimating content height per page.
2. **Chorus placement.** Place the chorus once, where it first naturally appears in the song. Do NOT repeat the chorus on other pages. If the source has a "Final Chorus" with different chords or extra lines, treat it as a separate section only if it truly differs; otherwise drop it.
3. **Every verse gets chords.** But if there are too many verses to stay within 2 pages, drop chords from one or more verses (keep chords on as many verses as possible). Verses without chords are just lyric lines with no chord lines above them.
4. **Intro chords.** If the source material lists intro chords before the first section, include them with an "INTRO" section label followed by just the chord line(s) — no lyric lines.
5. **Never split a section across pages.** Each unit (verse, chorus, bridge, intro, etc.) must stay entirely on one page. Insert a page break before a section if it would otherwise straddle two pages.
6. **Long lyric lines.** If a single lyric line causes a line wrap, reduce the font size for that line — as low as 15pt (sz 30) — to try to keep it on one line. If it still won't fit at 15pt, ask the user how to split it, then use the standard 18pt size on both resulting lines.
7. **Space at top of subsequent pages.** After a page break, add two empty BodyText paragraphs at the top of the new page (before the first section), as long as it doesn't push the document over the 2-page limit. This applies to both chord sheets and lyric sheets.
8. **Reduce section gaps if needed for fit.** The standard gap between sections is two empty lines (chord sheets) or one empty line (lyric sheets). If the page is tight, reduce a section gap from two empty lines to one to make content fit. Prefer this over dropping chords from a verse.

### Page Fit Verification

After generating a .docx, always estimate whether each page fits. Approximate line heights:
- Title: ~36pt
- Lyric line (BodyText 18pt): ~22pt
- Chord line (10pt): ~14pt
- Chords-1stLine (10pt): ~14pt
- Empty/gap line: ~22pt

Usable page height is ~670pt (US Letter minus 0.5" top/bottom margins minus header/footer). If estimated content exceeds this, adjust the layout (drop chord lines from a verse, remove repeated sections, etc.) and regenerate.

### Header
- Left: "Providence Church (Updated DD Mon YYYY)" — Arial, 8pt
- Right: "Page X of Y" — Arial, 8pt
- Tab stops: center at 4320, right at 8640

### Footer
- Centered, Arial, 10pt
- Line 1: "SONG TITLE IN CAPS Words and Music by [composers]"
- Line 2: "© [year] [publisher info]"
- Line 3: "CCLI #1210714" — this is Providence Church's CCLI license number (constant across all songs, NOT the per-song CCLI number)

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

## How to Generate Sheets

**Always generate both files for every song:**
1. `Song Name - Chord.docx` — chord sheet
2. `Song Name - Lyric.docx` — lyric sheet

### Pipeline Overview

The build pipeline has 3 steps:

1. **Create a song JSON file** in `src/songs/` (see format below)
2. **Run the generator** which reads the JSON and produces both `.docx` files
3. **Run the verifier** which checks page counts and height estimates

All 3 steps are wrapped in a single command:

```bash
cd src && ./build.sh songs/song-name.json
```

Or build all songs at once:

```bash
cd src && ./build.sh
```

### Song JSON Format

Create a file `src/songs/song-name.json`:

```json
{
  "title": "Song Title",
  "composers": "Composer Name(s)",
  "copyright": "\u00a9 Year Publisher Info",
  "sections": [
    {
      "type": "intro",
      "chords": ["Chord line 1", "Chord line 2 (if needed)"]
    },
    {
      "type": "verse",
      "number": 1,
      "lines": [
        { "chords": "G        D        C", "lyrics": "First line of lyrics" },
        { "chords": "Em       C", "lyrics": "Second line of lyrics" }
      ]
    },
    {
      "type": "chorus",
      "lines": [
        { "chords": "C   G   D", "lyrics": "Chorus line" }
      ]
    }
  ]
}
```

**Section types:** `intro`, `verse`, `chorus`, `bridge`
- `verse` sections require a `number` field
- `intro` sections have `chords` (array of strings) instead of `lines`
- All other sections have `lines` (array of `{chords, lyrics}` objects)
- Chord strings use spaces to position chords over syllables
- Use `\u2019` for smart apostrophes in lyrics

### Scripts

| Script | Purpose |
|--------|---------|
| `src/generate.js` | Reads song JSON, generates both Chord and Lyric `.docx` files. Handles page layout automatically (page breaks, gap reduction). |
| `src/verify.js` | Checks `.docx` files fit within 2 pages by extracting XML and estimating content height. |
| `src/build.sh` | Runs generate + verify in one step. |

### Input sources
- Chord charts may come as PDFs — extract text with `pdftotext -f [page] -l [page] file.pdf` and render with `pdftoppm -jpeg -r 150` for visual reference
- The user will specify which key/page to use from multi-key PDFs
- Existing `.doc` files can be read with `textutil -convert txt -stdout` on macOS

## Dependencies

- **Node.js** with `docx` package (`npm install docx`)
- **poppler** (`brew install poppler`) for PDF text extraction and rendering
- macOS `textutil` for reading legacy `.doc` files
