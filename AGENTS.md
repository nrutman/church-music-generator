# Agent Instructions

**Read `README.md` first.** It contains the project overview, song JSON format, build pipeline, layout rules, and project structure. Always keep both `README.md` and this file up to date when making changes.

**Give frequent progress updates.** During multi-step tasks (song generation, chord extraction, previewing, etc.), provide a brief status update before and after each step. Never go more than one tool call without telling the user what you're doing and what's next. Silence makes it look like you're stuck.

**Run file conversions sequentially.** When asked to generate or convert multiple songs, process them one at a time. Do not use sub-agents or parallel tool calls for `pnpm generate`, `pnpm preview`, or LibreOffice conversions — these are heavy operations that should run sequentially.

**Code changes require tests.** When modifying or adding logic in `src/`, write or update corresponding tests in `src/__tests__/`. This applies to both TypeScript (tested with vitest via `pnpm test`) and Python (tested with pytest via `pnpm test:python`). After updating tests, review them against these questions: (1) Are we missing any high-value test cases? (2) Can tests be consolidated or simplified? (3) Are there any low-value tests to remove? Keep tests focused on behavior, not implementation details or magic numbers.

**Check `.gitignore` before committing.** Before staging files, read `.gitignore` to know which files are excluded from version control (e.g., `src/songs/*.json`, `generated/`, `dist/`). Do not look for these files in `git status` or try to commit them.

**Publishing is always explicit.** `pnpm generate` must never publish automatically. After generation, preview, and visual verification, use `pnpm publish-song <song.json> --dry-run` before `pnpm publish-song <song.json>`. Google Drive is the master; Planning Center mirrors the same reviewed `.docx` artifacts.

**Use the repository skills for song operations.** The canonical workflows live in `.agents/skills/generate-song-sheets/SKILL.md` and `.agents/skills/publish-song-sheets/SKILL.md`; `.claude/skills` symlinks to the same directory. The generation skill asks whether to publish only after visual verification. The publishing skill requires backups, dry-run review, explicit approval, sequential publication, and hash verification.

**Require a three-day package release age.** Never install or upgrade any direct or transitive package version until it has been published for at least three full days (4,320 minutes). The committed `minimumReleaseAge` setting in `pnpm-workspace.yaml` enforces this during dependency resolution. Verify publication times before selecting versions, and never bypass the gate or add an exclusion without explicit user approval.

---

## Quick-Start: Generating Songs from PDFs

This is the most common task. Follow these steps:

### 1. Extract content from the source PDF

Read the PDF visually. Identify: title, composers, copyright, CCLI number, and the section structure (intro, verses, chorus, bridge). Note which chords fall above which syllables.

### 2. Determine chord positions using coordinate extraction

**Do NOT estimate chord positions visually.** Proportional fonts and font size differences between chords (10pt italic) and lyrics (18pt bold) make visual "look down" alignment unreliable. Instead, use the extraction script to get exact X/Y coordinates:

```bash
pnpm extract-chords path/to/source.pdf
```

This runs `src/extract-chord-positions.py`, which:

1. Extracts word bounding boxes from the PDF via `pdftotext -bbox`
2. Identifies chord lines vs lyric lines by content analysis
3. Maps each chord's X coordinate to the lyric character at that same X position
4. Outputs `charIndex` values and ready-to-use JSON chord arrays

The script uses regex-based chord detection (`/^[A-G][#b]?(...)/`) so it works for any key or chord type without maintaining a dictionary.

**Interpreting the output:** The script outputs one block per chord-line/lyric-line pair. Each chord shows its `charIndex`, the character it lands on, and the raw X coordinate. It also outputs a JSON-ready `"chords"` array you can paste directly into the song file. Review the output for:

- **Trailing chords** (marked `TRAILING`) — these should use the lyric string's length as their `charIndex`
- **Hyphenated words in the source** (e.g., "for-ev-er") — the charIndex is relative to the source text. When you write "forever" in the JSON (removing hyphens), adjust indices for the removed hyphen characters
- **Mid-word landings** — chords frequently land on interior syllables (e.g., D/F# on the 'a' of "creation"). This is correct; do NOT snap to the word's first letter

After extracting positions, split long lines and reassign chords as described in step 3.

### 3. Create a song JSON file in `src/songs/`

Use an existing song (e.g. `src/songs/god-of-every-grace.json`) as a template. Key rules:

- **Chord positions encode syllable alignment.** Each chord's `charIndex` must match the character in the `lyrics` string where the chord's left edge appears in the source. Use the visual alignment method from step 2.
- **Never hyphenate words** that aren't normally hyphenated. If a source PDF splits a word like "gen-erous" or "beau-tiful", join it back: "generous", "beautiful". Keep hyphens only for words that are legitimately hyphenated in standard English (e.g., "well-known", "Spirit-led").
- **Long lines:** The minimum font size is 15pt — lines must never go below this. If a lyric line is too long to fit at 15pt, split it into multiple lines at a logical break point. Commas often indicate good split points.
- **When splitting lines, determine chord positions BEFORE splitting.** Use the "look down" method on the original unsplit source line to identify which word each chord sits over. Then split the line, assign each chord to whichever split line contains its target word, and recalculate `charIndex` values relative to each new line's start. Never determine chord positions after splitting — this leads to chords being placed on the wrong word (e.g., Em over "life" gets misplaced to "everything" on the second split line, or C over "bride" gets shifted to "the").
- **Capitalize the first letter of every split line.** When a line is split, the continuation line must start with a capital letter even though it was mid-sentence in the original (e.g., "to share in Your love" → "To share in Your love"). This applies to all lyric lines — every line in the JSON should begin with a capital letter.
- **No trailing punctuation on lyric lines.** Do not end lyric lines with commas, periods, semicolons, or other punctuation. If the source PDF has a comma or period at the end of a line, drop it. (Exception: question marks and exclamation marks may be kept if they are part of the song's expression.)
- Use literal `©` for copyright and `'` (right single quote) for apostrophes in JSON. Unicode escapes like `\u00a9` and `\u2019` also work but are less readable.
- **Capitalize standalone "O"** in lyrics. The vocative/exclamatory "O" as a single-letter word is always uppercase (e.g., "Come, O church" not "Come, o church").
- Section types match the source material (e.g., `intro`, `verse`, `chorus`, `bridge`, `tag`). Don't add adjectives like "Final" to section labels — just use the plain type name.
- The `sections` array defines the song flow in order. It does NOT need to include every repetition from the source — use the space-saving strategies below.
- **Fitting songs into 2 pages** — use these strategies in priority order (most desirable first):
  1. **Duplicate the chorus on page 2** if it fits without sacrificing chords on any verse. When duplicating a chorus for the chord sheet, set `"lyricHide": true` on the duplicate so it is excluded from the lyric sheet (lyric sheets should only ever have one chorus).
  2. **Remove verbose repeated sections.** If a later chorus or bridge repeats an earlier one (with only minor differences like an added G Em), drop it. Musicians know how to repeat sections. A "final chorus" that's just the regular chorus 2× should be dropped entirely.
  3. **Relax "every page has a chorus."** If choruses don't differ significantly, one chorus instance in the whole song is fine. Don't duplicate choruses just to have one per page.
  4. **Split long lines and reduce font size** within allowed limits (`lyricSize` 16 minimum). Splitting at commas is preferred. Every split line must start with a capital letter.
  5. **Use `lyricsOnly` on verses** as a last resort, and only one at a time. In a 3-verse song, if removing chords from 1 verse fits the song in 2 pages, stop there. Keep chords on as many verses as possible. Only use `lyricsOnly` when a verse shares the same chord pattern as an earlier verse that has full chords.
- **`lyricSize`** (song-level, optional): Set the base lyric font size in points (default 18). Use `"lyricSize": 16` when a song doesn't fit at the standard size. All lyric line heights scale proportionally.
- **`lyricsOnly`** (section-level, optional): Set `"lyricsOnly": true` on a section to omit chord lines on the chord sheet. The section renders with just the label and lyrics (like the lyric sheet).
- **`lyricHide`** (section-level, optional): Set `"lyricHide": true` on a section to exclude it from the lyric sheet entirely. Use this on duplicate choruses that are added to the chord sheet for convenience — lyric sheets should only ever have one copy of each chorus.
- **`key`** (song-level): The audible/performed key used for Planning Center. A Capo chart written in another key is still attached under this performed key.
- **`ccliNumber`** (song-level, optional): Numeric CCLI song number used when creating a missing Planning Center Song. The publisher also parses common CCLI forms from `copyright`.
- **`skipPublish`** (song-level, optional): Set `true` to prevent publishing. Omitted/`false` allows publishing.
- **`planningCenterArrangement`** (song-level, optional): Selects or creates a specifically named Planning Center Arrangement. Omit it for the default/single Arrangement.

### 4. Generate the .docx files

```bash
pnpm generate songs/my-song.json       # path relative to src/
pnpm generate src/songs/my-song.json   # path from project root also works
pnpm generate src/songs/my-song.json --chords-only # preserve an unchanged lyric sheet
pnpm generate                           # generate all songs
```

This produces both `Song Name - Chord.docx` and `Song Name - Lyric.docx` in `generated/`.

Generation writes only to `generated/`. It must not copy files to Google Drive or invoke publishing. In an agent workflow, complete preview and visual verification before asking whether the user wants to publish.

**Filename rules:** The generated filenames are derived from the `title` field but with two transformations: (1) strip any leading article ("A ", "An ", or "The ") and (2) remove all punctuation (apostrophes, commas, etc.). The title in the JSON and the document content remain unchanged — only the filename is affected. For example, `"title": "A Christian's Daily Prayer"` produces `Christians Daily Prayer - Chord.docx`.

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

Generate both a chord sheet and a lyric sheet for new songs. For an explicit chord-only revision
with unchanged lyrics, use `--chords-only` so the reviewed lyric artifact remains untouched.

### Publishing reviewed sheets

Publishing requires `GOOGLE_DRIVE_LYRIC_DIR`, `GOOGLE_DRIVE_CHORD_DIR`, `PLANNING_CENTER_CLIENT_ID`, `PLANNING_CENTER_SECRET`, and `PLANNING_CENTER_USER_AGENT` in gitignored `.env.local`.

1. Run `pnpm publish-song src/songs/song-name.json --dry-run` and review every proposed replacement and Planning Center selection. Add `--chords-only` for an explicit chord-only revision with unchanged lyrics.
2. Resolve duplicate Song, Arrangement, Key, Attachment, or Attachment Type prompts using the displayed metadata and links. Never guess.
3. When no exact Planning Center Song matches, select an existing Song/URL if the title differs. Create a new Song only after the user explicitly confirms it is new.
4. Run `pnpm publish-song src/songs/song-name.json` only after the dry-run is correct.
5. Standard and Capo charts both attach under the performed `key`; lyrics attach to the selected/default Arrangement.
   Use a classified Planning Center Attachment Type when the organization defines one; otherwise leave the attachment untyped.
6. Legacy `.doc` and current `.docx` files with the same filename stem are one logical artifact and are replaced by the generated `.docx`.
7. If `.publish-state/` reports incomplete Planning Center reconciliation, rerun the same publish command. Do not manually create duplicate attachments.

### Pushing to a PR

After pushing changes to a branch with an open PR, always monitor the CI status checks (`gh pr checks <number> --watch`) and verify they all pass. If any fail, fix the issue locally, commit, push, and watch again until all checks are green. Common failures:

- **Format** — run `pnpm exec oxfmt <files>` to fix
- **Lint** — run `pnpm lint` to see errors
- **Type Check** — run `pnpm typecheck` to see errors
- **Test** — run `pnpm test` to see failures

This file contains the precise format specifications that agents need to produce correctly formatted `.docx` files. Everything below supplements (not duplicates) what's in README.md.

---

## Providence Church Chord Sheet Format

### Page Layout

- US Letter (8.5" x 11")
- Margins: 0.5" top/bottom, 1" left/right
- Font: Arial throughout

### Styles

| Style              | Font  | Size         | Weight | Other                                                            |
| ------------------ | ----- | ------------ | ------ | ---------------------------------------------------------------- |
| Title              | Arial | 24pt (sz 48) | Bold   | ALL CAPS, centered                                               |
| Body Text (lyrics) | Arial | 18pt (sz 36) | Bold   | Indent: left 720 + firstLine 720 DXA                             |
| Chords - 1st Line  | Arial | 10pt (sz 20) | Normal | Italic. Applied to the leading cell of the first chord row       |
| Chords             | Arial | 10pt (sz 20) | Normal | Italic. Applied to the leading cell of later chord rows          |
| Section labels     | Arial | 12pt (sz 24) | Bold   | ALL CAPS, not italic. In the leading cell of the first chord row |

### Section Labels

Section labels (VERSE 1, CHORUS, VERSE 3, INTRO, etc.) appear in the leading cell of the section's first chord-row table: bold, not italic, caps, 12pt. Chords occupy subsequent fixed-width cells in the same borderless row.

### Document Structure

```
[empty paragraph]
[Title - centered, bold, caps]
[empty paragraph]

[Borderless chord table: "VERSE 1" cell + fixed-position chord cells]
[BodyText: lyric line]
[Borderless chord table: empty leading cell + fixed-position chord cells]
[BodyText: lyric line]
...
[two empty paragraphs between sections]

[Borderless chord table: "CHORUS" cell + fixed-position chord cells]
[BodyText: lyric line]
...
```

Chord tables and lyric paragraphs alternate — each chord row sits directly above its corresponding lyric line. Chords are positioned over the syllable where the chord change occurs. The left edge of the chord name aligns with the left edge of the target syllable/word. Tables use fixed DXA widths, matching grid and cell widths, zero cell margins, and hidden borders for cross-viewer compatibility.

### Chord Alignment

The generator uses `src/chord-align.ts` to calculate physical text widths and position chords correctly, compensating for the font size difference between 10pt italic chords and 18pt bold lyrics. `src/chord-table.ts` converts those absolute positions into fixed table-column widths. The `BOLD_FACTOR` constant calibrates this — if chords drift left, increase it; if they drift right, decrease it.

**In the song JSON**, chord positions encode syllable alignment using 0-based character indices into the `lyrics` string (spaces count as characters). Each `[chordName, charIndex]` pair means "this chord falls on the character at `charIndex`." For example, if a chord should fall on the "town" syllable of "downtown", position it at the character offset of "t" in the lyrics string. Words are always separated by exactly one space.

**Trailing chords** (chords that appear after the last lyric word, e.g. instrumental turnarounds) use a `charIndex` equal to the lyrics string length. Multiple trailing chords all use this same value — the minimum-gap enforcement in `chord-align.ts` automatically spreads them out. For example: `"lyrics": "We are Yours alone"` (length 18) with trailing chords `[["D", 0], ["C", 18], ["D", 18], ["G/B", 18]]`.

**Verification is mandatory.** After generating, always run `pnpm preview` and visually inspect that chords are positioned above the correct syllables. Do not skip this step.

### Header

- Left: "Providence Church (Updated DD Mon YYYY)" — Arial, 8pt
- Right: "Page X of Y" — Arial, 8pt
- Layout: borderless two-column fixed table, with left- and right-aligned cells

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
- **Section label + first lyric on the same row.** A borderless fixed table uses a 1440-DXA label cell and a lyric cell for the first line. The lyric paragraph uses BodyText style with indent overridden to `left: 0, firstLine: 0`.
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
