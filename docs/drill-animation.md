# Optional drill animation and GIF export

The normal drill page stays a static drawing. Animation is optional, never autoplays and is configured only when a coach wants it.

## Set up an animation

1. Place the players and coaches in the drill drawing.
2. Expand **Animation** below the drawing controls, then select a marker directly on the animation rink. Marker labels help identify players, coaches and pucks while editing.
3. Choose a movement and drag across the ice. Each gesture creates a route and adds the next action. For a pass or shot with a player or coach, the puck moves while the passer or shooter stays in place. Start the drag on the player or coach who should make the move. Pass, Shot and Skate with puck use the closest puck at their feet or place one there when you finish drawing. To move a loose puck by itself, select it first.
4. **Preview animation** is open by default; press Play to start it. Expand **Adjust animation** to change timing, reorder movements or use an existing route. Passes and shots start at 0.5 seconds.
5. Save the drill. Drawing an animation route and placing its puck is one undoable edit.

The animation rink shows where markers finish after the current sequence so the next route can start there. Undo and Redo are available beside the animation drawing controls. Actions run in order. Each lasts 0.5–10 seconds, with up to 24 actions and 30 seconds total. Players, coaches and individual pucks can take part. Puck piles and other equipment stay fixed.

Deleting a marker, puck or route used by an action is blocked with an explanation. Remove or update the affected actions first. Removing the animation preserves the drawing.

## View and share

- Saved animated drills have a discreet **View animation** action below the rink. Read-only practice drill previews expose the same action.
- It opens a separate dialog with playback controls and optional full-screen viewing. It starts paused, and pauses if the browser tab becomes hidden.
- **Export GIF** generates a looping 800 × 440 file on the device, at approximately 12 frames per second, with brief holds at the start and end. The file includes the drill name and rink.
- Generation shows progress, supports cancellation and stops when the dialog closes. **Preview GIF** displays the generated animation only after clicking it; **Save GIF** downloads the file.
- No GIF is uploaded or saved to application storage. Temporary image URLs and generated-file URLs are released when their work or viewing session ends. A downloaded GIF is a standalone file the user may share.
- PDFs continue to show the original static drawing and notes.

## Implementation boundaries

`frontend/src/features/animation` separates the action editor, compatibility rules, pure timeline evaluation, playback clock, viewing dialog, frame rasterisation and GIF encoding. Playback and export evaluate the same timeline, using distance along the drawn route for consistent speed. Animated positions are derived; saved object positions and paths are never mutated during playback.

Setup, viewing and GIF dependencies load on demand. Encoding uses the pinned MIT-licensed [gifenc](https://github.com/mattdesl/gifenc) package. Its browser-distributed license is included at `/licenses/gifenc.txt`. Work yields between frames to keep cancellation/navigation usable. Frame count and resolution are bounded for mobile devices; no worker or external script exception is added to CSP.

The backend's `AnimationValidator` validates only animation semantics; the existing diagram validator, application services and controllers retain their responsibilities. Invalid animations cannot bypass ownership/membership checks. Copying a drill or a complete practice copies the diagram JSON, preserving animation bindings inside the independent copy.

## Compatibility and release

Animation is optional versioned metadata in the existing diagram JSON. Existing static diagrams stay valid and unchanged. No database migration, new secrets, Supabase changes or infrastructure deployment is needed. Release the combined app through the normal stage/prod workflow and reload old editor tabs before editing animation-enabled drills. Older application versions can render the static drawing but may omit animation when saving it.

## Validation

Unit tests cover distance-based movement, seeking, puck carrying, passing, source immutability and client validation. Backend tests cover save/restart/removal, invalid data, independent copies and authorization. Browser tests cover collapsed setup, explicit playback, seeking, GIF download/decoding, mobile layout, cancellation, practice viewing and referenced-element deletion. The published-app security suite checks playback, rasterisation and GIF preview under the existing enforced CSP.
