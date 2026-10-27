# Changelog

## Unreleased

- Split the .NET backend into Domain, Application, Infrastructure, and API projects with explicit dependency boundaries and focused test projects.

## 0.3.0 — Unreleased

### Added

- Add saved drill/practice view pages with top PDF export and authorised Edit/Create copy actions. Choose an authorised team or club destination before copying, preserve complete independent plan/drill copies, and open the new copy’s view automatically.

- Add backwards-skating routes with alternating angled marks, shot routes with separated parallel rails and one extended arrowhead, and plain full/dotted/dashed lines without arrowheads across editor, previews, and PDF export.

- Add **Battling** as a fixed drill/practice category for puck battles and close-contact skills.

- Add a database-backed age-group catalog and fixed dropdowns for teams, drills, and practices (U8–U16, U18, U19, U20, Senior), with server validation and preservation of prior metadata.

- Organisation/team selection, server-checked memberships, team-owned libraries, and a filtered club library with ownership/visibility indicators and read-only use.
- Explicit, atomic sharing of practice plans and their required private drills, independent team copies, individual practice-drill copy/replacement, and safe dependency blockers for unsharing/deletion.
- Organisation-admin content/team/member management, optional age-group metadata, a preserved legacy workspace, and an explicit hosted administrator adoption setting.
- Additive SQLite ownership upgrades and a separate reviewed PostgreSQL migration; no automatic hosted schema changes or content seeding.

- Document the production custom apex-domain setup with Cloudflare DNS, Azure App Service managed SNI SSL, Bicep `AllowedHosts` configuration, and Supabase callback URLs using placeholders instead of live DNS or verification values.
- Add the public production-project Supabase CA and separate, manually triggered infrastructure and application workflows for a temporary evaluation environment named `prod`.
- Document production GitHub variables, Azure identity, Supabase connection, and launch prerequisites.
- Add optional local Supabase email magic-link sign-in and logout, with signed-in email in the header and bearer-token protection for content APIs. Keep the unauthenticated POC available in Development; staging remains gated.
- Prepare environment-specific Supabase Auth settings in Bicep from GitHub variables. The owner approved a shared staging workspace for any user with a valid session from the configured Supabase project; no staging resources are applied by this change.
- Add a manual staging database initialization workflow for the reviewed CI migration bundle, requiring the Azure web app to remain stopped and private before applying it.
- Plan the remaining staging Auth setup, temporary tester access, and separate production project.
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

### Fixed

- Run workspace membership changes and their authorization reads inside the PostgreSQL retry strategy, preserving serializable transactions in hosted deployments.

### Changed

- Consolidate deployment operations into Build and test, manual Release application, and manual Deploy infrastructure. Use one environment-aware deployment template; promote the exact successful stage package into prod, record release provenance/results, include database initialization in normal deployment, and validate workflows with pinned actionlint.

- Leave absent drill instructions and practice-entry notes blank, and remove the explanatory boilerplate from practice drill cards.

- Return edited drills and practices to their saved view after saving; center both view pages using the editor’s desktop width and mobile spacing. Copy confirmation opens the new copy’s saved view.

- Default new practice names to today’s local date, require an explicit drill name, and emphasize name fields over creation headings. Keep the selected team while viewing or editing club content and remove the library entry from the team selector, including correct club ownership for drills created inside club practices.

- Open drill/practice editors at the top, use plain notes headings, and extend goal rotation to a visible 360° endpoint.
- Show a static loading placeholder during sign-in, workspace discovery, and content fetches; prevent premature permission/empty states and keep fetch errors separate from missing content.
- Initialise empty content ages consistently so cancelling an untouched nested drill does not show an unsaved-changes prompt.
- Remove team age-group settings, selector suffixes, and automatic age inheritance for new drills/practices. Keep independent content age selections and preserve existing data without a schema migration.
- Restrict organisation creation and administrator appointments to the existing configured platform administrator. Organisation administrators manage all teams in their own organisation and can change/remove regular memberships; protected administrator accounts require platform access.
- Add member/team role editing and removal with confirmation, transactional organisation-wide team-access cleanup, preserved content, and current membership checks for existing sign-in sessions. Users without an organisation see an access message with Account/logout available.

- Smooth route-arrow headings over the final stretch of a gesture to avoid sharp turns from tiny pointer movements.
- Keep newly drawn pass and shot routes straight between their start and end points, regardless of intermediate pointer movement.
- Increase the alternating tilt of backwards-skating marks and label the existing puck-handling route “Skate with puck” in the toolbar.
- Move drill and practice Categories and Age groups below their notes in editable and read-only views.
- Make puck symbols smaller, arrange puck piles as irregular clusters of flat pucks, and enlarge the drill and practice title inputs.

- Remove the account icon border, present organisation management as a button, and inset dropdown arrows with consistent spacing. Align Account sections and place a distinct logout button beneath the email field.

- Use plain Create new drill/practice headings without subtitles and keep copying to the organisation inside the editor rather than search results.

- Combine team/club content in Drills and Practices using persistent source checkboxes and ownership badges; remove separate club-library navigation.
- Add per-user default-team preferences in Account, automatic defaults for a single team, and membership-checked persistence.
- Support multiple content age groups with checkbox/select-all controls and preserve legacy ages in a separate reviewed metadata migration.
- Keep authenticated local workspaces empty after content resets. Back up and clear only the owner's requested local clubs, teams, memberships, drills, practices, and default-team preferences; retain Supabase users and the age catalog.

- Replace visibility-based sharing with explicit independent copies between team workspaces and the organisation library. Complete plan copies include all drills, preserve repeated-reference mappings and entry metadata, and commit atomically.
- Restrict practice references to the exact owning workspace in API validation and database guards; private team content requires explicit team membership, including for organisation admins.
- Replace sharing toggles with copy confirmations, prevent double submission, and link to new copies. Plan drill pickers contain only local drills.
- Add a deterministic, transactional legacy-data migration: keep team originals private, create library copies of old shared content, repair accessible cross-workspace drill references, and stop on ambiguous private/cross-organisation dependencies without exposing content.

- Use **Available to all teams** for organisation-wide content in the team selector and library.
- Disable Save for unchanged saved drills/practices, retaining creation of new drafts and re-enabling Save after edits.
- Move email/logout into an Account page reached through an accessible account icon; use the logo for Home and place Club library last in the content navigation.
- Adapt phone navigation, workspace selectors, filters, practice fields, and editor actions to narrow screens with larger touch targets.

- Verify the separate `prod` evaluation rollout through GitHub Actions, including PostgreSQL initialization and application/database/Auth smoke checks; keep real email-flow verification pending.
- Delay reading existing App Service settings until the web module completes, allowing infrastructure deployment into an empty environment.
- Replace GitHub staging enablement variables with reviewed public-access Bicep parameters and manually triggered release workflows. Record the owner's approval to use the same shared-workspace evaluation scope in the separate `prod` project, while keeping real production prerequisites open.
- Number the normal CI → staging app release path, label infrastructure and database workflows by when they are needed, and select the current-main CI artifact automatically without a run ID. Keep stage-specific entry points separate from future production configuration.
- Permit the owner's limited staging POC to defer backup/restore while requiring live database readiness and Auth smoke checks in the GitHub Actions deployment pipeline; keep recovery due before production.
- Package Supabase's public staging database CA and select environment-specific certificates automatically for verified PostgreSQL connections in the API and migration bundle, without changing the connection secret.
- Route completed magic-link callbacks through React Router so signing in again after logout returns to Home.
- Exercise the published application in CI with test-only Supabase Auth settings, including an anonymous-content rejection, so the production-mode smoke check can run after hosted Auth became required.
- Restore environment-specific Key Vault (`kv-hockey-stage`, future `kv-hockey-prod`) and Bicep-owned App Service settings. Bicep creates the vault secret from a secure GitHub parameter, grants the app Get access, and sets a versionless reference; migrations still use the GitHub secret directly.
- Read the non-sensitive Supabase project reference from the GitHub stage environment variable when validating the connection target.
- Simplify staging to one Npgsql-formatted standard Supabase project connection secret for runtime and migrations, with verified TLS and no URI conversion. Custom database roles are no longer required for the POC.
- Replace hosted SQL Server with Supabase PostgreSQL through Npgsql; add PostgreSQL migrations and separate application/history schemas while preserving local SQLite.
- Retire Azure SQL, its VNet/service endpoint, unused Key Vault, administrator tool, and bootstrap/firewall scripts. Update CI and manual maintenance releases for Supabase database credentials; auth and public deployment remain deferred.
- Document manual Azure resource retirement and the reduced GitHub/Supabase configuration.
- Fix the infrastructure app-settings circular dependency by reading existing settings in the parent deployment and passing them through a secure module parameter.
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
