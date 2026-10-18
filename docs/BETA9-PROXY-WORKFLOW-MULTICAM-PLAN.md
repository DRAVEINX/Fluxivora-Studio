# Fluxivora Studio — beta.9 engineering plan

Beta 8 is reported working in a manual Windows test. Beta 9 continues on a separate feature branch based on the Beta 8 branch; do not alter `main` or merge the Beta 8 PR implicitly.

## Priorities
1. **Multicam waveform sync groundwork:** implement a pure, bounded, local-only correlation helper for already-extracted audio envelopes. Return an offset estimate and confidence; never silently apply low-confidence estimates. Unit tests cover sign convention, constant/invalid input and confidence rejection.
2. **Integration gate:** the helper is not yet wired to decoded source audio or the UI. Before automatic sync can be called complete, add safe envelope extraction, a user-visible preview of the proposed offset, manual accept/cancel, and tests for clips with silence, noise, different durations and false peaks.
3. **Proxy lifecycle:** next implement project-aware proxy metadata, missing-proxy detection after reopen, original-source fallback and explicit regenerate/remove actions. Never overwrite source files or export from proxy preview.
4. **Live multicam viewer:** design a separate multi-angle monitor with explicit active angle selection and bounded simultaneous decoding; do not promise real-time playback until performance checks pass.
5. **Export and acceptance:** preserve frame-accurate MP4/H.264/AAC export guards, cancellation cleanup, 15-minute limit and existing creative workspaces. Test the installer and app manually on Windows after CI.

## Beta 9 scope in this initial commit
- Add the isolated waveform-offset estimator and automated tests.
- Load the helper in the app for a later UI integration step.
- Keep the existing manually adjusted offsets unchanged; this helper never mutates project state.
- Do not claim full automatic multicam sync, live multiview, or complete proxy lifecycle in this phase.
