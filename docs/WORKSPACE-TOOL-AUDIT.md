# Workspace tool audit — 2026-10-18

This audit describes the current repository implementation and separates implemented controls from planned professional features. A listed tool or control is not proof of a complete end-to-end workflow; runtime acceptance still requires tests and a Windows hands-on check.

## Current baseline

### Pixel Lab — photo and raster workspace

Present in the UI/code:
- Selection and object movement.
- Brush, separate pen/path, pixel eraser, line, geometric shapes and text.
- Eyedropper for visible canvas pixels.
- Non-destructive brightness, contrast and saturation adjustments.
- Crop controls with coordinate/size validation and undo support.
- Scaled PNG export (1×/2×/3×) and transparent export options.

Priority gaps:
1. Lasso/free selection and editable masks.
2. Clone/heal retouching tools.
3. Blur/sharpen and a broader non-destructive filter stack.
4. Better brush controls (hardness, spacing, pressure where hardware supports it).
5. Image-focused acceptance tests for adjustment persistence, crop undo and export fidelity.

### Vector Forge — vector illustration

Present in the UI/code:
- Selection, geometric shapes, line, free path, text and image placement.
- Bézier pen, editable anchors/handles, and safe anchor insertion/deletion.
- Fill/stroke, stroke width, opacity, object transforms and layer ordering.
- SVG serialization/export and object eraser that respects locked objects.

Priority gaps:
1. Boolean path operations (union, subtract, intersect, exclude).
2. Grid, guides, snapping and smart alignment.
3. More robust node operations: convert smooth/corner, close/open path and reverse path.
4. SVG import round-trip tests for common paths, text and embedded images.

### Page Studio — layout and publishing

Present in the UI/code:
- Multi-page documents; add, duplicate, navigate and delete pages.
- Text frames, images, vector shapes, free paths and Bézier curves.
- Object alignment, layers, page dimensions and preset paper formats.
- Print-to-PDF workflow with temporary print styles cleaned up afterward.

Priority gaps:
1. Explicit margins, columns, guides and baseline/grid support.
2. Bleed/safe-area settings and page-level guides.
3. PDF preflight (page sizes, out-of-bounds content, missing images and font substitution warnings).
4. More reliable export acceptance tests for multi-page order, scaling and page backgrounds.

### Motion Studio — non-linear video editing

Present in the UI/code:
- Multi-track timeline, clip inspector, markers and keyframe animation.
- Easing including Bézier curves.
- Preview and offline frame-by-frame export path through native FFmpeg.
- Proxy generation and linking; export is blocked while proxy preview is active.
- Native MP4 export path and WebM export option.

Priority gaps:
1. Project-aware proxy paths and clear missing-proxy recovery/relink/regenerate controls.
2. Safe resume/cancel behaviour and stress tests for batch proxy jobs and long clips.
3. Per-clip effect stacks and keyframeable effect parameters.
4. Multicam audio/timecode synchronisation and live multiview.
5. Calibrated colour scopes and documented colour-space/reference-level behaviour.
6. End-to-end export tests covering audio/video sync, cancellation, missing media and proxy/original selection.

## Work order

1. Keep the existing passing CI baseline and add focused regression coverage before each change.
2. Implement the highest-risk reliability work first: Motion Studio proxy recovery and export regression tests.
3. Add Vector Forge path operations and guides without changing existing SVG serialization.
4. Add Page Studio preflight and page guides before adding more print controls.
5. Extend Pixel Lab with non-destructive retouching/masks only after the image-edit history model can undo them correctly.
6. Run CI and the Windows installer build after every change. A green CI build does not replace manual checks for drawing, saving/reopening projects, and PNG/SVG/PDF/MP4 output.

## Acceptance rule

Do not mark a feature complete because a button exists. It must be wired to a real operation, preserve undo/redo and project persistence where applicable, handle invalid input safely, and have a regression test. Windows-specific media/print behaviour also needs a practical smoke test.
