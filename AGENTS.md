# Hockey Trainer Management

## Working conventions

- Keep the local, unauthenticated proof of concept usable. Supabase PostgreSQL and combined React/.NET publishing are approved; Supabase Auth, teams, invitations, and enabling public hosting need later implementation and review.
- Use .NET 10, classic ASP.NET Core controller classes, C# PascalCase types and members, and async methods with cancellation tokens for I/O.
- Keep HTTP handling, use cases, persistence, and transport contracts separate. Avoid building a generic framework around this small application.
- Use strict TypeScript, React components grouped by feature, and one API client boundary. Keep editor geometry and state transitions independent of rendering.
- Read `docs/api-contract.md` before changing an API. Coordinate backend and frontend changes in the same work, and update the contract when behavior changes.
- Use SQLite for the local POC. Preserve saved data across restarts. New databases must start empty; never insert example drills or practices automatically. Do not commit database files or downloaded tooling.
- Use explicit PostgreSQL configuration for hosted persistence on Supabase. Generate and review migrations separately; never migrate or seed PostgreSQL at application startup. Keep Azure deployment blocked until its remaining prerequisites are verified.
- Azure hosts the combined application; Supabase hosts PostgreSQL. Azure SQL, its VNet integration, and SQL bootstrap/firewall automation are retired. Releases use a reviewed EF migration bundle during a maintenance window, using one Npgsql-formatted GitHub stage secret for migrations. Bicep takes that value as a secure parameter to create the Key Vault secret and App Service reference; the app identity has secret Get access. Network restrictions remain deferred. Revisit restricted database credentials before production. Keep application tables outside Supabase's exposed public schema.
- Keep `TODO.md`, `README.md`, and `CHANGELOG.md` aligned with delivered behavior. Check off tasks only after verification.
- Leave changes uncommitted unless the user asks for a commit or push.

## Project skill

The project workflow is captured in `.agents/skills/hockey-development/SKILL.md`. Read it when working on editor behavior, drill/training workflows, or their shared API. Refine it as actual project preferences emerge.
