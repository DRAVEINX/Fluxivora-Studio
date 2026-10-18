# Motion FX — product and implementation roadmap

Motion FX is the planned original motion-graphics and compositing workspace inside Fluxivora Studio. It should feel familiar to users of professional node/layer-based compositing tools without copying Adobe After Effects branding, artwork, proprietary assets, or promising exact feature parity.

## Working foundation already in the repository
- Motion Studio timeline with multiple video/audio/title tracks, clip trim/split/ripple delete, markers, snapping and timeline zoom.
- Clip transforms (position, scale, opacity), fades, text/title layers, keyframes and easing, including editable Bézier handles.
- Effect stack with enable/disable, reorder and remove actions; exposure/contrast/saturation/temperature/tint controls; LUT support where the runtime supports it.
- Preview compositing, offline MP4 render path, WebM export, proxy generation/relinking, multicam grouping and basic scopes.
- Recent extension: invert, hue shift, brightness and high-contrast effects are now available in the clip effect selector and are included in project-file validation.

## Motion FX delivery phases

### Phase 1 — reliable compositing foundations
- Dedicated Motion FX entry and project preset (resolution, frame rate, duration, background and pixel aspect ratio).
- Layer/timeline model with explicit transform, anchor point, rotation, scale, opacity, blend mode and parent relationships.
- Effect stack with stable ordering, enable/disable, duplicate, reset and per-effect parameters.
- Keyframeable transform and effect parameters with linear, hold, eased and Bézier interpolation.
- Save/reopen and undo/redo regression tests for every editable property.

### Phase 2 — motion graphics
- Shape layers (rectangle, ellipse, polygon, star, path), editable fill/stroke, gradients and stroke animation.
- Text layers with font, size, tracking, line spacing, alignment, fill/stroke and background.
- Masks: add/subtract/intersect modes, feather, expansion and animated mask paths.
- Parenting, null/controller layers, anchor-point editing and motion-path handles.
- Precompositions/nested compositions and reusable presets.

### Phase 3 — visual effects
- Practical color correction, blur/sharpen, glow, drop shadow, vignette, noise/grain, chromatic aberration and keying.
- Per-effect parameters and keyframes; effects must be rendered consistently in preview and export.
- Blend modes and alpha/matte compositing with explicit alpha handling.
- Optional GPU acceleration with safe CPU fallback and clear capability reporting.

### Phase 4 — professional workflow
- Graph/editor for animation curves, work area, loop playback and timeline markers.
- Render queue with presets, progress, cancellation, failure recovery and export logs.
- Media relinking, proxies, cache cleanup, missing-font/media warnings and project recovery.
- Performance testing for long compositions, large media and memory pressure.

### Phase 5 — validation and packaging
- Golden-frame and rendered-output tests for transforms, masks, effects, alpha, audio sync and frame-rate handling.
- Project migration tests and fixtures from older saved formats.
- Windows packaging and real-machine acceptance tests before declaring a release ready.

## Completion policy
A control is not considered complete merely because it appears in the UI. Each feature needs persisted project data, working preview, matching export behaviour, undo/redo where applicable, and regression coverage. Any unsupported or runtime-limited feature must be labelled honestly. This is an incremental project; no claim of exact Adobe After Effects parity is made.
