# Practice blocks

A practice is a sequence of blocks. A block contains one or more drills that run at the same time and has one shared duration. Four drills in a 10-minute block count as 10 planned minutes. A subsequent 15-minute block brings the total to 25 minutes.

## Editing

Add drills normally, then select **Add to previous block** to join a drill and its following block entries to the preceding block. Joining uses the preceding block's duration. Clear the checkbox to start a new block at that drill, retaining the shared duration. Reorder blocks using the first drill's arrows; drills within the block move together. Removing a drill preserves the remaining block boundaries and notes.

Each block has a single **Block duration** input. It can be cleared while typing; leaving it empty records zero minutes. Whole minutes from 0 to 240 are supported. Zero-minute blocks contribute no planned time. Practice-specific notes remain attached to each drill entry, while reusable drill notes and drawings stay on the drill.

Practice views and PDF exports show block order, time ranges and which drills run together. Copies to teams or the club preserve block grouping and shared timing along with all existing content.

## Data and compatibility

The existing ordered practice-entry contract is retained. An additive boolean, `runInParallelWithPrevious`, marks entries that join the previous block. Its database default is false, so all existing practices remain sequential with their original durations, ordering and notes. The backend rejects a parallel first entry and conflicting durations within a block. Ownership and membership checks are unchanged.

SQLite upgrades add the column without dropping tables or resetting content. PostgreSQL uses the generated **PracticeBlocks** EF migration. It only adds a boolean column with a false default; no users, memberships, drills or practice entries are removed or reassigned.

## Release

Review the migration SQL produced by CI, then use the normal stage application release to apply it before deploying the new app. Verify shared timing and duration editing in stage before promoting the package to prod. No infrastructure deployment, new secrets or manual Supabase changes are required.

This is an additive schema/API change, but parallel timing is new behavior: an older app version will count each drill separately and may discard grouping when saving. Do not use old browser tabs to edit practices after upgrading; reload the app. Avoid rolling back to the previous application after grouped practices are in use without reviewing them. Do not run the migration's Down operation on live data without review: it drops grouping information. Existing user sessions and profiles are unaffected.
