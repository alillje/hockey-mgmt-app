# Hockey Trainer Management

A local proof of concept for drawing hockey drills, organizing a reusable drill library, assembling training sessions, and downloading coaching PDFs.

Version **0.3.0** is a local evaluation release. It has no authentication or team management; all content belongs to one local workspace.

## Stack

- .NET 10 / ASP.NET Core controllers, with separate services and repositories.
- Entity Framework Core with SQLite for local persistence.
- React, strict TypeScript, and Vite.
- React Router for home, folder, list, and editor navigation.
- SVG rink editor and client-side PDF generation.

## Development

Requires .NET 10 SDK and Node.js 22.12+ (Node 22 LTS recommended). `global.json` accepts stable .NET 10 SDK feature bands. `.nvmrc` selects Node 22.

From the repository root:

```bash
source scripts/toolchain.sh
dotnet restore HockeyTrainer.slnx
npm --prefix frontend ci
./scripts/dev.sh
```

Open **http://localhost:5173**. The API listens on **http://127.0.0.1:5180**. Press **Ctrl+C** in the startup terminal to stop both processes. The servers bind to the local machine.

`scripts/toolchain.sh` prefers project-local `.tools/dotnet` and `.tools/node` installations when present, otherwise uses your installed tools. This working copy has .NET SDK 10.0.402 and Node.js 22.23.4 downloaded there; they are not part of Git. On a fresh checkout, install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) and [Node.js 22 LTS](https://nodejs.org/en/download), then run the commands above. Check Microsoft's [supported OS requirements](https://learn.microsoft.com/en-us/dotnet/core/install/macos) when choosing your development machine.

To run each service in its own terminal, source the toolchain in both terminals and use:

```bash
dotnet run --project backend
```

```bash
npm --prefix frontend run dev
```

## Try the POC

1. Start at Home and choose **Create Practice**, **Create Drill**, **Practices**, or **Drills**.
2. Practices and Drills open folder views grouped by categories. An item with several categories appears in every matching folder. Choose **Show all** to search across the entire collection and select multiple Categories. Results match any selected category; **All categories** clears the selections. Include **Uncategorized** to also show items without categories.
3. Create or open a drill. The rink section starts with the equipment toolbar. Choose Cone, Goal, Tire, Small tire, either Player color, Puck, or Puck pile and click the rink to place it. A puck pile is one movable item; a small tire has half the width and height of a regular tire.
4. Choose Skate, Pass, or Puck handling and drag across the rink to draw a route. Use Select to drag an object or route; rotate equipment, remove a selection, or undo/redo changes. Goals have a rounded B-shaped net and red frame. Select a goal to reveal its Rotation slider: move through 0–270° with stops every 90°. The rotate button also advances goals by 90°; other objects rotate in 45° steps. Old goals with intermediate rotations snap to a cardinal orientation when you rotate them. Both player color options are labeled Player and distinguished by their colored icons.
5. Enter a title, select Categories from the seven fixed choices, and add coaching notes. Save the drill, then find it again in its tag folders or the searchable Show all view. Duplicate a saved drill to make a variation.
6. Create or open a practice. At the top of its drill section, use **Draw a new drill** to design a rink diagram or **Add a saved drill** to choose from the library. **Save drill and add to practice** returns to the retained practice draft and adds the new drill. **Cancel and return** returns without adding a drill. Each included drill shows its rink diagram alongside its duration and notes; move entries up or down to arrange the session.
7. Select Categories and add notes to the practice, then save. Practice categories can differ from those on its drills.
8. Download PDF from a drill or a practice. Exports contain the diagram, tags, and notes; practice exports include a summary and a page for each drill, with additional pages for long notes.

Saving is manual. Editor drafts are retained in the current browser tab so the nested drill workflow can return to an unsaved practice. Navigation warns before discarding unsaved edits; cancelling a nested drill retains the parent practice. PDF export can include the current unsaved draft. Use the breadcrumb links, Back controls, or browser Back/Forward to navigate.

## Persistence and boundaries

SQLite data is stored in `backend/App_Data/hockey.db` and survives restarts. A new database starts with three example drills and one practice. Existing databases are not overwritten or reseeded. Set the `DatabasePath` environment variable to use another database location. `App_Data` is deliberately distinct from the C# `Data` source folder on case-insensitive filesystems.

Drills and practices support multiple tags from the fixed catalog: **Skating, Stick handling, Passing, Shooting, Tactics, Warm-up, and Other**. Custom tag creation is disabled in the UI and rejected by the API. Tags ignore case for matching and duplicates. Tag folders are views of the same item, not separate copies. Practices reference saved drills in order and may reuse a drill more than once. Editing a drill also updates its use in existing practices; deleting a referenced drill returns a helpful error until you remove those references. There are no historical snapshots yet.

The editor currently uses a full rink, with up to 200 equipment objects and 100 routes per drill. Titles allow 120 characters and notes allow 6000. Touch/pointer input is supported; desktop and tablet browsers are the POC focus. PDF diagrams are rendered as high-resolution images. Cones use a compact, slim shape in every rink view. Players use the two palette colors and new routes use teal. The editor has no color picker or label field. Goals have red frames; selecting one shows rotation settings. Existing saved colors and labels still render in diagrams and exports.

New databases are initialized with EF Core `EnsureCreated`. An additive, transactional version-1 upgrade adds tags to existing databases without resetting data: drills inherit their old category label; practices initially inherit the union of their drills' tags. Version 2 normalizes and deduplicates existing tags and groups unsupported legacy labels under Other. Empty tag arrays stay Uncategorized; diagrams, notes, timestamps, and practice entries are preserved. Later practice tag edits remain independent. Further schema changes must include an upgrade path. Authentication, team membership, invitations, PostgreSQL, and public deployment remain on the review checklist.

## Checks

```bash
./scripts/check.sh
./scripts/check.sh --browser
```

The default check runs API integration tests, frontend unit tests, and the production frontend build. Browser tests exercise the editor, save/reload, PDF downloads, practice order, reference conflicts, tablet layout, and connection errors. They use separate ports (5273/5280) and an isolated database under `.tools/e2e`.

Verification passes 12 API integration tests, 10 frontend unit tests, and 7 browser tests, plus the production build and frontend formatting check. Checks cover equipment persistence and rotation, fixed-tag validation and upgrades, tag folders, fast search typing, Back/Forward, drawing and saving inside new and saved practices, draft recovery, rink previews, and exports. The build reports a size warning for the PDF module, which loads only when exporting. The project `.npmrc` preserves the dependency resolver mode used by the lockfile.

On macOS, browser tests use installed Google Chrome. Elsewhere, install Playwright Chromium once:

```bash
source scripts/toolchain.sh
cd frontend
npx playwright install chromium
```

You can instead set `HOCKEY_CHROME_PATH` to a compatible Chrome/Chromium executable.

## Layout

- `backend/`: classic controllers, transport contracts, services, repositories, EF data configuration, and API integration tests.
- `frontend/`: React workspace, SVG editor, API client, PDF export, unit tests, and browser tests.
- `scripts/`: local startup, toolchain selection, and verification commands.
- `docs/`: the shared API contract; project workflow is in the root checklist and `.agents/skills`.

## Project references

- [Future teams, authentication, and Azure hosting plan](docs/teams-auth-hosting-plan.md) — staging-first proposal and phased checklist; production deferred, no implementation yet.
- [Delivery checklist](TODO.md)
- [Changelog](CHANGELOG.md)
- [API contract](docs/api-contract.md)
- [Project conventions](AGENTS.md)
- [Hockey development skill](.agents/skills/hockey-development/SKILL.md)

Personal tool installations, database files, secrets, and build artifacts are ignored by Git.
