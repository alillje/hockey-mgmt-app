# Supabase email magic-link sign-in plan

Status: local development slice implemented and under verification. Staging configuration and deployment remain pending; production stays unconnected. This work does not enable Azure public access or change Supabase project settings.

## Proposed first slice

Use the existing **staging Supabase project** for Auth from both the local app and the stage app. Local data remains in SQLite; stage data remains in Supabase PostgreSQL. This avoids a local Supabase/Docker requirement, while both app origins intentionally share test Auth users. Give production its own Supabase project later.

Use Supabase's browser client for the default email magic-link flow. The React app sends a link with `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } })`, restores its session on the callback, and offers **Log out** for the current browser session. Supabase's default magic-link template works for the first browser-based flow; custom template/PKCE work can follow if needed. Magic links are one-use; Supabase's current default request interval is 60 seconds and link expiry is one hour. [Passwordless email guide](https://supabase.com/docs/guides/auth/auth-email-passwordless), [sign out](https://supabase.com/docs/guides/auth/signout)

For this first version, show the signed-in user's email in the app header/account area. Do not require a display name or add a profile form to complete sign-in. Later, add an application profile keyed by Supabase's stable user ID so each person can choose a display name (and other team-facing details) without changing how login works. Email remains contact/sign-in information and may change; authorization and ownership must use the stable user ID, never a display name or editable email.

The C# API, rather than the React screen alone, must protect drill, practice, catalog, and export-related data. It will validate Supabase access tokens from the configured project (signature, issuer, audience, and expiry) and reject missing/invalid tokens. Use the project's **asymmetric JWT signing keys** and its public JWKS; never put a JWT secret or Supabase secret/service-role key in React. The owner approved a shared staging workspace for any user with a valid session from this Supabase project until team authorization exists. [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)

Keep the existing local unauthenticated POC available behind an explicit **Development-only** configuration mode. The new local auth mode will be exercised separately; staging must fail closed if Auth configuration is absent. Health and readiness endpoints can remain unauthenticated for deployment checks, but they expose no user data. No automatic database seeding or migration changes are needed for the first auth slice.

## What the owner sets up first

1. In the staging Supabase project, confirm **Authentication → Providers → Email** is enabled and keep email confirmation enabled. The app sets `shouldCreateUser: false`, so its sign-in form does not create accounts. In **Authentication → General settings**, turn off **Allow new users to sign up** if only dashboard-invited users should exist. If project-wide signups are enabled, other clients can still create accounts in this Supabase project, and those users can access the shared staging workspace after sign-in. [General configuration](https://supabase.com/docs/guides/auth/general-configuration)
2. In **Authentication → URL Configuration**, allow the exact local callback `http://localhost:5173/auth/callback` and the stage callback `https://hockey-mgmt-app-stage.azurewebsites.net/auth/callback` (or the actual default hostname if different). Set the Site URL to `http://localhost:5173` for the first local invitation, then change it to the stage origin when staging is reachable; the app will pass the exact callback in `emailRedirectTo` for sign-in on both origins. Do not use broad production redirect wildcards. The stage callback will remain unreachable while public access is disabled. [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
3. In **Project Settings → API Keys**, copy the **project URL** and **publishable key** (`sb_publishable_...`). Put them in GitHub `stage` **variables** as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; they are browser-visible values, not database credentials. **Local sign-in also requires both values**; GitHub variables are not available on the developer's computer. During implementation, add them to the already ignored `backend/appsettings.Local.json` and load that file only in Development. The .NET API will serve the public values to React through `/api/auth/config`, so they do not need to be entered twice. Keep `SUPABASE_DATABASE_CONNECTION_STRING` in GitHub Secrets. [React Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react)
4. In **Authentication → JWT Signing Keys**, confirm the active key is asymmetric. If the project still uses the legacy shared JWT secret, migrate/rotate via Supabase's documented process before the .NET API relies on JWKS. Do not send or commit the JWT secret. [Signing-key migration](https://supabase.com/docs/guides/auth/signing-keys)
5. For the owner's own organization-member address, the built-in email sender can support initial local experiments. For any tester outside the Supabase organization, configure **custom SMTP** in Supabase before inviting or sending magic links. The built-in sender currently only sends to organization members and is limited to two emails per hour. Configure SMTP credentials in Supabase, not GitHub or the app, and test delivery. New Free projects using the default sender also cannot customize email templates. [SMTP limits](https://supabase.com/docs/guides/auth/auth-smtp), [Free-tier template change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
6. Add the first tester under **Authentication → Users → Add user → Send invitation**. The app does not automatically create users. No password or service-role key is needed in this app. [Inviting users](https://supabase.com/docs/guides/auth/users)

The owner supplied the stage project URL and publishable key for local development. Staging still needs verification of the actual hostname before deployment. These public values can live in stage variables; SMTP passwords stay only with Supabase. No Supabase personal access token is needed.

The planned `backend/appsettings.Local.json` will contain:

```json
{
  "Auth": {
    "SupabaseUrl": "https://YOUR-PROJECT.supabase.co",
    "SupabasePublishableKey": "sb_publishable_<copy-from-dashboard>"
  }
}
```

This file is ignored by Git. `./scripts/dev.sh` loads it in Development and enables Supabase mode; `HOCKEY_LOCAL_AUTH=0 ./scripts/dev.sh` keeps the unauthenticated POC available.

## Implementation work in this repository

1. **Implemented locally:** Add a small Auth configuration boundary. In Development, load the ignored `backend/appsettings.Local.json` containing the public Supabase URL and publishable key. The .NET app exposes only those public values through a read-only `/api/auth/config` response. CI does not bake stage values into the Vite bundle. The shared API contract is updated.
2. **Implemented locally:** Add the Supabase browser client, an email sign-in screen, callback state and error handling, session restoration/refresh, and a visible **Log out** action. Show the signed-in email for now, without asking for a name. The one API client boundary attaches the current access token to requests. Live email delivery and callback still need owner verification.
3. **Implemented in code:** Add ASP.NET Core bearer-token validation against the configured Supabase issuer/JWKS, with a stable user ID (`sub`) as the identity. Protect all content controllers and reject unauthorized access server-side. Keep the unauthenticated mode restricted to local development.
4. **Implemented in code, not applied:** Bicep stage settings and future production parameters read the project URL and publishable key from separate environment variables. Both are public configuration values; the database password remains a Key Vault reference. The Auth callback route is handled by React Router after sign-in.
5. **Partly complete:** Add focused API tests for no token, wrong project, valid authenticated user, and invalid roles. Verify magic-link delivery, callback/logout, and local SQLite persistence with an actual invited email; then verify stage only after CI and the deployment prerequisites pass.
6. Update the API contract, README, TODO, changelog, deployment guide, and readiness evidence. Keep the deployment flags closed while the Auth work is being built.

## Staging release boundary

The owner approved a shared staging workspace without team authorization for this test phase. Anyone who obtains a valid session from the configured Supabase project can access the shared app data; the magic link proves email control, while Supabase's signup settings determine whether new accounts can be created. Keep `STAGE_PUBLIC_ACCESS_ENABLED=false` and `STAGE_DEPLOYMENT_ENABLED=false` until database access and recovery are verified. Staging must become reachable over HTTPS for the email callback when testing starts.

## Production later

Use a separate Supabase project, its own URL, publishable key, JWT issuer/JWKS, SMTP sender, exact callback URL, and database connection. Add team membership and authorization throughout the API before treating the product as multi-tenant. Add an application profile and user-chosen display name when team-facing identity is needed; do not use a display name as an authorization key. Verify email delivery, account recovery, rate limits, backups, and key rotation before a public release. Production infrastructure parameters can be prepared in code, but no production environment or deployment workflow is activated by this plan.
