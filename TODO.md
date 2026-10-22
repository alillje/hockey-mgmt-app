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

## Later — revisit after POC review

- [ ] Evaluate the editor and training workflows with real coaching sessions.
- [ ] Confirm design, tablet usability, taxonomy, and sharing rules.
- [ ] Add authentication (Google and additional sign-in method to be confirmed).
- [ ] Add teams, invitations, roles, and authorization boundaries.
- [ ] Plan PostgreSQL migration, deployment, backup, and monitoring.
- [ ] Decide whether training plans need historical drill snapshots.
