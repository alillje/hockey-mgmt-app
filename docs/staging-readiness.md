# Staging readiness evidence

The staging application has not yet been deployed. The web app remains stopped with public network access disabled. The owner approved a limited staging check of database access and email magic-link sign-in on 2026-10-23, and deferred backup/restore rehearsal until later. This exception is for the shared staging POC; it is not a production recovery decision.

## Verified

- The [main CI run 39945037905](https://github.com/alillje/hockey-mgmt-app/actions/runs/39945037905) passed PostgreSQL integration checks and packaged the stage CA certificate with the application and EF bundle.
- The [database preview run 39945375022](https://github.com/alillje/hockey-mgmt-app/actions/runs/39945375022) succeeded for the same commit, `a6242f0`.
- Review of that SQL found only creation of the `hockey` and `hockey_migrations` schemas, three empty application tables, two indexes, and EF migration history. It contains no seed data or changes to Supabase-managed schemas.
- The [database initialization run 39945529448](https://github.com/alillje/hockey-mgmt-app/actions/runs/39945529448) applied `20261022201454_InitialPostgreSql` to the staging Supabase project. Its second run reported that no migrations remained. The workflow verified that the Azure web app was stopped and private.
- Supabase JWT validation, anonymous API rejection, and the published React app passed automated checks. The owner approved a shared staging workspace without team authorization for this test phase.

These observations support `postgresqlProviderAndReviewedMigrationsImplemented=true` in `iac/stage/application-readiness.json`. The migration runner connected successfully; the Azure app's Key Vault reference and runtime database access remain unverified.

## Still required

- During the **Deploy staging application** GitHub Actions run, require `/api/readiness` to confirm the Azure app can resolve its Key Vault database setting and read the migrated tables. Check `/api/auth/config` against the configured Supabase project, and require anonymous drill requests to return 401. A failed smoke check stops the app.
- In a browser, request a staging magic link for an existing Supabase Auth user, follow it to `/auth/callback`, confirm drills can be read and saved, log out, and confirm content is no longer accessible. The workflow cannot send or follow a user's email link.
- Rehearse backup and restore into a disposable target before treating staging data as recoverable or promoting this release approach to production. The owner explicitly deferred that rehearsal for this limited staging POC.
