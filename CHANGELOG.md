# Changelog

## 0.2.1 — Unreleased

### Changed

- Make drawing a new drill a prominent action within the practice editor, separate from adding a saved drill.
- Show rink previews for the drills included in a practice.
- Restrict tags to the seven fixed catalog options, removing duplicate choices and custom tag creation.
- Upgrade legacy tag values to canonical fixed tags, grouping unsupported labels under Other without resetting saved content.

## 0.2.0 — 2026-10-22

### Added

- Home screen with Create Practice, Create Drill, Practices, and Drills entry points.
- Browser routes, Back navigation, breadcrumbs, and tag folder browsing.
- Multiple suggested or custom tags on drills and practices, with searchable Show all views.
- A create-drill workflow inside the practice editor that retains the practice draft.
- An additive SQLite upgrade that preserves existing drills and practices and backfills their tags.

## 0.1.0 — 2026-10-22

### Added

- Local hockey training POC using .NET 10 controllers, React, TypeScript, and SQLite.
- Interactive full-rink drill editor with equipment, skating/passing/puck-handling routes, labels, object rotation, and undo/redo.
- Searchable drill library with categories, coaching notes, and reusable drill variations.
- Practice plans with ordered drills, durations, and session notes.
- Downloadable drill and practice PDFs with diagrams, notes, and pagination.
- Starter drills and a practice created only for a new database.
- Input validation, persisted local data, and protection against deleting referenced drills.
- Agreed API contract and project development conventions.
- Implementation checklist and configurable hockey development skill.
- Local development scripts and automated API, editor state, PDF, and browser checks.

Authentication, teams, and deployment are deferred until the next review. The initial POC was reviewed locally before publication to the repository.
