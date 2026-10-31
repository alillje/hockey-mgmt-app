# Hockey Trainer API contract — v1.17

Backend and frontend agents agreed this contract before implementation. API base: `/api`; camelCase JSON; UUID resource identifiers; ISO 8601 UTC `updatedAt` values. Development frontend proxies requests to `http://localhost:5180`.

## Supabase Auth and backend sessions

- The unauthenticated SQLite development POC remains available. Hosted environments require Supabase Auth and explicit memberships.
- GET /api/auth/config remains anonymous and retains the public enabled/supabaseUrl/publishableKey shape for compatibility. React no longer uses the Supabase browser SDK or bearer headers. Supabase tokens are never returned by session endpoints.
- GET /api/auth/session is anonymous in Supabase mode and returns { authenticated, email, csrfToken }. It creates/reads an HttpOnly antiforgery cookie. Responses are not cacheable. After sign-in or logout, fetch this again to obtain the token for the new principal.
- POST /api/auth/email accepts { email }; returns 204 without disclosing account existence. The backend requests a Supabase OTP with create_user=false. No redirect is requested.
- POST /api/auth/verify accepts required { email, code }. Token-hash-only requests are rejected with 400. The backend verifies with Supabase, validates the signed JWT (issuer, audience, lifetime, algorithm, authenticated role, non-anonymous UUID subject), creates a new server session and sets its cookie; returns 204. Invalid/expired credentials return 401.
- POST /api/auth/logout returns 204 after revoking the current server session and removing the cookie. Supabase sign-out is best-effort after local revocation; other devices remain signed in.
- Every unsafe API request (POST/PUT/PATCH/DELETE), including anonymous email/verify/logout, requires the matching antiforgery cookie and X-CSRF-TOKEN header from GET /api/auth/session. Missing, forged, foreign-browser or wrong-principal tokens return 400. Safe GETs do not mutate content or complete sign-in.
- The hosted session cookie is __Host-icework.session: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain. Local Development uses icework.session over HTTP. It contains a random 256-bit opaque ID; only its SHA-256 hash is stored in the database. Authenticated content requests require this cookie; a bearer header alone returns 401.
- The private hockey.BrowserSessions table stores protected Supabase tokens. ASP.NET Data Protection keys live in persistent app-private storage, separate from the database. Database leases coordinate refresh-token rotation across requests/instances. Refreshes never recreate a deleted session. Sessions expire after 24 hours idle or 7 days maximum by default; Auth:Session:IdleHours and MaximumDays configure these limits.
- Membership checks still query the current database on requests. Session identity is never permission data from user_metadata.
- Session/email/verification errors use ProblemDetails. Supabase outages fail closed with 503; rejected refresh credentials revoke the local session. Auth requests are limited to 20/minute per peer IP per process; the global limiter allows 600/minute per authenticated user or anonymous peer IP per process. 429 includes Retry-After. These limits supplement Supabase limits and are not distributed edge protection.
- GET /api/health, /api/readiness, /api/auth/config and /api/auth/session remain anonymous. All other content controller endpoints require a valid server session in Supabase mode.
- Sign-in is OTP-only. Use the code-only Supabase template in [backend session setup](backend-sessions.md). Retired callback URLs discard link credentials without exchanging them. Existing browser sessions require fresh sign-in after this rollout.

## Catalog and health

The combined server adds enforced Content-Security-Policy, X-Content-Type-Options: nosniff, X-Frame-Options: DENY and Referrer-Policy: no-referrer headers to documents, assets, API results and handled errors. Browser connections remain same-origin; see [browser security](browser-security.md) for allowed resource types and published-app checks. JSON request/response contracts are unchanged.

- `GET /api/health` → `200 { "status": "ok" }`.
- `GET /api/readiness` → `200 { "status": "ready" }` when the database schema is available and SQL migrations are current; otherwise 503 ProblemDetails. This read-only check does not create or migrate tables.
- `GET /api/catalog` → `200 { "categories": [{ "id": "skating", "name": "Skating" }, ...], "ageGroups": [{ "id": "U8", "name": "U8", "sortOrder": 8 }, ...] }`. Age groups are read from the database in `sortOrder` order.
- Category IDs: `skating`, `stick-handling`, `passing`, `shooting`, `battling`, `tactics`, `warm-up`, `other`.

## Drills

- `GET /api/drills?search=&categoryId=&tag=` → array of full drill resources. All filters are optional. Search matches title, notes, or tags; tag matches a complete tag, ignoring case and redundant whitespace.
- `GET /api/drills/{id}` → drill resource or 404.
- `POST /api/drills` → 201 with resource and Location header.
- `PUT /api/drills/{id}` → 200 with updated resource or 404.
- `DELETE /api/drills/{id}` → 204, 404, or 409 if a training references the drill.

Upsert body: `{ title, categoryId, notes, diagram, tags? }`. Resource adds `{ id, updatedAt }` and always includes `tags: string[]`. Titles are required (maximum 120 characters); notes default to empty (maximum 6000 characters). Category must exist and remains for API compatibility; folders use the tags array. The frontend derives the legacy category from the first matching suggested category tag, or `other`.

Drill names are unique among drills owned by the same team or club library; practice names are unique among practices in that workspace. Names are compared after trimming and without case sensitivity. The same name may be used by a drill and practice, or in a different team/library. Duplicate create/update requests return 409 and preserve the saved item.

```typescript
type Point = { x: number; y: number };
type EquipmentType = 'cone' | 'goal' | 'tire' | 'smallTire' | 'player' | 'puck' | 'puckPile';
type PathKind = 'skating' | 'skatingBackward' | 'passing' | 'puckHandling' | 'shooting' | 'solid' | 'dotted' | 'dashed' | 'box';
type Diagram = {
  version: 1;
  objects: Array<{
    id: string;
    type: EquipmentType;
    x: number;
    y: number;
    rotation: number;
    color: string;
    label: string;
  }>;
  paths: Array<{
    id: string;
    kind: PathKind;
    points: Point[];
    color: string;
  }>;
};
```

The full rink uses a 1000 × 500 coordinate system. Positions/points are finite and inside those bounds; rotations are finite; colors are six-digit hex strings. Element IDs are unique UUID strings generated by the client; labels default to empty (maximum 40 characters). Empty diagrams are valid. Limits: 200 objects and 100 paths per diagram; each path requires 2–500 points. Unsupported versions/types and excessive payloads produce 400 validation responses.

`skatingBackward` stores the same route points as other path kinds and renders separate marks leaning alternately left and right. `shooting` renders two parallel rails with open starts and one arrowhead extending beyond the route endpoint. `solid`, `dotted`, and `dashed` render plain lines without arrowheads, distinct from the existing skating, puck-handling, and passing routes. Arrow headings are taken from a short trailing stretch of points to avoid flicker from tiny pointer movements. Existing diagrams remain version 1.

The editor labels the existing `puckHandling` route **Skate with puck**; its saved kind remains unchanged so older diagrams keep rendering.

The editor draws new `passing` and `shooting` routes as straight start-to-end paths with two points, even when the pointer travels through a bend. Existing saved routes retain their stored points.

`smallTire` is half the linear size of `tire`. `puckPile` renders several pucks but is one saved object, with one position, rotation, and identifier. A red-player creation preset uses the existing `player` type with a red `color`; it does not add another equipment type. The goal rotation slider is removed. The rotate button advances goals to the next 90° orientation; other equipment retains 45° increments. Existing finite rotations remain valid so opening older diagrams does not change saved data. These additions retain diagram version 1 and require no database schema changes.

## Trainings

- `GET /api/trainings?search=&tag=` → array of full training resources, with optional search/tag filters matching the drill list semantics.
- `GET /api/trainings/{id}` → resource or 404.
- `POST /api/trainings` → 201 with resource and Location header.
- `PUT /api/trainings/{id}` → 200 with updated resource or 404.
- `DELETE /api/trainings/{id}` → 204 or 404.

Upsert body: `{ title, notes, items: [{ drillId, durationMinutes, notes }], tags? }`. Resource adds `{ id, updatedAt }` and always includes `tags: string[]`. Array order is session order; repeated drills are allowed (up to 100 entries). Duration is an integer from 1 to 240 minutes. Titles and notes follow drill limits. Missing drill references produce 400. Empty trainings are valid drafts.

## Tags and compatibility

- Tags are labels from the fixed catalog only: Skating, Stick handling, Passing, Shooting, Battling, Tactics, Warm-up, and Other. Creating custom tags is not supported.
- Accept up to 20 supplied entries; trim and collapse whitespace, deduplicate case-insensitively, preserve order, and return canonical catalog spelling. Unknown labels produce 400. There can be at most eight distinct tags after normalization.
- Explicit `[]` means no tags. The UI groups those items under Uncategorized. A tagged item appears in every corresponding folder without being copied.
- Omitted or null tags preserve existing tags on PUT. Legacy drill POST without tags derives a single tag from `categoryId`; training POST defaults to no tags. The current frontend always supplies tags.
- Practice tags are independent from the tags of its drills. Existing practices receive a one-time union of referenced drill tags when upgrading the original schema.
- SQLite schema version 1 adds `TagsJson` columns transactionally and backfills legacy values. Version 2 normalizes and deduplicates existing tag arrays, mapping unsupported legacy labels to Other. Version 3 moves Hockey School from tags into the age-group selection, including old single-category drill records, without changing other metadata. Resource IDs, notes, diagrams, timestamps, age groups, and practice entries are preserved. Repeated starts preserve explicit tag edits and empty tag arrays. No table drops or resets are part of the upgrade.

Hockey School is a selectable age group with catalog ID `HockeySchool`. It is not a category or tag. New drill/practice writes reject it in `tags`, and the database upgrade transfers saved Hockey School tags to `ageGroups` while retaining other tags and existing age selections.

## Errors and POC boundaries

Errors use ASP.NET Core ProblemDetails (`status`, `title`, optional `detail`, and validation `errors`). The local POC uses a single local administrator; hosted permissions are scoped to explicit organisation/team memberships. Drills referenced by trainings stay live: changing the drill updates its use in existing trainings. PDF export is a client capability and has no API endpoint.


## Organisations, teams, and content ownership

- `GET /api/workspace` → `{ userId, isPlatformAdmin, organisations: [{ id, name, isAdmin, role, teams: [{ id, name, canEdit, canView, role }] }] }`. Regular users see their organisations only; the configured platform administrator can manage every organisation. Supabase user metadata is never used for permissions.
- `POST /api/workspace/organisations` with `{ name }` creates an empty organisation; platform administrator only. It never adopts other organisations' content.
- `POST /api/workspace/teams` with `{ name }` creates a team in the selected organisation; administrator only. Teams have no age-group metadata in the active API. A submitted legacy `ageGroup` field is ignored.
- `GET /api/workspace/members` lists `{ userId, role, teamId, teamRole, firstName, lastName, email }` for the selected organisation; administrator only.
- `POST /api/workspace/members` with `{ userId, role: "admin" | "member", teamId?, teamRole: "editor" | "viewer" }` adds membership or promotes access; 204. Only the platform administrator may appoint an organisation administrator. Provision Auth users separately; this endpoint sends no invitation.
- `POST /api/workspace/members/by-email` with `{ email, role: "admin" | "member", teamId?, teamRole: "editor" | "viewer" }` is the member-management UI action. It trims and matches the email case-insensitively against existing non-deleted Supabase Auth users, resolves the UUID on the server, and delegates to the existing atomic membership rules. It returns 204, or 404 with "No registered user was found with that email address." Invalid emails/roles/teams return 400; unauthorised administrators/role promotions return 403 before directory lookup. Directory outages or missing local configuration return 503; ambiguous matching emails return 409 without adding access. No account or invitation is created. Duplicate adds preserve current access. The ID-based route remains compatible with existing clients; listing, updates and removal still use stable UUIDs. The directory is never exposed as a search/list endpoint.
- `PUT /api/workspace/members/{userId}` with `{ role: "admin" | "member" }` changes an existing organisation role; 204. Appointing or changing an administrator requires the platform administrator.
- `PUT /api/workspace/teams/{teamId}/members/{userId}` with `{ teamRole: "editor" | "viewer" }` changes an existing team membership; 204.
- `DELETE /api/workspace/teams/{teamId}/members/{userId}` removes that team membership and clears an affected default-team preference; 204. Organisation membership remains.
- `DELETE /api/workspace/members/{userId}` atomically removes organisation membership, all memberships of its teams, and an affected default-team preference; 204. Content remains owned by its workspace. Other organisations and memberships are preserved.
- Membership management requires an administrator of the selected organisation. Organisation administrators cannot modify or remove administrator accounts, including their own, through any membership endpoint; only the platform administrator can. Foreign team IDs and missing memberships return 404. Invalid roles return 400. Unauthorised actions return 403.
- Content and organisation-scoped requests use `X-Organisation-Id` and optional `X-Team-Id`. A supplied team must belong to the selected organisation and be accessible to the user. Omit the team to manage organisation-owned content (admin) or browse the club library (member). Hosted requests without a valid organisation selection return 403. Unauthenticated local requests without these headers default to the preserved local team.
- Organisation admins manage all teams, team content, library content, and regular memberships within their organisation without separate team memberships. Regular members need explicit team membership: editors modify/contribute team content and viewers read only. The team selector lists accessible teams only and defaults to the saved default or an accessible team. Viewing or editing club content keeps the selected team; existing-resource authorization and ownership still come from that resource. Creating a drill inside a club practice omits the team header for that creation request. Organisation members without teams may still browse club content. Membership checks query current persisted access on each request, so changes affect existing sign-in tokens.
- Platform administration uses the existing server-configured `Workspace:LegacyAdminUserId` UUID (`LEGACY_WORKSPACE_ADMIN_USER_ID` in hosted IaC). If it is absent, hosted organisation creation and administrator appointments are denied. No platform role is taken from browser claims or user metadata. The unauthenticated local POC retains its fixed administrator.
- Authenticated users without organisation membership may inspect their workspace status and account, but content access returns 403. The frontend shows a no-organisation access page with a retry action and Account/logout access. The platform administrator can create an organisation from an empty workspace.
- Content lists return accessible resources in the selected organisation (the user's member teams plus organisation-library content). Team views and plan pickers filter exact `ownerTeamId`; the organisation library filters `ownerTeamId === null`. No team original becomes library-visible through copying.

Drill and training resources retain all existing fields and add `ageGroup: string` (a canonical catalog ID, or empty for unspecified/all ages) and:

```typescript
type Ownership = {
  organisationId: string;
  ownerTeamId: string | null; // null = organisation-owned
  ownerName: string;
  originTeamId: string | null;
  originTeamName: string | null;
  canEdit: boolean;
  canCopyToTeam: boolean; // library source and selected team is editable
  canCopyToLibrary: boolean; // source belongs to selected team and user can edit it
};
```

The `canCopyToTeam` and `canCopyToLibrary` flags describe the legacy selected-workspace actions. The new destination picker uses the workspace list and the explicit-destination rules below; the backend validates each destination again.

Content upserts accept `ageGroup` but never client-supplied ownership, visibility, or capabilities. Supported levels are Hockey School, U8–U16, U18, U20, and Senior; the database catalog supplies their IDs, names, and ordering. New content writes reject unsupported levels with 400; matching is trimmed/case-insensitive and stores the canonical ID. Omitting age group on PUT preserves it; new content starts with no selected ages, and explicit `""` clears it. Existing free-text content metadata remains readable and may be saved unchanged, but cannot be newly assigned. Copies preserve that existing metadata. The server assigns new content to the selected editable team, or to the organisation library when an administrator selects that workspace. Ownership cannot be changed through an upsert. Optional originating-team attribution never grants source access.

Practice entries remain ordered drill references: `{ drillId, durationMinutes, notes }`. Array order persists as `Position`; repeated drill references are supported. Entry notes belong to the plan. Every referenced drill must have the same `organisationId` and `ownerTeamId` as the plan (including null for library plans). Inaccessible drill IDs return 400; accessible drills from the wrong workspace return 409. The database also enforces this invariant. Deleting a referenced drill returns 409 with a dependency explanation without exposing private plan details.

## Independent copies

- `POST /api/drills/{id}/copy` and `POST /api/trainings/{id}/copy` accept `{ organisationId, teamId }`. Use a team UUID for a team destination or `null` for the club library. Return 200 with a new resource. The authenticated user must be able to read the source, and the submitted destination is validated against current memberships inside the transaction.
- Source and destination must belong to the same organisation. A team destination must exist in that organisation and be editable by the user. Readable team or club content can be copied into an authorised team, including the same team. Club contributions from team content require editing access to the source team; copying existing club content into the club again requires organisation administrator access. Invalid or unauthorised destinations return 403; inaccessible source IDs return 404. Submitted IDs never grant membership or change source ownership.
- The legacy `/copy-to-library` and `/copy-to-team` endpoints remain compatible for older clients, with their existing selected-team and source-kind restrictions. The frontend uses the explicit-destination `/copy` actions.
- A drill copy gets a fresh ID, the source name with ` - Copy` appended, and unchanged metadata, drawing JSON, and instructions. If that name is used in the destination workspace, append a number such as ` - Copy (2)`. No matching or overwriting occurs by name or source ID. Copies carry no source-record foreign key.
- A plan copy gets a fresh ID and the source plan name with ` - Copy` appended (numbered when needed). It **copies every distinct included drill once within that operation**, with fresh IDs and similarly unique ` - Copy` names. The new entries reference only those destination drills and preserve ordering, durations, and entry notes. Separate operations always create separate plans/drills. Source and destination changes/deletions are independent.
- All copy operations run in a serializable transaction, validate every included source drill's accessibility/workspace, and commit together. Failure leaves no partial plans/drills. The UI's **Create copy** dialog requires a destination choice, explains that included drills are copied, guards double submission, and opens the new saved view automatically on success.
- Saved `/drills/:id` and `/practices/:id` routes display view pages with PDF export and authorised Edit/Create copy actions at the top. Editing uses `/drills/:id/edit` and `/practices/:id/edit`. Successful saves return to the saved view, except nested drill creation which returns to its parent practice draft. View pages show saved content without loading editor drafts; selecting or viewing content does not change the current team. Creation and nested-drill routes retain their draft behavior.
- There are no visibility toggles, linked copies, synchronisation, `/visibility`, `/sharing`, or `/items/{position}/copy-drill` actions.

## Data upgrade and deployment

SQLite uses its existing transactional initializer, preserving saved records and applying the one-time independent-copy and workspace-name upgrades. PostgreSQL uses reviewed EF migrations, including `IndependentWorkspaceCopies` and `UniqueContentNames`, applied separately during maintenance. Team originals retain IDs; previously shared team content gets independent library copies; cross-workspace plan references are repaired with local drill copies. Duplicate legacy names in one workspace are deterministically renamed with ` - Copy` suffixes while retaining all other content. Ambiguous ownership or private/cross-organisation dependencies stop the upgrade without widening access. Deterministic migration IDs and transaction/history markers prevent duplicate copies on retries. See [independent-copy migration](independent-copies.md) for details, backup requirements, and membership review. Hosted startup never migrates.

## Unified search, account defaults, and multiple age groups

- The frontend has **Drills** and **Practices** as its content views. Each search/category view has source checkboxes for accessible teams and club content. The active/default team is initially checked; club content is opt-in. Explicit selections (including selecting none), age filters, categories, and search are preserved in the URL and browser history. The former `/club-library` route redirects to `/drills/all?source=club`.
- Results display explicit `Team: <name>` or `Club: <name>` ownership badges. UI filters never expand backend access. Independent-copy permissions/reference rules remain as above.
- `GET /api/account/preferences` → `{ defaultTeamId: string | null }`, for the verified user, without requiring a selected organisation. The user's only accessible team is automatically effective when there is one. A stored default that is no longer accessible is ignored.
- `PUT /api/account/preferences` with `{ defaultTeamId: string | null }` saves the verified user's preference. The selected team must be viewable through that user's persisted organisation/team memberships; otherwise 403. No submitted user ID selects the preference owner. Preferences are stored in `hockey.UserPreferences` in PostgreSQL and in SQLite locally. Removing a team clears its preference reference.
- Drill/practice requests and resources add `ageGroups: string[]`. Requests trim, canonicalise, deduplicate and order these fixed database catalog IDs. Unknown new levels return 400. `[]` explicitly clears the selection; omitted values on update preserve current selections. Legacy metadata may remain unchanged or be removed.
- For compatibility the deprecated single `ageGroup` field remains readable and accepted. When only it is supplied it becomes a single-element selection. Responses project the first selected level into that field; new clients use `ageGroups`. Supplying `ageGroups` takes precedence.
- **Select all age groups** selects every catalog ID individually. There is no `All ages` catalog entry or stored sentinel. U19 has been removed from the catalog; existing saved U19 metadata remains readable and is presented as a previous value until cleared. Empty metadata means unspecified; no selected age search filters means no age restriction. Multi-age filters match any selected level.
- Teams no longer expose or accept age groups, and old team ages never become new-content defaults. Drill and practice editors retain independent age checkboxes. The legacy team database column is retained unused for schema compatibility; no migration or data reset is needed.
- `AccountDefaultsAndContentAges` adds default-team preferences and backfills nonempty legacy content age values into arrays. Existing drawings, plan entries, and memberships remain unchanged. The local SQLite initializer applies the same metadata upgrade transactionally.
- Fresh authenticated SQLite databases start with no organisations or teams. Startup does not repopulate cleared organisations/teams. The unauthenticated local POC retains its local default workspace; the explicit legacy-admin bootstrap adopts an existing legacy workspace only.

## User profiles and member directories

An existing browser session receiving 403 `Profile required` must recheck the profile and return to required onboarding before mounting the workspace again. Missing profile rows and either missing name are incomplete profiles; transport/database failures remain errors with explicit retry, rather than being interpreted as missing data.

- `GET /api/account/profile` returns `{ firstName, lastName, email, isComplete }` for the authenticated user. Missing profiles return empty names and `isComplete: false`; reads never create a profile. Email comes from the verified server identity.
- `PUT /api/account/profile` accepts `{ firstName, lastName }`, trims each required name, rejects control characters or lengths outside 1–100 with 400, and upserts only the current user's profile. Submitted user IDs, roles and emails cannot change identity or permissions. Existing CSRF protection applies; responses are not cacheable.
- In authenticated mode the frontend requires profile completion immediately after OTP sign-in, before mounting the workspace. Existing signed-in users also complete their profile on their next load. Account allows later name changes. Backend content and membership endpoints return 403 `Profile required` until complete; profile/account/auth endpoints and the workspace-status read remain available. The unauthenticated local POC remains usable without onboarding.
- Profiles live in private `hockey.UserProfiles`, independently of Supabase authentication and membership records. Names never grant access. PostgreSQL uses the reviewed `UserProfiles` EF migration, with RLS enabled and direct PUBLIC/anon/authenticated privileges revoked. The privileged backend enforces identity and membership checks. SQLite upgrades add the same table without resetting data. No examples, guessed names or new memberships are seeded.
- Workspace organisation/team `role` fields describe the user's actual membership; a null team role with administrator capabilities means inherited access, rather than team membership. The organisation page lists all the user's available organisations, teams and roles. Platform access to organisations without membership is labelled explicitly.
- `GET /api/workspace/teams/{teamId}/members` returns `{ members, administrators }`; each entry is `{ userId, firstName, lastName, role }`. It requires membership of the selected organisation and either membership of the requested team or organisation administrator access. The team must belong to that organisation. Only current organisation members appear in the team list. The separate administrators list shows inherited organisation administration; administrators with actual team memberships may also appear in the team list with their team role. Emails are never returned by this endpoint. Forged or inaccessible scopes return 403.
- The existing organisation member-management endpoint remains administrator-only and includes profile names and saved verified-session emails when available. A user who has not completed a profile is labelled accordingly. Regular members cannot list an entire organisation or manage access. All membership changes take effect on the next request.
- This feature sends no invitations or emails. Release through the existing application workflow so the migration runs before the new application. No infrastructure deployment, new secrets or Supabase dashboard changes are needed. See [profile and member access](user-profiles-and-members.md).

## Straight annotation lines and boxes

New `solid`, `dotted` and `dashed` paths retain just their start and current endpoint while drawing, like passes and shots. Older saved freehand paths keep their existing points and rendering. Movement tools retain their existing arrowheads; no arrow toggle is added.

The new `box` path kind represents a plain, unfilled rectangle using exactly two opposite corners. Either drag direction is valid. Both corners must be finite and within the existing rink bounds, with nonzero width and height. Extra/missing corners, nulls and degenerate boxes return 400. The editor discards clicks and drags that have no box area. Boxes count toward the existing 100-path limit. Selection and hit testing follow the rectangle edges; moving preserves its shape at the rink boundary, and undo/delete act on the whole box. Shared rendering covers editor, saved views, practice previews and PDF exports. Version 1, existing ownership/copy rules and JSON persistence remain unchanged; no database migration is required. Deploy the updated backend and frontend together through the application workflow.
