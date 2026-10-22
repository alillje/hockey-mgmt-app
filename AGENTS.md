# Hockey Trainer Management

## Working conventions

- Keep the local, unauthenticated proof of concept usable. SQL Server migrations and combined React/.NET publishing are approved preparation; auth, teams, invitations, and enabling public hosting need later implementation and review.
- Use .NET 10, classic ASP.NET Core controller classes, C# PascalCase types and members, and async methods with cancellation tokens for I/O.
- Keep HTTP handling, use cases, persistence, and transport contracts separate. Avoid building a generic framework around this small application.
- Use strict TypeScript, React components grouped by feature, and one API client boundary. Keep editor geometry and state transitions independent of rendering.
- Read `docs/api-contract.md` before changing an API. Coordinate backend and frontend changes in the same work, and update the contract when behavior changes.
- Use SQLite for the local POC. Preserve saved data across restarts. New databases must start empty; never insert example drills or practices automatically. Do not commit database files or downloaded tooling.
- Use explicit SQL Server configuration for hosted persistence. Generate and review migrations separately; never migrate or seed SQL Server at application startup. Keep Azure deployment blocked until its remaining prerequisites are verified.
- Keep `TODO.md`, `README.md`, and `CHANGELOG.md` aligned with delivered behavior. Check off tasks only after verification.
- Leave changes uncommitted unless the user asks for a commit or push.

## Project skill

The project workflow is captured in `.agents/skills/hockey-development/SKILL.md`. Read it when working on editor behavior, drill/training workflows, or their shared API. Refine it as actual project preferences emerge.
