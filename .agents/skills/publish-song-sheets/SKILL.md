---
name: publish-song-sheets
description: Safely publishes reviewed song sheets to the configured Google Drive folders and Planning Center, with backups, dry-run review, explicit approval, and post-publish verification. Use only when the user explicitly asks to publish or confirms the generation workflow's publish prompt.
compatibility: Requires configured .env.local publishing credentials and reviewed generated DOCX files.
---

# Publish Song Sheets

Read `README.md` and `AGENTS.md` completely before starting. Publishing is a side effect and always requires explicit user approval.

## Preconditions

1. Confirm each requested song has visually reviewed `.docx` files in `generated/` and a valid performed `key` in its song JSON.
2. Respect `skipPublish: true` without offering to bypass it.
3. Confirm the required `.env.local` variables are set without displaying their values.
4. Process multiple songs sequentially.
5. Resolve Song identity before publication. Read the source footer for its CCLI Song number, distinct from the church's license number. If unknown, search the web for “what is the CCLI number for [SONG TITLE] by [ARTIST/SONGWRITERS]”. Prefer SongSelect, publisher, or other authoritative metadata. Compare title, writers, and copyright with the source; show citations and ask the user to resolve uncertain or conflicting matches. Never guess between same-title Songs. Save a verified `ccliNumber` in song data before generation; if data changes after generation, regenerate and verify before publishing.

## Backup and dry-run

1. Before the first actual publish in a batch, create a timestamped backup under the repository-local, gitignored `.publish-backups/` directory.
2. Back up every matching Drive `.doc`/`.docx` that may be replaced.
3. Download each existing Planning Center Word attachment by `POST`ing to its attachment `open` action, then fetching the returned `attachment_url`.
4. Write a manifest containing source resource IDs, locations, byte sizes, and SHA-256 hashes. Validate every backup against the manifest before continuing.
5. Run `pnpm publish-song src/songs/<song-name>.json --dry-run` for each song.
6. Summarize Drive replacements, Planning Center Song/Arrangement/Key placement, file creation, and any ambiguity prompts.
7. Search the library by CCLI first (the CLI does this automatically), then title. For known CCLI with no library match, explicitly approve new Song creation. A dry run shows the proposed import but cannot fetch imported metadata without creating a Song.

## Approval and publish

Ask the user to approve the complete dry-run plan. Do not treat an earlier request to generate as publishing approval.

After approval, run `pnpm publish-song src/songs/<song-name>.json --yes` sequentially. Resolve ambiguous or missing Planning Center resources only according to the user's direction.

For a new Song with CCLI, the client sends only the CCLI number as `title` to import metadata. The workflow reads the new Song back and displays its metadata alongside the source. Compare writer/copyright credits and confirm the identity prompt; `--yes` does not bypass it. Stop and ask the user if imported metadata is uncertain or conflicts. No sheets are uploaded/copied before this approval. Rejected imports remain in Planning Center for inspection, with no files published; report the Song ID/link and reuse/resolve it on retry rather than creating duplicates. Planning Center's automatically created Default Arrangement is reused.

If no CCLI number can be verified, the CLI accepts a blank number only with explicit approval of the supplied manual metadata. Do not treat failure to find a title match as proof that a new Song is needed.

## Verification

1. Verify each Drive destination has exactly one canonical `.docx` per published artifact and that its SHA-256 matches `generated/`.
2. Download each resulting Planning Center attachment and verify its SHA-256 matches `generated/`.
3. Verify lyrics are on the selected Arrangement and standard/Capo charts are on the performed Key.
4. Verify preserved Arrangements and legacy files were not changed when publishing an alternate Arrangement.
5. Confirm `.publish-state/` contains no recovery marker. If one exists, stop and reconcile before reporting success.
6. After every Drive and Planning Center artifact passes hash and placement verification, delete the completed batch's directory from `.publish-backups/`. Do not delete it when publishing or verification is incomplete.
7. Report the published songs, placements, verification counts, and whether the temporary backup was removed or retained for recovery.
