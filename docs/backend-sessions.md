# Backend-managed sign-in sessions

Supabase remains the identity provider. React sends email/code requests to .NET; .NET verifies the resulting JWT and stores encrypted access/refresh tokens in the private application schema. The browser receives a random session cookie, never the Supabase tokens. The shared API client obtains a CSRF token from the session endpoint and sends it on writes, including authentication requests.

## Email template

In each Supabase project's **Authentication → Email Templates → Magic Link**, use a code-only template. Supabase uses this template for email OTP too; there is no separate provider to enable.

```html
<h2>Sign in to Ice Work</h2>
<p>Enter this code in the app:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px;">{{ .Token }}</p>
<p>This code expires shortly and can only be used once.</p>
<p>If you did not request this email, you can ignore it.</p>
```

Suggested subject: **Your Ice Work sign-in code: {{ .Token }}**.

Remove sign-in buttons, ConfirmationURL/TokenHash links and fallback URLs from the template. No callback URL or redirect setting is needed for OTP. Existing Supabase redirect allowlist entries can stay, but this app no longer uses them. Old callback URLs discard their link credentials and show code sign-in; the backend rejects token-hash-only verification requests. Do not log codes, cookies or Supabase tokens.

## Configuration and storage

| Setting | Local default | Azure configuration managed by Bicep |
| --- | --- | --- |
| Auth:Session:KeyRingPath | API App_Data/session-keys | /home/data/icework-session-keys |
| Auth:Session:IdleHours | 24 | 24 unless configured |
| Auth:Session:MaximumDays | 7 | 7 unless configured |

No additional GitHub secret is required. Bicep enables persistent App Service storage and sets the key directory. These settings are required in hosted environments; startup fails if they are missing. They must be applied before this application release.

The database stores only session-ID hashes and protected token payloads. Data Protection keys are persisted outside the deployment directory and database, with owner-only directory permissions on Unix. Hosted storage relies on App Service volume security/encryption at rest; this implementation does not wrap key-ring files with a Key Vault key. Anyone with access to both the key ring and database can decrypt the tokens. Restrict access to both, keep keys out of source control/artifacts, and retain the key ring across deployments. Protect backups accordingly. Losing it requires users to sign in again. Instances of the same environment must share the same persistent directory; each environment has a separate protection application name.

The additive migration creates hockey.BrowserSessions with expiration indexes, enables RLS with no client policies, and revokes access from PUBLIC and Supabase browser roles when present. The current privileged backend database login can use it. A future restricted backend role needs an explicit server-only access policy/grants; do not grant browser roles session-table access. Existing content and memberships are untouched. SQLite upgrades add the same table without resetting saved content.

## Session behaviour and limits

- Sessions persist through browser/app restarts until the configured idle or absolute deadline. Activity extends the idle deadline, never the absolute deadline. Expired rows are removed on access and during new sign-ins.
- Supabase access/refresh tokens are refreshed on the server near JWT expiry. A database lease serialises rotation across instances. Provider outages deny the request; invalid refresh credentials revoke the session. A failed/crashed refresh lease expires after 30 seconds; clients may need to retry. If refresh succeeds upstream but saving its rotated credentials fails, fresh sign-in may be required.
- Logout deletes the database row before contacting Supabase. Replaying the old cookie cannot restore access. Logout affects this browser session only. Removing team/organisation membership is checked by the existing backend permissions.
- Disabling/deleting an account directly in Supabase does not instantly revoke an already-issued JWT or the local session. It is rejected when provider refresh fails; immediate revocation requires deleting the corresponding server sessions. A user-facing revoke-all-devices feature is deferred.
- Production cookies are Secure, HttpOnly, SameSite=Lax with the __Host- prefix. Only Development permits non-Secure HTTP cookies.
- CSRF protection rejects missing, forged, other-browser and pre-sign-in tokens. Fetch a new session/CSRF token after sign-in/logout. API requests use same-origin credentials; no cross-origin credentialed API access is enabled.
- Auth email/verification requests have an in-memory limit of 20/minute per peer IP per instance. Global limits are 600/minute per user or anonymous peer IP per instance. Behind proxies, peer addresses may be shared; do not trust arbitrary forwarded headers to work around this. These limits reset on restart and do not replace distributed/edge abuse protection. Supabase also sees server-originated requests and applies its own configured limits; review those for aggregate usage.
- XSS prevention remains necessary: HttpOnly prevents JavaScript reading the session cookie, but injected code could still perform actions in the signed-in browser. CSP/CAPTCHA and a broader security review remain separate work.

## Rollout and verification

1. Review the generated BrowserSessions migration SQL in CI; use the existing migration pipeline during the maintenance window. Never run hosted migrations at app startup.
2. Preview/apply the environment's infrastructure through its pipeline to configure persistent keys.
3. Update the Supabase Magic Link template for that environment. Remove all links and retain the OTP code.
4. Deploy the new app through the normal release pipeline. Existing localStorage sessions are discarded and users sign in again.
5. Verify email code sign-in, saving content, CSRF rejection, logout, and continued session access after an App Service restart. Repeat on stage before prod.

The release retains the local unauthenticated SQLite POC. Session and CSRF checks are enabled with Supabase mode; local POC requests keep their existing behaviour.
