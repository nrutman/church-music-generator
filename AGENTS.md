# Agent Instructions

**Read `README.md` first.** It contains the project overview, song JSON format, build pipeline, layout rules, and project structure. Always keep both `README.md` and this file up to date when making changes.

**Code changes require tests.** When modifying or adding logic in `src/`, write or update corresponding tests in `src/__tests__/`. After updating tests, review them against these questions: (1) Are we missing any high-value test cases? (2) Can tests be consolidated or simplified? (3) Are there any low-value tests to remove? Keep tests focused on behavior, not implementation details or magic numbers.

---

## Quick-Start: Generating Songs from PDFs

This is the most common task. Follow these steps:

### 1. Extract content from the source PDF

Read the PDF visually. Identify: title, composers, copyright, CCLI number, and the section structure (intro, verses, chorus, bridge). Note which chords fall above which syllables.

### 2. Determine chord positions using visual alignment

For each chord in the source PDF, determine its character index using this "look down" method:

1. **Find the chord symbol** in the chord line above the lyrics.
2. **Look straight down** from the left edge of the chord symbol to the lyric line below.
3. **Identify the exact letter** the chord's left edge sits above. This may be in the middle of a word (e.g., Em above "deemed" in "Redeemed" → index 2 at the 'd', not 0 at the 'R').
4. **Count characters** (0-based, including spaces) from the start of the lyric line to that letter. That count is the `charIndex`.

**Do NOT** estimate positions from column numbers in text extraction — source PDFs use proportional fonts where column positions don't map to character indices. Always use the visual image.

**CRITICAL: Do NOT snap chords to word boundaries.** The most common error is seeing a chord near a word and defaulting to the first letter of that word. Chords frequently land in the middle of words (e.g., D over "gives" in "forgives" → index 44, NOT index 41 at the 'f'). Always identify the exact letter, even if it's mid-word.

**Other pitfalls:**

- Narrow letters (i, l, t) take less space than wide ones (m, w) — a chord that looks centered over a word may actually align with a later letter
- When two chords are close together, look carefully at which letter each one's left edge is above
- Do NOT use musical knowledge or phrase structure to guess chord positions. A chord placed at a phrase boundary (e.g., C on "King" in "Oh, King of mercy") may feel logical but the actual visual position could be a different word entirely (e.g., C on "make" in "make our hearts"). Always trust the visual, not musical intuition.
- **Watch for +1 offset errors.** A common counting mistake is landing one character into a word instead of at its first letter. After counting, verify: is the character at your index actually the first letter of the target word/syllable? If you get 'r' of "grace" instead of 'g', you're off by one.

### 3. Create a song JSON file in `src/songs/`

Use an existing song (e.g. `src/songs/god-of-every-grace.json`) as a template. Key rules:

- **Chord positions encode syllable alignment.** Each chord's `charIndex` must match the character in the `lyrics` string where the chord's left edge appears in the source. Use the visual alignment method from step 2.
- **Never hyphenate words** that aren't normally hyphenated. If a source PDF splits a word like "gen-erous" or "beau-tiful", join it back: "generous", "beautiful". Keep hyphens only for words that are legitimately hyphenated in standard English (e.g., "well-known", "Spirit-led").
- **Long lines:** The minimum font size is 15pt — lines must never go below this. If a lyric line is too long to fit at 15pt, split it into multiple lines at a logical break point. Commas often indicate good split points.
- **When splitting lines, determine chord positions BEFORE splitting.** Use the "look down" method on the original unsplit source line to identify which word each chord sits over. Then split the line, assign each chord to whichever split line contains its target word, and recalculate `charIndex` values relative to each new line's start. Never determine chord positions after splitting — this leads to chords being placed on the wrong word (e.g., Em over "life" gets misplaced to "everything" on the second split line, or C over "bride" gets shifted to "the").
- Use literal `©` for copyright and `'` (right single quote) for apostrophes in JSON. Unicode escapes like `\u00a9` and `\u2019` also work but are less readable.
- **Capitalize standalone "O"** in lyrics. The vocative/exclamatory "O" as a single-letter word is always uppercase (e.g., "Come, O church" not "Come, o church").
- Section types match the source material (e.g., `intro`, `verse`, `chorus`, `bridge`, `tag`). Don't add adjectives like "Final" to section labels — just use the plain type name.
- The `sections` array defines the **full song flow** in order. Include all sections (verse 1, chorus, verse 2, chorus, verse 3, final chorus, etc.). The layout planner handles page fitting automatically.

### 4. Generate the .docx files

```bash
pnpm generate songs/my-song.json       # path relative to src/
pnpm generate src/songs/my-song.json   # path from project root also works
pnpm generate                           # generate all songs
```

This produces both `Song Name - Chord.docx` and `Song Name - Lyric.docx` in `generated/`.

### 5. Preview and visually verify

```bash
pnpm preview "Song Name"               # convert to PDF and open
pnpm preview "Song Name" --no-open     # convert only (for agent inspection)
```

After preview, render to images with `pdftoppm` and compare against the original source PDF side by side:

- **Compare chord positions letter-by-letter.** Use the same "look down" method from step 2: for each chord in the generated output, look straight down from its left edge and identify which letter it sits above. Then do the same in the source PDF. The letters must match. If they don't, fix the `charIndex` in the JSON and regenerate.
- No lyric lines wrap to a second line (minimum font is 15pt — split long lines instead)
- The document fits on 2 pages max
- Section labels are correct (VERSE 1, CHORUS, BRIDGE, etc.)

If chords are drifting left or right, adjust the `BOLD_FACTOR` in `src/chord-align.ts` and regenerate. If a chord is over the wrong word, fix the character index in the song JSON and regenerate.

### 6. Clean up

```bash
pnpm clean-previews                     # remove preview files (auto-cleaned on next preview)
```

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

Chord lines and lyric lines alternate — each chord line sits directly above its corresponding lyric line. Chords are positioned over the syllable where the chord change occurs. The left edge of the chord name aligns with the left edge of the target syllable/word.

### Chord Alignment

The generator uses `src/chord-align.ts` to calculate physical text widths and position chords correctly, compensating for the font size difference between 10pt italic chords and 18pt bold lyrics. The `BOLD_FACTOR` constant calibrates this — if chords drift left, increase it; if they drift right, decrease it.

**In the song JSON**, chord positions encode syllable alignment using 0-based character indices into the `lyrics` string (spaces count as characters). Each `[chordName, charIndex]` pair means "this chord falls on the character at `charIndex`." For example, if a chord should fall on the "town" syllable of "downtown", position it at the character offset of "t" in the lyrics string. Words are always separated by exactly one space.

**Trailing chords** (chords that appear after the last lyric word, e.g. instrumental turnarounds) use a `charIndex` equal to the lyrics string length. Multiple trailing chords all use this same value — the minimum-gap enforcement in `chord-align.ts` automatically spreads them out. For example: `"lyrics": "We are Yours alone"` (length 18) with trailing chords `[["D", 0], ["C", 18], ["D", 18], ["G/B", 18]]`.

**Verification is mandatory.** After generating, always run `pnpm preview` and visually inspect that chords are positioned above the correct syllables. Do not skip this step.

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
- **LibreOffice** (`brew install --cask libreoffice`) — for `pnpm preview` (.docx → PDF)
- macOS `textutil` for reading legacy `.doc` files
- Run `pnpm check-deps` to verify all dependencies are installed
