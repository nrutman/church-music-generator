---
name: generate-song-sheets
description: Generates Providence Church chord and lyric sheets from a source PDF or supplied song data, then previews and visually verifies the documents. Use when asked to generate, create, revise, or reformat a song sheet.
compatibility: Requires pnpm, poppler, LibreOffice, and the dependencies documented in this repository.
---

# Generate Song Sheets

Read `README.md` and `AGENTS.md` completely before starting. Follow their song JSON, chord-positioning, layout, and sequential-conversion requirements.

## Workflow

1. Confirm the source PDF or song data, requested source page/key, and any special arrangement requirements.
2. Inspect the source visually and run `pnpm extract-chords <source.pdf>` when coordinates are available. Never estimate chord positions from visual spacing alone.
3. Create or update `src/songs/<song-name>.json`. Preserve the performed `key`, Capo information, CCLI metadata, and any publishing controls.
4. Run `pnpm generate src/songs/<song-name>.json`.
5. Run `pnpm preview "<Song Name>" --no-open`, render the PDFs to images, and compare them with the source.
6. Correct chord placement, wrapping, section flow, page count, and metadata until both documents pass visual verification.
7. Report the generated file paths and verification result.

Run generation, preview, LibreOffice, and other file conversions sequentially.

## Publishing handoff

Generation must never copy files into Google Drive or update Planning Center.

After visual verification succeeds, ask:

> The chord and lyric sheets are verified. Would you like me to publish them now?

If the user declines, stop after reporting the reviewed files. If the user confirms, read `../publish-song-sheets/SKILL.md` and follow it. Do not publish before that confirmation.
