# Independent workspace copies

Team drills and reusable practice plans are private to their team's authorised members. The organisation library owns separate content which every organisation member may read. Club content appears alongside team content in Drills and Practices when its source checkbox is selected. Organisation administrators manage library content; a team editor may contribute copies from their selected team. Library contributions do not expose or modify the team original.

Use **Copy to organisation library** from saved team content, then **Copy to my team** from library content after selecting an editable team. Both actions create new IDs and preserve names rather than matching or overwriting existing items. Copying a practice plan copies every included drill, once per distinct source drill within that operation, and preserves entry order, durations, and coaching notes. Each separate operation makes fresh copies, even when the same source has been copied before. The confirmation explains this and links to the new item after success.

All drawings, instructions, categories, and age metadata live in the drill row (drawing JSON); there are no uploaded files or source-dependent asset URLs. Copying these values produces independent content. Attribution stores the originating team only and never links to the source drill/plan. Changing or deleting source content cannot alter a copy.

## Authorisation and references

API services verify the authenticated subject's persisted organisation/team memberships. A selected team header does not grant membership. Team editors may modify their team's content; viewers may read it. Organisation administrators have no implicit access to a team's private content: they also need explicit team membership. Creating a team grants its creator editor membership. The explicitly unauthenticated local POC retains its local workspace access.

The copy target is derived from the selected, authorised workspace and the endpoint. No submitted owner, organisation, or team ID sets content ownership. Library contributions require an editor of the selected source team. Copying back requires an editable destination team and an organisation-owned source from that same organisation. Direct team-to-team and organisation-to-organisation copies are rejected.

A plan may reference only drills in its exact organisation and owning team (or only organisation-owned drills for a library plan). The picker contains that workspace's drills. To use a library drill in a team plan, copy it to the team first. Deleting a referenced drill returns a dependency error; remove/replace its plan entries first. Editing reusable drill instructions remains distinct from editing a plan entry's coaching notes.

Serializable transactions wrap copies and content mutations. PostgreSQL and SQLite triggers reject cross-workspace entry references and changing a content row's owning workspace. The database's restrictive drill foreign key blocks deleting referenced drills. The application uses Npgsql directly with the configured database role, which may bypass RLS; membership checks therefore live in the backend. The private `hockey` schema remains outside Supabase's Data API. No existing Supabase RLS policies are replaced and no anonymous/authenticated Data API grants are added.

## Migration from visibility-based sharing

PostgreSQL uses the reviewed EF migration `IndependentWorkspaceCopies`. Hosted startup never migrates. Run it through the existing release pipeline during maintenance, with a backup and after reviewing the generated SQL. Do not deploy old application code against the migrated database: the visibility column and old sharing endpoints are retired. The migration has no automatic Down path because copies cannot be safely merged back.

SQLite performs the equivalent transactional upgrade through its existing local initializer. Back up the local database before the first start of this source. It keeps the existing tag/catalog upgrades and all saved data; no example content is inserted.

The migration:

1. Preserves team original IDs and ownership. Previously shared team records become private team originals.
2. Creates organisation-library copies of previously organisation-shared team drills and plans. Library plan entries refer to library drill copies.
3. Repairs existing cross-workspace references by cloning accessible drills into the plan's workspace and replacing the reference; existing plan IDs, entry order, durations, notes, drawings, and metadata remain intact.
4. Reuses one migration-created drill per source/destination workspace while repairing the old graph. This is a one-time migration rule, not the runtime copy policy.
5. Uses deterministic IDs for migration-created rows and one transaction plus the EF migration history (or SQLite upgrade marker). A failed attempt rolls back; retries/restarts do not duplicate content. A deterministic ID collision stops the transaction for review rather than overwriting content.
6. Adds database reference guards after the data is repaired and removes the old visibility column/indexes.

Migration preflight refuses missing/cross-organisation references, unknown ownership/visibility, a legacy organisation-owned row marked private, or a private drill whose audience does not cover the existing plan. For example, a shared plan referencing a private drill, or Team B's plan referencing Team A's private drill, cannot be cloned automatically without widening access. The migration stops before changing content. An operator must inspect the old rows during maintenance with the relevant owners and explicitly correct the relationship or confirm the intended old sharing setting, then rerun. Do not assign ambiguous content to an arbitrary team or publish it automatically.

Existing organisation/team memberships are preserved. Review team memberships before release: organisation administrator status alone no longer grants access to private team content. `LEGACY_WORKSPACE_ADMIN_USER_ID`, when configured, explicitly bootstraps the designated user's membership in the preserved legacy organisation and editor access to its legacy team. If that setting was previously cleared, an existing administrator can add the appropriate team membership through Manage organisation. Other memberships require explicit assignment.

No production operations or deployments are part of preparing this change. The existing deployment workflow applies pending reviewed EF migrations while the app is stopped and then runs readiness checks; a separate database initialisation run is unnecessary for an existing environment.

The subsequent `AccountDefaultsAndContentAges` migration adds user default-team preferences and multiple content ages. The legacy age field is retained for compatibility and backfilled into an array. No content reset is included in a hosted migration; the explicitly requested local reset is separate.
