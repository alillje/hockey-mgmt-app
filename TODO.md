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

## Later — revisit after rink editor review

- [x] Draft a [teams, authentication, and low-cost Azure hosting plan](docs/teams-auth-hosting-plan.md), including stage/prod persistence and GitHub Actions delivery; documentation only.
- [x] Revise the rollout to staging only initially, deferring production resources and deployment until a later launch decision.
- [ ] Confirm the plan's phase-A choices and current cloud quote before implementation.
- [ ] Evaluate the editor and training workflows with real coaching sessions.
- [ ] Confirm design, tablet usability, taxonomy, and sharing rules.
- [ ] Add authentication (Google and additional sign-in method to be confirmed).
- [ ] Add teams, invitations, roles, and authorization boundaries.
- [ ] Implement the approved hosted database migration, deployment, backup, and monitoring design; Azure SQL is proposed, with PostgreSQL still an option.
- [ ] Decide whether training plans need historical drill snapshots.
