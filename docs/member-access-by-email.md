# Add existing members by email

Organisation administrators and the platform administrator can use **Manage organisation → Add member access** with an email address. Select organisation-only access or a team and its role. Only the platform administrator can appoint organisation administrators. Existing administrator accounts remain protected from changes by organisation administrators.

The backend checks the caller's organisation, requested role and target team before looking up the email. It reads only the matching user's ID from Supabase Auth using a parameterised, case-insensitive exact match. Soft-deleted users are excluded; ambiguous matches fail rather than selecting an account arbitrarily. It then rechecks permissions within the existing membership transaction. Repeated adds preserve existing roles/access rather than duplicating membership or downgrading access.

If no registered user matches, the UI displays **No registered user was found with that email address.** Lookup failures and missing configuration have separate setup/unavailable messages. This action does not sign up, invite, email or update the Auth user.

There is no user-directory search/list endpoint. The legacy ID-based membership endpoint remains compatible with existing clients; membership lists, role edits and removals continue using stable user IDs.

## Hosted setup

With PostgreSQL persistence, the directory adapter reuses the existing ConnectionStrings:Hockey connection configuration. The lookup is a separate short read connection and does not expose credentials or directory data to the browser. No new Supabase admin API key, GitHub secret, IaC change or database migration is required.

The current privileged Supabase database login can read auth.users. A future restricted backend role will need USAGE on the auth schema and SELECT on only id, email and deleted_at in auth.users (or a separately reviewed server-only lookup interface). Do not expose auth.users through the Data API or grant directory access to browser roles.

Supabase manages this schema; the adapter deliberately reads only the required columns. Review its compatibility if Supabase changes Auth schemas. No Auth table, index, function, policy or user is changed by this feature.

## Local SQLite setup

SQLite holds app content and memberships, but it is not a copy of Supabase's Auth directory. To resolve real users while retaining SQLite, add the connection to the ignored backend/HockeyTrainer.Api/appsettings.Local.json:

```json
{
  "Auth": {
    "SupabaseUrl": "https://YOUR-PROJECT.supabase.co",
    "SupabasePublishableKey": "sb_publishable_YOUR-KEY",
    "UserDirectory": {
      "ConnectionString": "Host=YOUR-HOST;Port=5432;Database=postgres;Username=YOUR-USER;Password=YOUR-PASSWORD;SSL Mode=VerifyFull;Root Certificate=Certificates/supabase-stage-root.crt"
    }
  }
}
```

Merge this with existing Auth and Workspace settings. Use the same Supabase project as local sign-in, its Npgsql connection format and the matching CA certificate. Keep the password out of source control and chat. An environment variable named Auth__UserDirectory__ConnectionString is also supported.

Restart the local backend after changing this setting. When it is absent, the app remains usable and membership lookup shows a clear setup error. It never guesses users from previous local sessions.

## Verification

API tests replace the directory with registered test users to exercise permissions, normalisation, missing-user errors and duplicate access. The PostgreSQL integration test creates its own disposable database and a minimal auth.users fixture to verify exact lookup, deleted-user filtering, ambiguity rejection and parameterisation. It runs in CI when HOCKEY_POSTGRES_TEST_CONNECTION is configured, and never uses a hosted Supabase project.

The browser test verifies email entry, errors and successful team access using the real local membership API with a mocked directory-resolution boundary. Live Supabase lookup remains a separate local/stage check using real configured credentials.
