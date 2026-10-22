---
name: hockey-development
description: Extend this repository's hockey drill editor, drill library, training sessions, and shared C# and React API. Use for changes to hockey planning workflows and their project conventions.
---

# Hockey development

Read the repository `AGENTS.md` and `docs/api-contract.md` before changing a shared workflow.

Represent saved diagrams as versioned data in rink coordinates, independent of browser pixels. Preserve editing and PDF rendering consistency when adding equipment or movement paths. Pointer movement must not create one undo entry per frame.

Render equipment once and reuse it for editing, practice previews, and PDF export. A puck pile is one movable object; a small tire is half the regular tire's linear size. Goals use 90° rotation steps while other objects use 45° steps. Player color variants use the existing player type and its color property.

A drill is reusable library content with multiple tags selected from the fixed API catalog. Do not introduce custom tag creation. Tag folders are filtered views of the same item, not copies. Practices have their own editable tags; a training is an ordered list of drill references with its own durations and notes. Keep existing training references intact when editing drills; do not silently delete a referenced drill. Show the same rink diagrams in practice previews that are used in the drill editor and PDF export.

Use real browser routes for Home, Drills, Practices, folder views, and editors. Preserve search/filter context through browser Back. Creating a drill inside a practice must preserve the parent practice draft and add the newly saved drill exactly once when returning. Unsaved practice data must survive cancelling the nested drill workflow.

Upgrade existing SQLite schemas without resetting data. The legacy drill category remains API-compatible metadata; tag folders use the tags array. Existing practice tags are backfilled from their drill tags only during the legacy schema upgrade; later edits remain independent. The static-tag upgrade normalizes catalog labels, removes duplicates, and maps unsupported legacy tags to Other while preserving diagrams, notes, and practice entries.

Controllers translate HTTP requests and responses; services own behavior and validation; repositories own database access. Frontend transport types mirror the documented camelCase wire contract. Make an API change on both sides together.

For this POC, use a local SQLite database and no authentication. Do not add team permissions, public hosting, or authentication until the user revisits that scope.

Update the README for changed setup or controls, the TODO checklist for completed work, and the changelog for user-visible behavior. Test the observable workflow affected by the change, including persistence or export when relevant.
