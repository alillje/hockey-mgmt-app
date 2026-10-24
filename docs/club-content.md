# Club libraries and team-owned content

Drills and practice plans belong to an organisation and either a team or the organisation itself. Organisation admins manage their organisation's content; team editors manage their own team's content, and team viewers can view/use it. Membership is stored by the API and uses the verified Supabase user UUID. A browser selection or user-editable Supabase metadata never grants permissions.

Select an **Organisation** and **Team** above the page content. Drills and Practices show content owned by that team. **Club library** shows organisation-owned and organisation-shared content. Filter it by drills/practice plans, age group, category, originating team, or search. Ownership and visibility are shown on cards and in the content view. Shared content can be used directly in practice plans, viewed/exported, or copied into an editable team. View-only users do not receive editing controls.

Admins can select **Organisation-owned content** in the team selector to create, edit, and delete club-owned drills/plans. **Manage organisation** creates teams and adds member access using an existing Supabase Auth user ID. Inviting users to Supabase remains a dashboard action. The membership screen adds or promotes access; removing/demoting memberships and moving/removing teams are deliberately not provided by this slice, because those changes need their own dependency checks.

## Fixed age groups

The age-group dropdowns use the private `hockey.AgeGroups` reference table through `/api/catalog`, ordered numerically: **U8, U9, U10, U11, U12, U13, U14, U15, U16, U18, U19, U20, Senior**. U19 supports the women's junior level alongside U18/U20. These are training metadata, not birth-year or competition-eligibility calculations; see the [Swedish federation junior series](https://www.swejuniorhockey.se/om_serierna).

An empty age group means all ages/unspecified. Teams, drills, and practices use these fixed choices, and the API validates against the database. Supported team levels become defaults for new content. Prior free-text values remain displayed as previous values and can be saved unchanged; they cannot be assigned to new content. Club-library filters also retain those prior values so saved content stays discoverable. The catalog has no editor for adding arbitrary levels.

The SQLite upgrade creates reference data additively; PostgreSQL uses the separate `AgeGroupCatalog` migration. Neither resets age-group metadata or creates example drills/plans.

## Reuse, ownership, and practice entries

A practice is an ordered list of live drill references with duration and practice-specific coaching notes per entry. The same drill may appear more than once. Editing entry notes never changes the reusable drill instructions. **Edit reusable drill** opens its separate editor when authorised. Diagrams remain consistent across the drill editor, practice previews, and PDF exports.

**Share with club** changes visibility without transferring ownership or giving other teams editing rights. Sharing one drill never shares any practices that use it. Sharing a plan first lists its private drills, then requires explicit confirmation to share them. Every required drill must be shareable by the requesting user. Permissions, current timestamps, and the dependency list are checked again within one transaction; failures leave all visibility unchanged.

**Copy to my team** creates a new independent resource with team-only visibility. A drill copy keeps its diagram, notes/instructions, age group, and categories. A practice copy keeps its ordering, durations, notes, and existing shared drill references. The copy retains originating-team attribution, while its owner becomes the selected team. Source-plan edits never change the copied plan; shared drill edits remain live until that individual drill is copied and replaced.

**Copy drill for this practice** replaces one entry with an independent team drill copy and preserves that entry's duration and coaching notes. A saved, unchanged plan uses an atomic API action. For a draft, the copy is saved independently and the replacement stays in the practice draft until saved. A shared plan must first become team-only before receiving a private drill copy. Other occurrences of the source drill are left alone.

Deleting a drill is blocked while any plan references it. Making a drill private is blocked while a shared or other-team plan needs it. Dependency messages do not reveal private plan titles or contents. Unsharing/deleting a plan does not unshare/delete its drills or independent copies. Writes use serializable database transactions so checks and mutations are not separated by a race; a conflicting transaction must reload/retry.

## Existing data and environment setup

New content databases remain empty of drills and plans. Only the local workspace/team metadata is created to keep the unauthenticated local POC usable. Existing SQLite IDs, diagrams, categories, timestamps, notes, ordered entries, and explicit empty category arrays are preserved by the additive upgrade.

Hosted PostgreSQL requires the new EF migration **before** deploying this application. Review the generated migration/SQL and use the existing maintenance-window deployment workflow. The API never migrates or seeds PostgreSQL on startup. After teams start using this schema, do not roll back to an earlier application without ownership checks; keep the app stopped until a compatible release is available. Application tables and memberships stay in the private `hockey` schema, outside Supabase's exposed public schema.

Existing pre-team hosted content is assigned to a preserved **Legacy workspace / Local team**, with no automatic access for ordinary Supabase users. To adopt that content:

1. Choose an existing Supabase user as its administrator and obtain their Auth user UUID.
2. Set the environment's GitHub variable `LEGACY_WORKSPACE_ADMIN_USER_ID` to that UUID. It is an identifier, not a password/token. Bicep passes it as `Workspace__LegacyAdminUserId`; leave it empty for a fresh club.
3. Review/apply environment infrastructure, then release the reviewed application/migration through the normal workflow. On that configured user's first workspace request, the API adds their persistent admin membership to the legacy workspace. It never grants legacy access to the first visitor.
4. Add other members and teams through **Manage organisation**. The configured bootstrap value may be cleared after membership is established; the stored membership remains.

An authenticated user with no memberships can create a new empty organisation and become its administrator. That new organisation cannot see or adopt another organisation's saved data. Each selected organisation/team has separate browser drafts. Local unauthenticated mode is development-only and uses the local administrator identity.

No hosted migration, membership changes, infrastructure deployment, or app release is performed merely by changing these files. Verify the new migration and the intended legacy administrator separately in stage before updating the production evaluation.
