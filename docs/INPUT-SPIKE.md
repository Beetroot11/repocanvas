# Pencil and touch physical acceptance checklist

Browser automation verifies general pointer behavior but cannot prove simultaneous Apple Pencil and finger handling. Complete this checklist on each supported iPad/Safari combination.

Record the iPad model, Pencil model, iPadOS version, Safari version, orientation, and whether the page was installed as a PWA.

## Setup

1. Open the example over HTTPS on the physical device.
2. Create an empty board and enter fullscreen.
3. Confirm page zoom is at 100% and no assistive touch mode changes pointer behavior.

## Pencil

- Pencil contact switches to freehand and produces a continuous stroke.
- Pressure/tilt behavior feels natural where the engine supports it.
- Lifting the Pencil ends the stroke without an extra mark.
- Palm contact does not create a shape or unexpectedly pan.

## Touch

- One-finger touch while freehand is selected changes to selection/manipulation rather than drawing.
- Pinch zoom remains smooth and does not leave stray points.
- Two-finger pan does not select or move a shape accidentally.
- Toolbar controls remain reachable in portrait and landscape, including safe areas.

## Concurrent interaction

- Draw with Pencil while another finger pans the canvas.
- Draw with Pencil while two fingers pinch zoom.
- Repeat slowly and rapidly near canvas edges and toolbar islands.
- Lock the screen, unlock, return to Safari, and repeat.
- Background and restore the tab during dirty work; confirm the recovery journal restores it if a save was interrupted.

## Persistence and recovery

- Disable connectivity while drawing and confirm Offline appears without losing edits.
- Restore connectivity and confirm saving resumes.
- Open the same board in another tab, create a revision conflict, then test Save as copy and Export recovery.

Treat Pencil-plus-touch as supported only after every concurrent-interaction item passes on the device/browser versions you publish.
