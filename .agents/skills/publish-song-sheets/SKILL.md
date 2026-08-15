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

## Backup and dry-run

1. Before the first actual publish in a batch, create a timestamped backup under the repository-local, gitignored `.publish-backups/` directory.
2. Back up every matching Drive `.doc`/`.docx` that may be replaced.
3. Download each existing Planning Center Word attachment by `POST`ing to its attachment `open` action, then fetching the returned `attachment_url`.
4. Write a manifest containing source resource IDs, locations, byte sizes, and SHA-256 hashes. Validate every backup against the manifest before continuing.
5. Run `pnpm publish-song src/songs/<song-name>.json --dry-run` for each song.
6. Summarize Drive replacements, Planning Center Song/Arrangement/Key placement, file creation, and any ambiguity prompts.

## Approval and publish

Ask the user to approve the complete dry-run plan. Do not treat an earlier request to generate as publishing approval.

After approval, run `pnpm publish-song src/songs/<song-name>.json --yes` sequentially. Resolve ambiguous or missing Planning Center resources only according to the user's direction.

## Verification

1. Verify each Drive destination has exactly one canonical `.docx` per published artifact and that its SHA-256 matches `generated/`.
2. Download each resulting Planning Center attachment and verify its SHA-256 matches `generated/`.
3. Verify lyrics are on the selected Arrangement and standard/Capo charts are on the performed Key.
4. Verify preserved Arrangements and legacy files were not changed when publishing an alternate Arrangement.
5. Confirm `.publish-state/` contains no recovery marker. If one exists, stop and reconcile before reporting success.
6. After every Drive and Planning Center artifact passes hash and placement verification, delete the completed batch's directory from `.publish-backups/`. Do not delete it when publishing or verification is incomplete.
7. Report the published songs, placements, verification counts, and whether the temporary backup was removed or retained for recovery.
