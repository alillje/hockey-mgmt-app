# Hockey Trainer Management — delivery checklist

## Public introduction

- [x] Add a separate About page with a responsive sample rink preview and administrator access guidance; verify frontend compilation and production build.
- [ ] Review the About page visually on desktop and mobile before release.

## Release workflow quality

- [x] Consolidate runnable workflows into Build and test, Release application, and Deploy infrastructure; reuse one environment-aware deployment template.
- [x] Pin promotion to the exact package verified by a successful stage release, with provenance, run-attempt, expiry, and digest checks.
- [x] Verify release selection, package identity, shared workflow syntax, and disposable packaging locally (45 deployment-helper tests, actionlint 1.7.12, shell syntax, and scoped whitespace checks).
- [x] Push the refactor, pass CI, deploy and verify stage, and promote the same package to the prod evaluation environment.

## Organisation administration

- [x] Restrict organisation creation and administrator appointments to the existing configured platform identity.
- [x] Give organisation administrators access to all teams in their organisation; require explicit team access for regular members.
- [x] Add regular member role editing and team/organisation removal, protecting administrator accounts and preserving content.
- [x] Clear affected default teams and remove all team access in an organisation atomically on membership removal.
- [x] Show users without organisation access a clear message and retain Account/logout access.
- [x] Verify API permissions, membership enforcement for existing tokens, cross-organisation isolation, and browser member management (41 API tests, 14 frontend tests, 7 browser checks; 2 PostgreSQL tests skipped locally without a configured test server).
- [ ] Add application email invitations later when requested.

## Drawing controls

- [x] Refine puck and puck-pile shapes and enlarge drill/practice title inputs.
- [x] Add backwards-skating, shot, full-line, dotted-line, and dashed-line routes with consistent editor, preview, and PDF rendering.
- [x] Stabilise route-arrow direction against tiny final pointer movements.
- [x] Keep newly drawn passes and shots straight between their start and end points.
- [x] Verify new route kinds persist through the API and check their drawing geometry.

## Workspace refinements

- [x] Verify save-to-view navigation for edited drills/practices, centered desktop/mobile views, and copy-to-new-view navigation (13 browser scenarios, frontend build and formatting).

- [x] Verify saved drill/practice views, top PDF/Edit actions, authorised copy destination selection, automatic copy-view navigation, and atomic deep copies with no cross-organisation access (43 backend tests, 14 frontend unit tests, 29 browser scenarios; 2 PostgreSQL integration tests require a configured test server).

- [x] Verify practice date defaults, empty required drill names, prominent name fields, and team-only selection while browsing/copying club content and drawing club practice drills (14 frontend unit tests and 28 browser scenarios, including the updated age-group check).

- [x] Verify editor scroll reset, plain notes headings, the 360° goal slider endpoint, and static placeholders during delayed workspace/content loading; also preserve nested-drill cancel/back behavior.
- [x] Remove team age groups from creation, selection, and content defaults; retain independent drill/practice ages and existing data.
- [x] Place drill and practice Categories and Age groups below their notes.
- [x] Verify unchanged saved drill/practice Save state, re-enabling on edits, and initial draft creation.
- [x] Verify icon-only Account navigation, email/logout in its page, logo-to-Home, and content navigation order.
- [x] Verify phone layouts and touch editing at 320px and 390px.
- [x] Add a fixed database-backed hockey age catalog, validate team/content writes, and preserve previous age-group metadata on upgrade.
- [x] Verify content age selections and club filters through the browser; team age-group settings and inheritance have since been retired.

## Unified search and account preferences

- [x] Combine team/club search sources with checkboxes and visible ownership labels.
- [x] Persist a membership-checked default team per user, with a single-team automatic default.
- [x] Add multiple age-group metadata and checkbox/select-all controls, preserving legacy metadata.
- [x] Back up and reset local business content while retaining Supabase users, sign-in configuration, and age reference data.
- [x] Verify combined sources, default-team persistence, multiple ages, browser/mobile workflows, and SQLite metadata preservation; PostgreSQL live checks remain for CI.
- [x] Add the approved “Battling” category for Närkamp to drill/practice choices and folders.

## Independent organisation/team copies — current work

- [x] Replace visibility sharing with explicit team-to-library and library-to-team copy endpoints.
- [x] Copy complete plans and distinct included drills atomically with fresh operation-local IDs.
- [x] Enforce team memberships, library administration, and same-workspace references in API services and database guards.
- [x] Replace sharing controls with copy confirmation/success links and restrict plan pickers to their workspace.
- [x] Prepare deterministic SQLite/PostgreSQL upgrades preserving originals and repairing accessible cross-workspace references.
- [x] Verify API permissions, copy rollback/independence, and migration preservation on SQLite and disposable PostgreSQL.
- [x] Verify browser/mobile workflows, frontend checks, and migration/model formatting.
- [ ] Review membership assignments, back up hosted data, and apply the reviewed migration during a separately authorised maintenance release.

## 0.1.0 — local POC without authentication

- [x] Initialize Git and push the initial `.gitignore`.
- [x] Agree the backend/frontend API contract in `docs/api-contract.md`.
- [x] Add project conventions, a reusable project skill, and development documentation.
- [x] Set up the .NET 10 controller API and React/TypeScript application.
- [x] Persist drills and ordered trainings in SQLite, with starter content for an empty database.
- [x] Validate inputs and return useful errors, including referenced drill deletion conflicts.
- [x] Draw drills on an editable rink with cones, goals, tires, players, and pucks.
- [x] Draw skating, passing, and puck-handling paths.
- [x] Select, move, rotate, delete, undo, and redo diagram edits.
- [x] Add drill title, category, and notes; save, reopen, duplicate, and delete drills.
- [x] Search and filter the drill library by category.
- [x] Create and edit trainings with ordered drills, durations, and notes.
- [x] Download PDFs of drills and trainings with diagrams and notes.
- [x] Verify builds, focused automated tests, API persistence, and browser workflows.
- [x] Update README and changelog with verified setup, controls, and limitations.
- [x] Stop for the user's review; leave application changes uncommitted.
- [x] User reviewed the running POC and authorized committing and pushing it.

## 0.2.0 — navigation, folders, and tags

- [x] Agree additive tags contract and back up the existing local database.
- [x] Persist multiple tags for drills and practices; upgrade legacy data without resetting it.
- [x] Add a home screen with Create Practice, Create Drill, Practices, and Drills.
- [x] Add real routes, breadcrumbs, Back controls, and browser Back/Forward support.
- [x] Browse Practices and Drills through tag folders, including Uncategorized.
- [x] Add Show all views with search and tag filters.
- [x] Edit multiple suggested or custom tags on drills and practices.
- [x] Create a drill from a practice while preserving the practice draft.
- [x] Return from drill save/cancel without losing or duplicating practice entries.
- [x] Verify legacy-data upgrade, tag folders, navigation, draft preservation, and existing exports.
- [x] Update project documentation and leave changes uncommitted for review.

## 0.2.1 — practice editor clarity and fixed tags

- [x] Stop the app and push the current 0.2.0 code before making fixes (`56438c4`).
- [x] Back up saved content before the static-tag upgrade.
- [x] Make Draw a new drill prominent and distinct from adding a saved drill.
- [x] Verify drawing and saving into both new and saved practices without losing their drafts.
- [x] Show a rink preview for each included drill in the practice overview.
- [x] Replace custom tag entry with the seven unique fixed catalog choices.
- [x] Enforce fixed tags in the API and upgrade existing tags without losing saved content.
- [x] Update tests and documentation; keep the app stopped and fixes uncommitted for review.

## 0.3.0 — rink markings and equipment

- [x] Stop the app and push the 0.2.1 changes before making improvements (`4b3884b`).
- [x] Extend both goal lines to the boards in all rink views.
- [x] Draw recognizable hockey goals and rotate them in 90° steps.
- [x] Add a puck pile that moves and saves as one object.
- [x] Add a tire at half the regular tire's linear size.
- [x] Add an explicit red-player creation option.
- [x] Verify save/reload, undo, practice previews, and PDF export for the new equipment.
- [x] Update documentation and leave the app stopped with new changes uncommitted.

- [x] Label both player options Player and verify the goal rotation slider spans 0–360° in 90° steps.
- [x] Make cones smaller and slimmer; show only rotation settings when a goal is selected.
- [x] Slightly enlarge goals and refine their outline to a rounded B shape.
- [x] Enlarge goals another 15% and keep four distinct slider orientations, normalizing saved 360° goals to 0° in the control.
- [x] Remove color and label editing controls and their placement state; preserve existing saved diagram colors and labels.
- [x] Remove the unnecessary heading section above the rink toolbar.
- [x] Rename the shared editor's Tags label to Categories.
- [x] Use Categories checkboxes in both Show all libraries, matching any selected category and preserving search and navigation state.

## Delivery preparation — staging only

- [x] Fix runtime validation for structured Azure CLI responses and cover legacy/new response formats in CI.

- [x] Prepare readable CI tasks for formatting, API/frontend/browser tests, production build, and artifact packaging.
- [x] Prepare shared Bicep modules and separate stage/prod `.bicepparam` files; leave production unconnected.
- [x] Separate existing app-settings reads from the settings deployment to remove its circular dependency; verify compiled dependencies and secure parameter handling locally.
- [x] Prepare separate manual staging infrastructure preview/apply and application deployment workflows with OIDC.
- [x] Document required Azure/GitHub configuration, identity permissions, and secret storage.
- [x] Add portal-first instructions identifying where client IDs come from and explaining that no Azure client secret is needed.
- [x] Verify GitHub owner/repository IDs and OIDC settings; update the federation guide to the immutable subject format.
- [x] Use the `iac` folder name and keep deployment manually triggered after CI.
- [x] Verify templates, both environment parameter files, package contents, deployment guards, and the application test baseline locally (12 API, 10 unit, 7 browser tests).
- [x] Provision the staging infrastructure after a successful preview; deployment success confirmed by the user.
- [ ] Agree the ongoing spending limit and configure billing alerts.
- [x] Simplify to one GitHub `stage` environment and one staging deployment identity selected by `AZURE_CLIENT_ID`.
- [x] Bootstrap the GitHub `stage` environment, Azure OIDC deployment identity, and scoped deployment permissions.
- [ ] Implement and review the tracked authentication, team, PostgreSQL, SPA hosting, and recovery prerequisites before enabling app deployment.
- [x] Run GitHub-hosted CI and Azure what-if successfully; review the preview before the user applies infrastructure.

## Later — revisit after rink editor review

### Supabase PostgreSQL transition — database only

- [x] Restore Key Vault with simple stage/prod names, Bicep-owned secret and app settings, app Get policy, and one secure GitHub connection parameter for infrastructure apply.
- [x] Apply the reviewed Key Vault infrastructure; no VNet/firewall restrictions in this phase.
- [ ] Verify live App Service Key Vault reference resolution during the staging app deployment.
- [x] Retire Azure SQL, SQL-only VNet/service endpoints, from IaC; retain manual staging and future prod parameters.
- [x] Replace SQL Server provider/migrations with Npgsql PostgreSQL and separate application/history schemas; preserve local SQLite data and API behavior.
- [x] Remove Azure SQL administrator/bootstrap/firewall helpers and the database setup tool.
- [x] Update CI, SQL preview, Linux EF bundle packaging, and manual maintenance releases for the standard Supabase connection for runtime and migrations.
- [x] Document Supabase variables/secrets, standard connection setup, manual Azure cleanup, and verification limits.
- [x] Owner updates the existing staging database connection secret to the documented Npgsql format.
- [x] Review/commit/push changes when requested; owner previews and applies the new Key Vault infrastructure.
- [x] Apply the reviewed initial migration to staging Supabase and verify a second run makes no changes.
- [ ] Verify Azure runtime database access and saved-data persistence; rehearse backup/restore later, as explicitly deferred for the staging POC.
- [x] Plan Supabase email magic-link Auth for local and staging, including owner setup, tester access, and production separation.
- [x] Implement optional local Supabase email magic-link sign-in, logout, API bearer validation, and a Development-only unauthenticated mode.
- [x] Route completed magic-link callbacks to Home so signing in after logout does not show Page not found.
- [x] Wire stage Supabase URL and publishable key from GitHub environment variables through Bicep to App Service settings; keep public access and deployment gates closed.
- [x] Record the owner's approval for a shared staging workspace without team authorization, and the limited staging backup/restore deferral; continue requiring Supabase sign-in and a live database readiness check during deployment.
- [x] Update the published-app CI smoke check for required hosted Auth settings and verify anonymous content requests are rejected.
- [x] Add a separate manual staging database initialization workflow that applies the reviewed CI migration bundle only while the web app is stopped and private.
- [x] Run staging database initialization and verify the migration runner's live PostgreSQL access.
- [x] Clarify the normal GitHub Actions release sequence, select the current-main CI artifact automatically, and label infrastructure/database workflows as optional or setup-only.
- [x] Package the separate Supabase CA and add manual `prod` infrastructure/app workflows for the owner's temporary shared-workspace evaluation; preserve separate project and Azure resources.
- [x] Deploy the `prod` evaluation infrastructure and app through GitHub Actions; initialize PostgreSQL and pass database readiness, Auth configuration, anonymous API rejection, and React checks.
- [x] Configure the production custom apex hostname and managed SNI certificate; allow the custom host in ASP.NET Core `AllowedHosts` through Bicep and verify the deployed site.
- [x] Document the generic custom-domain setup and troubleshooting steps without recording live DNS IPs or verification tokens.
- [ ] Verify the `prod` email callback, save/reload persistence, and logout with a real tester account.
- [ ] Add team authorization, recovery, restricted runtime credentials, and monitoring before treating the evaluation environment as real production.
- [ ] Run the manual stage app deployment and verify Azure database readiness, Auth configuration, anonymous access rejection, and React.
- [ ] Recheck the callback fix with a fresh real magic link; verify stage Auth settings and Supabase account-creation policy before deployment.
- [ ] Review whether logout or Supabase user removal must revoke API access immediately; issued JWT access tokens remain valid until expiry unless the API also checks live session state.

The earlier Azure SQL infrastructure and one-time database bootstrap succeeded before this decision. They are superseded by Supabase; no data is automatically copied. The owner reported deleting the obsolete Azure resources separately.

- [x] Remove browser-test dependencies on example drills; verify all seven workflows against a fresh database and confirm test fixtures are cleaned up.

- [x] Remove automatic example drills/practices; verify new databases remain empty across restarts while existing saved content is preserved.
- [x] Preserve the local SQLite upgrade path and prepare PostgreSQL migration/model verification; live Supabase validation remains pending.
- [x] Verify React publishing through ASP.NET Core, browser refresh, API errors, and database readiness against the actual published application.
- [ ] Confirm PostgreSQL integration checks and the Linux migration bundle pass in GitHub CI after this change is pushed.
- [ ] Verify backup/restore and implement auth/team isolation before enabling staging app deployment.

- [x] Draft a [teams, authentication, and low-cost Azure hosting plan](docs/teams-auth-hosting-plan.md), including stage/prod persistence and GitHub Actions delivery; documentation only.
- [x] Revise the rollout to staging only initially, deferring production resources and deployment until a later launch decision.
- [ ] Confirm the plan's phase-A choices and current cloud quote before implementation.
- [ ] Evaluate the editor and training workflows with real coaching sessions.
- [ ] Confirm design, tablet usability, taxonomy, and sharing rules.
- [x] Add local email magic-link authentication and logout; revisit Google only if requested later.
- [ ] Add teams, invitations, roles, and authorization boundaries.
- [ ] Implement the approved hosted database migration, deployment, backup, and monitoring design; Supabase PostgreSQL is selected and hosted Auth remains gated.
- [ ] Decide whether training plans need historical drill snapshots.
- [x] Split the backend into Domain, Application, Infrastructure, and API projects; keep API integration tests and add focused Application and Infrastructure test projects.
