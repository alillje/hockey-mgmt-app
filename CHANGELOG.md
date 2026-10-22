# Changelog

## 0.3.0 — Unreleased

### Added

- Scripted staging SQL administrator bootstrap with a custom migration role, read-only database preview, and maintenance releases using a standard EF migration bundle and the existing OIDC deployment identity.
- B1 VNet integration with a SQL service endpoint/subnet rule, merged managed-identity app settings, and temporary migration-runner firewall cleanup with retries, deletion verification, and retained recovery records on failure.

- Explicit SQL Server/Azure SQL configuration, initial EF migration, pinned EF tooling, and review-only idempotent SQL output; preserve local SQLite upgrades.
- Serve published React assets and client routes through ASP.NET Core, preserving API/asset 404 responses.
- Add read-only database readiness and hosted-provider/SPA tests, including a disposable SQL Server CI service.

- Readable GitHub Actions templates for application checks, manual staging infrastructure preview/apply, and gated deployment of a trusted CI artifact.
- Shared Bicep modules with separate staging and future production parameter files; only staging is connected to deployment.
- An Azure OIDC bootstrap and secret-storage guide; no live resources or credentials configured.
- A future teams, authentication, and Azure hosting design document with a staging-only initial rollout and phased checklist; production deferred, no application or infrastructure implementation.
- A puck-pile object, a half-size tire, and a red-player creation preset.

### Changed

- Create and clean up practice browser-test fixtures explicitly so CI works with an empty database after removing example data; allow a separate browser-test database path for fresh-start verification.
- Start new databases without example drills or practices; remove automatic seeding while preserving existing saved content.
- Record successful staging infrastructure rollout and the remaining hosted-application prerequisites.
- Read structured Azure CLI runtime JSON instead of matching an exact TSV line; separate runtime validation from infrastructure preview and report missing runtimes clearly.
- Correct Azure federation instructions to use verified numeric GitHub owner/repository IDs and this repository's immutable OIDC subject.
- Clarify portal setup, client-ID locations, and secret-free Azure OIDC deployment instructions.
- Share one GitHub `stage` environment between manual IaC/app deployment workflows and use one Azure deployment identity through `AZURE_CLIENT_ID`.
- Name the infrastructure folder `iac` and retain explicitly manual infrastructure and application deployments.
- Keep category checkbox URL updates synchronous and update the browser regression test to select the intended Player option.
- Replace single-tag library filters with Categories checkboxes that match any selected category and retain selections through browser navigation.
- Rename the drill and practice editor's Tags label to Categories.
- Remove the heading section above the rink toolbar.
- Enlarge goals with a rounded B-shaped net and limit the rotation slider to the four distinct orientations, 0–270°.
- Make cones smaller and slimmer across rink views.
- Remove the color picker and object label field; use palette player colors and teal for new routes while preserving existing saved diagrams.
- Label both player color options Player and expose a full-circle goal rotation slider with 90° stops.
- Extend goal lines to the boards across editor, practice previews, and PDFs.
- Draw hockey goals with a recognizable frame and net, with rotation snapping to 90° steps.

## 0.2.1 — 2026-10-22

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
