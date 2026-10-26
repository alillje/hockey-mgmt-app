# Organisation and team content

Use the organisation/team selectors to choose a workspace. **Drills** and **Practices** combine team and club content with source checkboxes; the current/default team is checked initially, and club content can be included explicitly. Ownership badges distinguish the sources. Source, age, category, and search filters persist in the URL.

Team editors create, edit, and delete their team's content; team viewers may read it. Organisation administrators manage every team, its content, and regular memberships within their organisation, without separate team membership. **Manage organisation** creates teams, adds access using existing Supabase Auth user IDs, changes team roles, and removes team or organisation access. Removing organisation access removes its team memberships atomically, clears an affected default team, and preserves saved content. Organisation administrators cannot change administrator accounts; the platform administrator controls those roles. Supabase user provisioning remains a separate dashboard action; application email invitations are deferred.

**Copy to organisation library** contributes an independent copy while leaving the source private. **Copy to my team** imports library content. Copying a plan always includes copies of its drills. Plans never reference drills in another workspace. See [independent workspace copies](independent-copies.md) for full copy, security, and migration rules.

Admins may choose **Available to all teams** in the team selector to create/manage content directly in the organisation library. Other members can browse it and select an editable team before copying. Content ownership and authorised editing controls are displayed on cards and in the editor.

Auth users must exist in Supabase first. An authenticated user without memberships sees a no-access page and can still open Account to log out. Only the platform administrator may create organisations and appoint organisation administrators. This uses the existing `LEGACY_WORKSPACE_ADMIN_USER_ID` setting (local `Workspace:LegacyAdminUserId`); unset configuration denies those actions in authenticated mode. Browser drafts remain scoped to the selected organisation/team. Membership changes take effect on subsequent API requests even with an existing sign-in token. See the migration guide before upgrading existing hosted content.

Age groups come from the database catalog: U8–U16, U18, U19, U20, Senior. New writes use fixed choices; existing legacy metadata is preserved. Local SQLite persists across restarts and starts empty. Hosted PostgreSQL migrations are reviewed/applied separately and never run at application startup.

Set a persistent default team under Account; the only accessible team is automatically the default. Content age checkboxes support several levels, and Select all stores all catalog IDs individually. Teams have names without an age-group setting. New content starts without selected ages; older content retains its selections. Legacy team-age storage remains unused for database compatibility.

Authenticated local databases can remain completely empty of organisations and teams. The local content reset on 2026-10-25 preserved Supabase users and the reference age catalog and saved a SQLite backup before deleting the requested local content.
