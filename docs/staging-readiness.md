# Staging readiness evidence

The staging application is not yet approved for public deployment. The web app remains stopped with public network access disabled.

## Verified

- The [main CI run 39928643757](https://github.com/alillje/hockey-mgmt-app/actions/runs/39928643757) passed PostgreSQL integration checks and applied the Linux EF bundle twice to disposable PostgreSQL.
- The [database preview run 39932447532](https://github.com/alillje/hockey-mgmt-app/actions/runs/39932447532) succeeded for the same commit, `c8f197b`. Its SQL SHA-256 was `0bd2417ed6c8cfe6dc076b0ed05f2842ffa49e83bf09ece1f845fb8872f7f966`.
- Review of that SQL found only creation of the `hockey` and `hockey_migrations` schemas, three empty application tables, two indexes, and EF migration history. It contains no seed data or changes to Supabase-managed schemas.
- Supabase JWT validation, anonymous API rejection, and the published React app passed automated checks. The owner approved a shared staging workspace without team authorization for this test phase.

These observations support `postgresqlProviderAndReviewedMigrationsImplemented=true` in `iac/stage/application-readiness.json`. They do not prove a live connection to the staging Supabase database.

## Still required

- Apply the reviewed bundle to the staging Supabase project while the Azure app is stopped and private; verify the connection and schema.
- Verify the application's runtime database access after the schema exists.
- Rehearse backup and restore into a disposable target, and record the result before enabling public access or app deployment.
