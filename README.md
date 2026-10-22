# Hockey Trainer Management

A local proof of concept for drawing hockey drills, organizing a reusable drill library, assembling training sessions, and downloading coaching PDFs.

Version **0.2.0** is a local evaluation release. It has no authentication or team management; all content belongs to one local workspace.

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
2. Practices and Drills open folder views grouped by tags. An item with several tags appears in every matching folder. Choose **Show all** to search and filter across the entire collection, or **Uncategorized** for items without tags.
3. Create or open a drill. Choose Cone, Goal, Tire, Player, or Puck and click the rink to place it. Use the label field for player numbers or equipment labels.
4. Choose Skate, Pass, or Puck handling and drag across the rink to draw a route. Select a color before drawing. Use Select to drag an object or route; rotate equipment, remove a selection, or undo/redo changes.
5. Enter a title, add suggested or custom tags, and add coaching notes. Save the drill, then find it again in its tag folders or the searchable Show all view. Duplicate a saved drill to make a variation.
6. Create a practice. Add saved drills, set durations and notes, and move drills up or down. Use **Create drill** inside the practice editor to design a new drill; **Save drill & add** returns to the retained practice draft and adds it. Cancel returns without adding a drill.
7. Add tags and notes to the practice, then save. Practice tags can differ from the tags on its drills.
8. Download PDF from a drill or a practice. Exports contain the diagram, tags, and notes; practice exports include a summary and a page for each drill, with additional pages for long notes.

Saving is manual. Editor drafts are retained in the current browser tab so the nested drill workflow can return to an unsaved practice. Navigation warns before discarding unsaved edits; cancelling a nested drill retains the parent practice. PDF export can include the current unsaved draft. Use the breadcrumb links, Back controls, or browser Back/Forward to navigate.

## Persistence and boundaries

SQLite data is stored in `backend/App_Data/hockey.db` and survives restarts. A new database starts with three example drills and one practice. Existing databases are not overwritten or reseeded. Set the `DatabasePath` environment variable to use another database location. `App_Data` is deliberately distinct from the C# `Data` source folder on case-insensitive filesystems.

Drills and practices support up to 20 tags, each 1–40 characters. Tag folders are views of the same item, not separate copies. Tags ignore case for matching and duplicates. Practices reference saved drills in order and may reuse a drill more than once. Editing a drill also updates its use in existing practices; deleting a referenced drill returns a helpful error until you remove those references. There are no historical snapshots yet.

The editor currently uses a full rink, with up to 200 equipment objects and 100 routes per drill. Titles allow 120 characters and notes allow 6000. Touch/pointer input is supported; desktop and tablet browsers are the POC focus. PDF diagrams are rendered as high-resolution images. Color applies to new routes, goals, and players; cones, tires, and pucks use fixed colors. This POC does not recolor existing selections.

New databases are initialized with EF Core `EnsureCreated`. An additive, transactional version-1 upgrade adds tags to existing databases without resetting data: drills inherit their old category label; practices initially inherit the union of their drills' tags. Later practice tag edits remain independent. Further schema changes must include an upgrade path. Authentication, team membership, invitations, PostgreSQL, and public deployment remain on the review checklist.

## Checks

```bash
./scripts/check.sh
./scripts/check.sh --browser
```

The default check runs API integration tests, frontend unit tests, and the production frontend build. Browser tests exercise the editor, save/reload, PDF downloads, practice order, reference conflicts, tablet layout, and connection errors. They use separate ports (5273/5280) and an isolated database under `.tools/e2e`.

Verified for 0.2.0: **7 API integration tests, 9 frontend unit tests, and 4 browser workflow tests**, plus the production frontend build. Checks cover schema upgrades, tag folders, fast search typing, Back/Forward, nested drill save/cancel, draft recovery after refresh, and exports. Original records in the local database were compared with a backup and preserved by the upgrade. The build reports a size warning for the PDF module, which loads only when exporting. The project `.npmrc` preserves the dependency resolver mode used by the lockfile.

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

- [Delivery checklist](TODO.md)
- [Changelog](CHANGELOG.md)
- [API contract](docs/api-contract.md)
- [Project conventions](AGENTS.md)
- [Hockey development skill](.agents/skills/hockey-development/SKILL.md)

Personal tool installations, database files, secrets, and build artifacts are ignored by Git.
