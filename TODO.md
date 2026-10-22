# Hockey Trainer Management — delivery checklist

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

- [x] Label both player options Player and verify the goal rotation slider spans 0–270° in 90° steps.
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
- [ ] Implement and review the tracked authentication, team, SQL, SPA hosting, and recovery prerequisites before enabling app deployment.
- [x] Run GitHub-hosted CI and Azure what-if successfully; review the preview before the user applies infrastructure.

## Later — revisit after rink editor review

### Hosted application preparation

- [x] Prepare B1/VNet/service-endpoint templates, maintenance releases using a standard EF bundle, stage-only targets, scoped migration grants, and retried/verified temporary firewall cleanup with failure-path test coverage.
- [ ] Review/push the automation, register Microsoft.Network, apply staging infrastructure, and run the one-time SQL administrator bootstrap.
- [ ] Review migration SQL and rehearse the maintenance release in Azure; verify app connectivity, persistence, failure handling, and temporary firewall cleanup.

- [x] Remove browser-test dependencies on example drills; verify all seven workflows against a fresh database and confirm test fixtures are cleaned up.

- [x] Remove automatic example drills/practices; verify new databases remain empty across restarts while existing saved content is preserved.
- [x] Verify explicit SQL Server configuration, offline migration SQL, and unchanged local SQLite upgrades (provider integration passed in CI; Azure managed-identity connectivity remains pending).
- [x] Verify React publishing through ASP.NET Core, browser refresh, API errors, and database readiness against the actual published application.
- [x] Run real SQL Server integration checks in CI (passed for the previous application revision); verify the new bundle/migration-role checks in CI after this change is pushed.
- [ ] Configure and verify Azure SQL network access, runtime managed identity, and migration operator permissions.
- [ ] Verify backup/restore and implement auth/team isolation before enabling staging app deployment.

- [x] Draft a [teams, authentication, and low-cost Azure hosting plan](docs/teams-auth-hosting-plan.md), including stage/prod persistence and GitHub Actions delivery; documentation only.
- [x] Revise the rollout to staging only initially, deferring production resources and deployment until a later launch decision.
- [ ] Confirm the plan's phase-A choices and current cloud quote before implementation.
- [ ] Evaluate the editor and training workflows with real coaching sessions.
- [ ] Confirm design, tablet usability, taxonomy, and sharing rules.
- [ ] Add authentication (Google and additional sign-in method to be confirmed).
- [ ] Add teams, invitations, roles, and authorization boundaries.
- [ ] Implement the approved hosted database migration, deployment, backup, and monitoring design; Azure SQL is proposed, with PostgreSQL still an option.
- [ ] Decide whether training plans need historical drill snapshots.
