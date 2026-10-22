---
name: hockey-development
description: Extend this repository's hockey drill editor, drill library, training sessions, and shared C# and React API. Use for changes to hockey planning workflows and their project conventions.
---

# Hockey development

Read the repository `AGENTS.md` and `docs/api-contract.md` before changing a shared workflow.

Represent saved diagrams as versioned data in rink coordinates, independent of browser pixels. Preserve editing and PDF rendering consistency when adding equipment or movement paths. Pointer movement must not create one undo entry per frame.

A drill is reusable library content with one primary category. A training is an ordered list of drill references with its own durations and notes. Keep existing training references intact when editing drills; do not silently delete a referenced drill.

Controllers translate HTTP requests and responses; services own behavior and validation; repositories own database access. Frontend transport types mirror the documented camelCase wire contract. Make an API change on both sides together.

For this POC, use a local SQLite database and no authentication. Do not add team permissions, public hosting, or authentication until the user revisits that scope.

Update the README for changed setup or controls, the TODO checklist for completed work, and the changelog for user-visible behavior. Test the observable workflow affected by the change, including persistence or export when relevant.
