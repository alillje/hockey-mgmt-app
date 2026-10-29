# Hockey Trainer Management

A hockey training workspace for drawing drills, organising team and club libraries, assembling practice plans, and downloading coaching PDFs.

The browser favicon uses the same teal three-bar mark as the app header; its source is `frontend/public/favicon.svg`.

The published app enforces a Content Security Policy and browser security headers. See [browser security](docs/browser-security.md) for the policy, rendering rules and published-app XSS/PDF checks.

The sign-in screen includes an **About** button opening a public `/about` page with a sample rink diagram, a feature overview, and guidance to contact an administrator for access. The preview uses static illustration data and does not load saved workspace content.

Email sign-in uses email codes through backend-managed sessions. Supabase tokens stay encrypted on the server; the browser receives an HttpOnly session cookie. See [backend session setup](docs/backend-sessions.md) for the required email-template change, session settings, migration and deployment sequence.

Version **0.3.0** is an evaluation build. The current source adds organisation/team ownership and independent copies between team workspaces and the organisation library. Optional local Supabase email sign-in is available, and the unauthenticated SQLite POC remains usable. Hosted environments need the new reviewed migration and explicit memberships before this source is released.

## Stack

- .NET 10 / ASP.NET Core controllers, with separate services and repositories.
- Entity Framework Core with SQLite locally and Supabase PostgreSQL for hosted persistence.
- React, strict TypeScript, and Vite.
- React Router for home, folder, list, and editor navigation.
- SVG rink editor and client-side PDF generation.

### Backend projects

- `HockeyTrainer.Domain` contains the core entities and value types.
- `HockeyTrainer.Application` contains use cases, validation, API contracts, and repository/context interfaces. It depends on Domain, not the web or database stack.
- `HockeyTrainer.Infrastructure` implements persistence, database configuration, and EF Core migrations. Application depends on its abstractions rather than concrete repositories.
- `HockeyTrainer.Api` contains HTTP controllers, authentication adapters, composition, and hosting. It wires Application and Infrastructure together and publishes the frontend.
- `HockeyTrainer.Api.Tests` contains API and hosting integration tests; `HockeyTrainer.Application.Tests` covers use-case rules; `HockeyTrainer.Infrastructure.Tests` covers database behavior. Keep tests close to the boundary they exercise; the API suite remains the place for end-to-end authorization and transport checks.

Run the full .NET test suite with `dotnet test HockeyTrainer.slnx`. Domain currently has no separate test project because its small entity model has no independent behavior requiring one.

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

### Local email sign-in

Create the Git-ignored `backend/HockeyTrainer.Api/appsettings.Local.json` with your Supabase project's **public** values:

```json
{
  "Auth": {
    "SupabaseUrl": "https://YOUR-PROJECT.supabase.co",
    "SupabasePublishableKey": "sb_publishable_YOUR-KEY"
  }
}
```

`./scripts/dev.sh` then starts local Supabase sign-in automatically. Provision a tester through Supabase Auth first, since the app does not create accounts. Use a code-only Supabase Magic Link email template with `{{ .Token }}`; no redirect URL is needed for OTP. The account icon opens sign-in details and **Log out**. Supabase sends the email; the app never needs an SMTP password or a service-role key. Signed-in users without organisation access see an access message and can check again after an administrator adds them. Only the configured platform administrator can create organisations.

To run the original unauthenticated local POC with the same settings file present, use `HOCKEY_LOCAL_AUTH=0 ./scripts/dev.sh`. This switch is for local development; hosted application environments require Supabase Auth configuration. If you run the services separately, set `ASPNETCORE_ENVIRONMENT=Development` and `Auth__Mode=Supabase` for the .NET process.

`scripts/toolchain.sh` prefers project-local `.tools/dotnet` and `.tools/node` installations when present, otherwise uses your installed tools. This working copy has .NET SDK 10.0.402 and Node.js 22.23.4 downloaded there; they are not part of Git. On a fresh checkout, install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) and [Node.js 22 LTS](https://nodejs.org/en/download), then run the commands above. Check Microsoft's [supported OS requirements](https://learn.microsoft.com/en-us/dotnet/core/install/macos) when choosing your development machine.

To run each service in its own terminal, source the toolchain in both terminals and use:

```bash
ASPNETCORE_ENVIRONMENT=Development dotnet run --project backend/HockeyTrainer.Api
```

```bash
npm --prefix frontend run dev
```

### Git workflow

Keep `main` protected and make each change on a short-lived branch. Start from the latest `main`, using a prefix that describes the work (`feat/`, `fix/`, or `chore/`):

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description
```

Commit and push the branch, then open a pull request targeting `main`:

```bash
git add <files>
git commit -m "Describe the change"
git push -u origin feat/short-description
```

Wait for the **CI** check to pass before merging the pull request. Once merged, application deployment remains a separate manual **Release application** workflow; deploy to stage first.

## Try the POC

1. Start at Home and choose **Create Practice**, **Create Drill**, **Practices**, or **Drills**.
2. Practices and Drills open folder views grouped by categories. An item with several categories appears in every matching folder. Choose **Show all** to search across the entire collection and select multiple Categories. Results match any selected category; **All categories** clears the selections. Include **Uncategorized** to also show items without categories.
3. Create or open a drill. The rink section starts with the equipment toolbar. Choose Cone, Goal, Tire, Small tire, either Player color, Puck, or Puck pile and click the rink to place it. A puck pile is one movable item; a small tire has half the width and height of a regular tire.
4. Choose Skate, Skate backwards, Pass, Skate with puck, Shot, Full line, Dotted line, or Dashed line and drag across the rink to draw a route. Pass and Shot draw a straight line from the start to the current pointer position. Backwards skating uses separate curved marks leaning alternately left and right; Shot has two separated parallel rails and one extended arrowhead. Full line, Dotted line, and Dashed line have no arrowheads. Route arrows follow the end of the drawn gesture without reacting to tiny final pointer movements. Use Select to drag an object or route; rotate equipment, remove a selection, or undo/redo changes. Goals have a rounded B-shaped net and red frame. Select a goal to reveal its Rotation slider: move through 0–360° with stops every 90°. The 360° endpoint remains selected and displayed as 360°. The rotate button also advances goals by 90°; other objects rotate in 45° steps. Old goals with intermediate rotations snap to a cardinal orientation when you rotate them. Both player color options are labeled Player and distinguished by their colored icons.
5. Enter a title and coaching notes, then choose Categories and Age groups beneath the notes. Save the drill, then find it again in its tag folders or the searchable Show all view. Duplicate a saved drill to make a variation.
6. Create or open a practice. At the top of its drill section, use **Draw a new drill** to design a rink diagram or **Add a saved drill** to choose from the library. **Save drill and add to practice** returns to the retained practice draft and adds the new drill. **Cancel and return** returns without adding a drill. Each included drill shows its rink diagram alongside its duration and notes; move entries up or down to arrange the session.
7. Add notes to the practice, then choose Categories and Age groups beneath the notes and save. Practice categories can differ from those on its drills.
8. Download PDF from a drill or a practice. Exports contain the diagram, tags, and notes; practice exports include a summary and a page for each drill, with additional pages for long notes.

New practices start with today’s local date as their editable name (YYYY-MM-DD). New drill names start empty. Both names are required, with prominent name fields and smaller creation headings. Opening a saved drill or practice starts at the top of its view page, with **Export to PDF**, **Create copy**, and an authorised **Edit** action at the top. Editing opens a separate route and restores any editor draft; successful saves return to the centered view page. The view page always shows saved content. Notes sections use plain Coaching notes and Practice notes headings. While sign-in, workspace access, or content is loading, a quiet static placeholder is shown; permission and empty-state messages appear only after the required data is ready.

Saving is manual. Save is disabled for saved drills/practices without changes and re-enables when you edit; new drafts can still be saved. Use the account icon for sign-in details and logout, and the Icework logo to return home. The main navigation is Practices → Drills → Account. Phone layouts stack navigation, selectors, and editor actions with larger touch targets. Editor drafts are retained in the current browser tab so the nested drill workflow can return to an unsaved practice. Navigation warns before discarding unsaved edits; cancelling a nested drill retains the parent practice. PDF export can include the current unsaved draft. Use the breadcrumb links, Back controls, or browser Back/Forward to navigate.

## Teams and club content

Use the organisation/team selector to choose where you create and copy content. Browse everything through **Drills** and **Practices**: team and club checkboxes filter the accessible sources, with your current/default team initially selected. Results carry **Team:** or **Club:** ownership badges. Search, category, source, and age filters survive reload and browser Back. There is no separate club-library navigation page.

Choose your **Default team** under **Account**. It is saved for your user and selected when you reopen the app. If you only belong to one team, it is automatically your default. Only authorised teams can be selected.

Drills and practices support several fixed age groups (U8–U16, U18, U19, U20, Senior) using checkboxes. **Select all age groups** selects the actual catalog levels; there is no separate “All ages” tag. Teams have names without an age-group setting, so their setup remains valid as players grow older. New drills and practices start with no ages selected. Existing content age selections are preserved; legacy stored team ages are no longer displayed or used as defaults.

Open a saved drill or practice and choose **Create copy**, then select an authorised team or club destination in the same organisation. The dialog confirms that practice copies include all their drills and opens the new copy's view page automatically. Each operation creates independent content, even when names match; it never overwrites an existing item. The selected browsing team stays unchanged.

Team editors manage their team's content; viewers read it. Organisation admins manage all teams and content in their organisation without separate team memberships. The team selector contains teams only. Include the club source in Drills or Practices to open and manage club content; viewing or editing it keeps your selected team. Drawing a drill inside a club practice creates a club-owned drill for that practice. **Manage organisation** adds regular members, changes their team roles, and removes team or organisation access using existing Supabase Auth user IDs. Organisation removal also removes team access there, clears an affected default team, and preserves saved drills and practices. Administrators cannot change other organisation administrators; only the platform administrator can appoint or remove them. The plan's drill picker only shows its own workspace's drills. Deleting a referenced drill is blocked until dependent plan entries are removed/replaced.

Platform permissions use the existing configured administrator UUID: set `Workspace:LegacyAdminUserId` in the ignored local settings or `Workspace__LegacyAdminUserId` as an environment variable. Hosted IaC reads the existing `LEGACY_WORKSPACE_ADMIN_USER_ID` variable. Missing configuration denies platform-only actions; no new administrator is inferred from membership or sign-in order. Membership changes are checked by the backend on every request, including requests using an existing token. The unauthenticated local POC remains its fixed administrator. Email invitations from the application remain future work.

Before upgrading existing data, read the [independent-copy migration guide](docs/independent-copies.md). The reviewed PostgreSQL migration preserves team originals, copies previously shared content into the library, and repairs cross-workspace plan references. Ambiguous private/cross-organisation references block the upgrade for review. SQLite applies the equivalent local upgrade transactionally. No hosted migration or deployment runs automatically at startup.

See [club/team setup and data migration](docs/club-content.md) and the [API contract](docs/api-contract.md). Existing local content is preserved in the legacy team. To adopt existing hosted data, explicitly configure `LEGACY_WORKSPACE_ADMIN_USER_ID` in the environment before the reviewed release; it does not assign access to the first signed-in user. Hosted environments retain the previous visibility-based sharing build until this refactor and its migration are reviewed and released.

## CI and application releases

There are three runnable GitHub Actions workflows: **Build and test**, **Release application**, and **Deploy infrastructure**. CI validates the application, PostgreSQL migrations, Bicep, release selection, and workflow syntax. Trusted pushes to `main` produce one environment-neutral **application** artifact with React/.NET, reviewable SQL, and a Linux EF migration bundle.

For stage, push to `main`, wait for CI, then run **Release application** from `main` with `environment=stage`. For prod, run the same workflow with `environment=prod`: it promotes the exact package from the last successful stage release. It does not select a newer build or rebuild. Each run records its commit, CI build, artifact identity, and verification results. The first prod promotion requires a successful stage release through this new workflow; expired packages require another build/stage release.

Use **Deploy infrastructure** with an environment selector and `preview`/`apply` when infrastructure, hosting settings, or the database secret changes. Existing GitHub `stage`/`prod` environments, credentials, and separate `.bicepparam` files remain in use. Database initialization and pending migrations run inside application deployment; review the CI artifact's `postgresql.sql` before schema changes. [Full release sequence](docs/azure-deployment.md#workflow-tasks).

The published app and migration bundle include separate public Supabase CA files at `backend/HockeyTrainer.Api/Certificates/supabase-stage-root.crt` and `backend/HockeyTrainer.Api/Certificates/supabase-prod-root.crt`. `SSL Mode=VerifyFull` selects the file for the application environment automatically; database passwords remain in their separate GitHub environment secrets and Azure Key Vaults.

Azure hosts the app; **Supabase hosts PostgreSQL**. The Azure SQL server, SQL-only VNet/service endpoint, and administrator/firewall scripts are retired from active configuration. Key Vault stores the app connection secret under the environment-specific name `kv-hockey-stage` or `kv-hockey-prod`. Existing Azure resources are not automatically deleted: follow [manual retirement and Supabase setup](docs/supabase-database.md). Keep the Azure resource group, app, hosting plan, and deployment identity. B1 remains unchanged.

The shared Bicep template retains [stage](iac/parameters/stage.bicepparam) and [production](iac/parameters/prod.bicepparam) parameters. It manages hosting, app-owned App Service settings, the environment-specific Key Vault secret/reference, and the app's Get access policy. GitHub holds one Npgsql-formatted Supabase connection secret **per environment**: stage infrastructure apply passes its secret to Bicep as a secure parameter, while migrations use it directly. The running app resolves the vault reference using its managed identity. Releases stop the app for migrations, then deploy/start the matching artifact and refresh its secret reference. No Azure client secret or publish profile is needed.

The separate [production-project evaluation checklist](docs/production-preparation.md) gives the `prod` environment setup, manual GitHub Actions sequence, and custom apex domain/HTTPS configuration notes. It runs the same application with a separate Supabase project and Azure resources; the owner approved a temporary shared-workspace evaluation there. Release and verify the new membership/content migration in stage, then review backup/restore and restricted runtime database credentials before treating it as real production.

The `prod` evaluation is deployed at [hockey-mgmt-app-prod.azurewebsites.net](https://hockey-mgmt-app-prod.azurewebsites.net) and is configured with a custom apex hostname and managed HTTPS certificate. See the [custom-domain setup and troubleshooting notes](docs/production-preparation.md#custom-apex-domain-on-azure-app-service). GitHub Actions initialized its PostgreSQL schema and verified database readiness, Auth configuration, anonymous API rejection, and React on 2026-10-23. A real email-link sign-in, save/reload, and logout check remains pending.

Set the GitHub `stage` secret `SUPABASE_DATABASE_CONNECTION_STRING` to this Npgsql format, replacing the password placeholder:

```text
Host=aws-0-eu-west-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.wbnjumvxvxwvbimqjccu;Password="<YOUR-PASSWORD>";SSL Mode=VerifyFull
```

Start with the [Azure/GitHub variable table](docs/azure-deployment.md) and [Supabase connection instructions](docs/supabase-database.md). The initial migration has been applied to staging Supabase, and the owner reports that the staging application works. The owner approved a limited shared-workspace staging check with backup/restore deferred. The GitHub Actions deployment checks live database readiness and Auth configuration; the owner should still record a real email-link sign-in, save, and logout check before treating those flows as verified. Application invitations and production recovery remain future work.

## Persistence and boundaries

SQLite data is stored in `backend/App_Data/hockey.db` and survives restarts. New databases start empty: no example drills or practices are inserted. Existing content, including examples saved by earlier versions, is preserved. Set the `DatabasePath` environment variable to use another database location. `App_Data` is deliberately distinct from the C# `Data` source folder on case-insensitive filesystems.

Drills and practices support multiple tags from the fixed catalog: **Skating, Stick handling, Passing, Shooting, Battling, Tactics, Warm-up, and Other**. Custom tag creation is disabled in the UI and rejected by the API. Tags ignore case for matching and duplicates. Tag folders are views of the same item, not separate copies. Practices reference saved drills in order and may reuse a drill more than once. Editing a drill also updates its use in existing practices; deleting a referenced drill returns a helpful error until you remove those references. There are no historical snapshots yet.

The editor currently uses a full rink, with up to 200 equipment objects and 100 routes per drill. Titles allow 120 characters and notes allow 6000. Touch/pointer input is supported; desktop and tablet browsers are the POC focus. PDF diagrams are rendered as high-resolution images. Cones use a compact, slim shape; pucks are small and puck piles arrange flat pucks in an irregular cluster in every rink view. Players use the two palette colors and new routes use teal. The editor has no color picker or label field. Goals have red frames; selecting one shows rotation settings. Existing saved colors and labels still render in diagrams and exports.

New local SQLite databases are initialized with EF Core `EnsureCreated`; PostgreSQL uses separate, reviewed migrations and is never migrated or seeded at startup. An additive, transactional version-1 upgrade adds tags to existing databases without resetting data: drills inherit their old category label; practices initially inherit the union of their drills' tags. Version 2 normalizes and deduplicates existing tags and groups unsupported legacy labels under Other. Empty tag arrays stay Uncategorized; diagrams, notes, timestamps, and practice entries are preserved. Later practice tag edits remain independent. Further schema changes must include an upgrade path. Authentication, team membership, invitations, Azure runtime configuration, and public deployment remain on the review checklist.

## Checks

```bash
./scripts/check.sh
./scripts/check.sh --browser
```

The default check runs API integration tests, frontend unit tests, and the production frontend build. Browser tests exercise the editor, save/reload, PDF downloads, practice order, reference conflicts, tablet layout, and connection errors. They use separate ports (5273/5280) and an isolated database under `.tools/e2e`. Tests create and clean up their own drills and practices without relying on example content. Set `HOCKEY_E2E_DATABASE_PATH` to an unused absolute database path to verify a fresh database without changing your existing local databases.

Backend checks cover local SQLite behavior, PostgreSQL model/migration generation, hosting, and configuration. CI runs a disposable PostgreSQL integration test for persistence, restart behavior, idempotent SQL, and restricted runtime permissions; it is skipped locally unless `HOCKEY_POSTGRES_TEST_CONNECTION` is set. Frontend checks cover the existing editor and practice workflows. See [database and publishing verification](docs/database-and-publishing.md). The PDF module loads only when exporting and produces a build size warning. The project `.npmrc` preserves the resolver mode used by the lockfile.

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
- `.github/workflows/`: CI and separate manual staging/production-project evaluation pipelines.
- `iac/`: shared Bicep modules, environment parameter files, and evaluation readiness checklists.
- `docs/`: the shared API contract; project workflow is in the root checklist and `.agents/skills`.

## Project references

- [Email OTP and backend sessions](docs/backend-sessions.md) — current sign-in setup, server sessions, CSRF protection and rollout steps.
- [Teams, authentication, and Azure hosting plan](docs/teams-auth-hosting-plan.md) — staging-first proposal and later requirements for a real production launch.
- [Azure deployment setup](docs/azure-deployment.md) — workflow tasks, OIDC bootstrap, GitHub variables, and application secret storage.
- [Delivery checklist](TODO.md)
- [Changelog](CHANGELOG.md)
- [API contract](docs/api-contract.md)
- [Project conventions](AGENTS.md)
- [Hockey development skill](.agents/skills/hockey-development/SKILL.md)

Personal tool installations, database files, secrets, and build artifacts are ignored by Git.

### Local content reset

The owner requested a local-only content reset on 2026-10-25. Organisations, teams, memberships, drills, practice plans, and local default-team preferences were cleared after a SQLite backup under the ignored `.tools/backups/` folder. The age catalog remains. Supabase Auth users, login settings, and hosted databases were not changed. Authenticated startup keeps the reset workspace empty; create a club and team to begin again.
