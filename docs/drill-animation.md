# Optional drill animation and GIF export

The normal drill page stays a static drawing. Animation is optional, never autoplays and is configured only when a coach wants it.

## Set up an animation

1. Place the players and coaches in the drill drawing.
2. Expand **Animation** below the drawing controls, then select a marker directly on the animation rink. Marker labels help identify players, coaches and pucks while editing.
3. Choose a movement and drag across the ice. Each gesture creates a route and adds the next action. For a pass or shot with a player or coach, the puck moves while the passer or shooter stays in place. Start the drag on the player or coach who should make the move. Pass, Shot and Skate with puck use the closest puck at their feet or place one there when you finish drawing. A pass that ends near a single clear receiver transfers possession. That skater keeps the same puck through later skating steps and can pass or shoot it without adding another puck. To move a loose puck by itself, select it first.
4. **Preview animation** is open by default. Press Play to start it and check **Hide all arrows and lines** to hide routes during playback. Expand **Adjust animation** to change timing, reorder movements or use an existing route. Each action has presets for 0.5, 1 and 2 seconds and accepts a custom decimal duration with either a dot or comma. New passes start at 0.75 seconds and shots start at 0.5 seconds.
5. Save the drill. Drawing an animation route and placing its puck is one undoable edit.

The animation rink shows where markers finish after the current sequence so the next route can start there. Undo and Redo are available beside the animation drawing controls. Actions run in order by default. In **Adjust animation**, choose **Same step as previous move** to group moves. Each move keeps its own duration, and the next group starts after the longest move finishes. A player, coach or puck can take part in only one action per group. Each move lasts 0.1–10 seconds, with up to 24 actions and 30 seconds total. Players, coaches and individual pucks can take part. Puck piles and other equipment stay fixed.

To pass between moving players, draw their skating routes first. After drawing the first skater, choose **Draw in this step** beside the animation rink and draw the other skaters. Choose **Start next step** for a move that waits for the current step to finish. The hint below the toolbar shows which step your next route will start in. Open **Pass between players** beside Undo and Redo to add the passes. Existing routes can also be grouped in **Adjust animation**. Start near any skater’s route to choose the first passer, then drag to the catch point on the intended receiver’s route. The dot shows where the puck will be caught. If you miss a route, click the receiver’s route to finish the pass or press Escape to cancel. **Pass arrow** on the main rink only draws an arrow. Playback keeps each release and catch at its drawn point. After the skater returns the puck, start the next pass from another stationary player to use that station’s puck on the same skating route. A late catch can extend the step so the receiver has time to finish at their usual pace. Other skaters slow down on the rest of their routes to finish together where possible. Between consecutive passes, skaters ease into speed changes at each release and catch point. The receiver becomes the carrier for the next pass and keeps the puck when moving into the next step. Pick Quick, Normal or Slow under **Pass speed** for each pass. The time shown also accounts for how long the skater takes to reach the catch point. Remove the last pass to revise it. To run two exchanges at once, draw both skating routes in the same step and start each exchange with its own players and puck. To speed up or slow down an exchange, edit the first action’s **Seconds (scales group)** field. The skaters’ durations change together and the passes keep their release and catch points.

The **Pass between players** button is available once a step has a skating route and another player. Drag to or from an idle player directly. The stationary player holds the puck until it can reach the chosen catch point at the right time.

To pass from a stationary player to a moving skater, draw the receiver’s route first. Choose **Draw in this step**, select the passer and use **Pass**. Finish the drag near the route to snap to a catch point. Playback times the puck to meet the skater there. Finish away from the route to pass into open ice.

Deleting a marker, puck or route used by an action is blocked with an explanation. Remove or update the affected actions first. Removing the animation preserves the drawing.

## View and share

- Saved animated drills have a highlighted **View animation** button next to **Export to PDF**. Read-only practice drill previews expose the same action.
- It opens a separate dialog with playback controls. It starts paused, and pauses if the browser tab becomes hidden.
- Check **Hide all arrows and lines** before exporting to hide all drawn lines, including passes and shots. When routes are shown, pass and shot lines appear only while the puck is in flight. The drawing editor always shows the routes.
- **Export GIF** in the dialog header generates a looping 800 × 440 file on the device, at approximately 12 frames per second, with brief holds at the start and end. The file includes the drill name and rink.
- Generation shows progress, supports cancellation and stops when the dialog closes. **Preview GIF** displays the generated animation only after clicking it; **Save GIF** downloads the file.
- No GIF is uploaded or saved to application storage. Temporary image URLs and generated-file URLs are released when their work or viewing session ends. A downloaded GIF is a standalone file the user may share.
- The saved drill, practice previews and PDFs show the pass arrows as part of the static drawing.

## Implementation boundaries

`frontend/src/features/animation` separates the action editor, compatibility rules, pure timeline evaluation, playback clock, viewing dialog, frame rasterisation and GIF encoding. Playback and export evaluate the same timeline, using distance along the drawn route for consistent speed. Animated positions are derived; saved object positions and paths are never mutated during playback.

Setup, viewing and GIF dependencies load on demand. Encoding uses the pinned MIT-licensed [gifenc](https://github.com/mattdesl/gifenc) package. Its browser-distributed license is included at `/licenses/gifenc.txt`. Work yields between frames to keep cancellation/navigation usable. Frame count and resolution are bounded for mobile devices; no worker or external script exception is added to CSP.

The backend's `AnimationValidator` validates only animation semantics; the existing diagram validator, application services and controllers retain their responsibilities. Invalid animations cannot bypass ownership/membership checks. Copying a drill or a complete practice copies the diagram JSON, preserving animation bindings inside the independent copy.

## Compatibility and release

Animation is optional versioned metadata in the existing diagram JSON. Existing static diagrams stay valid and unchanged. No database migration, new secrets, Supabase changes or infrastructure deployment is needed. Release the combined app through the normal stage/prod workflow and reload old editor tabs before editing animation-enabled drills. Older application versions can render the static drawing but may omit animation when saving it.

## Validation

Unit tests cover distance-based movement, seeking, puck carrying, passing, source immutability and client validation. Backend tests cover save/restart/removal, invalid data, independent copies and authorization. Browser tests cover collapsed setup, explicit playback, seeking, GIF download/decoding, mobile layout, cancellation, practice viewing and referenced-element deletion. The published-app security suite checks playback, rasterisation and GIF preview under the existing enforced CSP.
