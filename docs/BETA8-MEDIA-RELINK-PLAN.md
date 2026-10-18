# Fluxivora Studio — beta.8 engineering plan

This branch continues from 0.5.0-beta.7. Keep Pixel Lab, Vector Forge and Page Studio unchanged; all changes in this phase are scoped to Motion Studio and its tests.

## 1. Project media relinking (first priority)
- Persist a stable media manifest for each source asset: asset ID, original filename, media type, duration and optional proxy filename.
- On reopening a montage, show a clear missing-media summary and offer a multi-file relink workflow.
- Match files conservatively by type and filename; where ambiguous, ask the user instead of silently attaching the wrong source.
- Rebuild object URLs and refresh the preview only after the user confirms a match.
- Preserve old project compatibility and retain proxy names; never overwrite source media or generated proxies.

## 2. Proxy lifecycle
- Keep proxy files separate from originals and projects.
- Improve relinking of proxy files after reopening; report missing proxies without blocking use of the original source.
- Never export while proxy preview is enabled; retain the existing guard.
- Add regression tests for stale proxy references, ambiguous file matches and original-source fallback.

## 3. Multicam and timecode
- Introduce a tested timecode utility for the current fixed 25 fps sequence, with explicit validation and round-trip tests.
- Add sync-offset helpers and waveform/timecode sync only behind tests; do not silently change existing manually adjusted offsets.
- Design a live multiviewer as a separate UI change after the media workflow is stable.

## 4. Export and stability
- Test invalid/missing audio, source decode failures, cancellation, cleanup of partial MP4 files, and project duration boundaries.
- Keep the current 15-minute offline-render cap explicit until longer exports have measured memory and reliability coverage.
- Add user-facing diagnostics that identify the failed source or export stage without exposing local paths unnecessarily.

## 5. Release acceptance
- CI: syntax checks, unit tests, UI contract tests, FFmpeg encoder smoke test, installer verification and checksum manifest.
- Manual Windows test: install, launch from Start Menu and desktop shortcut, create/open/save a montage, close/reopen it, relink media, preview original/proxy, export a short MP4, cancel a render, and verify that Pixel Lab / Vector Forge / Page Studio still work.
- A green CI build is not a substitute for the manual Windows test.

## Guardrails
- Do not describe this beta as a complete Adobe Premiere Pro replacement.
- Do not remove existing creative workspaces or change their project formats in this phase.
- Do not claim a feature is complete until implementation, automated tests and applicable manual checks pass.
