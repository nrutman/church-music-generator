---
name: build-binder
description: Build a print-ready PDF binder from local chord-sheet titles or a Planning Center service date. Use for music, worship, chord-sheet, service-plan, or setlist binder requests. Do not use to author or publish song sheets.
compatibility: Requires pnpm, Poppler, LibreOffice, configured binder paths, and Planning Center credentials for service-plan mode.
---

# Build Binder

Read `README.md` and `AGENTS.md` completely before starting. Building a binder never authors or publishes song sheets.

## Safety contract

1. Resolve before building. Never silently guess a local match or Planning Center attachment.
2. Never choose between standard and Capo charts for the user.
3. Stop when a source has more than two effective pages.
4. Preserve setlist order. Page 1 stands alone and two-page songs stay on facing spreads.
5. Report every trailing chrome-only page trim and recommend cleaning the source document. Never edit the source automatically.

## Local workflow

1. Run `pnpm check-deps` on first use in a session.
2. Resolve titles with `pnpm binder resolve "Title" ...`.
3. If every title has exactly one credible candidate scoring at least 0.90, proceed; otherwise show all candidates and wait for the user's selections.
4. Build from explicit paths: `pnpm binder build --name "Sunday Service" FILE ...`.
5. Report the resolved songs, layout, trim warnings, and final PDF path.

## Planning Center workflow

1. Resolve the plan with `pnpm binder pco-resolve --date YYYY-MM-DD`.
2. Resolve Service Type or Plan ambiguity with `--service-type ID` or `--plan-id ID`.
3. For an ambiguous attachment, show every candidate and rerun with the printed item-specific `--pick ITEM_ID=ATTACHMENT_ID`. Item IDs are required when the same Song appears more than once.
4. Run `pnpm binder pco-build` with the identical date, selection, and pick arguments, plus an optional `--name`.
5. Report the final ordered song list, layout, warnings, and PDF path.

Use `pnpm binder doctor` for a read-only Planning Center authentication and Service Type check.

## Configuration

Binder paths use `CHORD_SHEETS_DIR`, `BINDER_OUTPUT_DIR`, optional `FUZZY_MATCH_THRESHOLD`, and optional `SOFFICE_PATH`. Planning Center uses the same `PLANNING_CENTER_*` credentials as publishing. Real values belong only in gitignored `.env.local`; never display credentials.
