# Organisation and team content

Use the organisation/team selectors to choose a workspace. **Drills** and **Practices** combine team and club content with source checkboxes; the current/default team is checked initially, and club content can be included explicitly. Ownership badges distinguish the sources. Source, age, category, and search filters persist in the URL.

Team editors create, edit, and delete their team's content; team viewers may read it. Organisation administrators manage library content and memberships. An administrator also needs explicit membership to access a team's private workspace. New team creators receive editor membership. **Manage organisation** adds teams and membership access using existing Supabase Auth user IDs. Supabase invitations remain a separate dashboard action; the membership form adds/promotes access and does not remove/demote it.

**Copy to organisation library** contributes an independent copy while leaving the source private. **Copy to my team** imports library content. Copying a plan always includes copies of its drills. Plans never reference drills in another workspace. See [independent workspace copies](independent-copies.md) for full copy, security, and migration rules.

Admins may choose **Available to all teams** in the team selector to create/manage content directly in the organisation library. Other members can browse it and select an editable team before copying. Content ownership and authorised editing controls are displayed on cards and in the editor.

Auth users must exist in Supabase first. An authenticated user without memberships may create a new empty organisation without gaining access to existing organisations. Browser drafts remain scoped to the selected organisation/team. The explicit `LEGACY_WORKSPACE_ADMIN_USER_ID` setup grants the designated user access to the preserved legacy workspace; see the migration guide before upgrading existing hosted content.

Age groups come from the database catalog: U8–U16, U18, U19, U20, Senior. New writes use fixed choices; existing legacy metadata is preserved. Local SQLite persists across restarts and starts empty. Hosted PostgreSQL migrations are reviewed/applied separately and never run at application startup.

Set a persistent default team under Account; the only accessible team is automatically the default. Content age checkboxes support several levels, and Select all stores all catalog IDs individually. Teams retain a single age-group level.

Authenticated local databases can remain completely empty of organisations and teams. The local content reset on 2026-10-25 preserved Supabase users and the reference age catalog and saved a SQLite backup before deleting the requested local content.
