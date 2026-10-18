# Fluxivora Studio — Beta 9 status and acceptance plan

## Branch safety
- Work is isolated on `feature/beta9-proxy-workflow-multicam`.
- Keep `main` untouched.
- Do not merge the feature branch as part of routine CI cleanup.

## Confirmed status
- The latest Windows CI run passed: https://github.com/DRAVEINX/Fluxivora-Studio/actions/runs/39107975474
- The run produced the `Fluxivora-Studio-Windows-Setup` artifact.
- The user confirmed that the Windows installer works.
- Multicam sync analysis now has a bounded local FFmpeg audio-decoding route for video containers, with a browser Web Audio fallback.
- Sync estimation remains proposal-only: users must explicitly accept suggested offsets; analysis must not silently mutate project timing.
- Older failed runs remain in GitHub history. Evaluate the newest run for the corrected commit rather than treating historical failures as current failures.

## Implemented in this branch
1. Local waveform RMS envelope creation and normalized cross-correlation offset estimation.
2. Bounds on input sizes, lag, overlap, and correlation work to avoid excessive synchronous processing.
3. Low-confidence/insufficient-signal results are rejected instead of silently applied.
4. UI flow for analyzing multicam sources and explicitly accepting proposed offsets.
5. Local FFmpeg audio decoding for supported video containers, capped to a bounded analysis window and sample rate.
6. Proxy creation workflow using local FFmpeg, including progress/cancel handling and relinking by unique filename after reopening a project.
7. Automated UI contract coverage for the integration and bounded decoding.

## Remaining manual Windows acceptance checks
The installer working is confirmed, but these media workflows still need a real project/media test before Beta 9 can be declared fully accepted:
- Create proxies for at least two source clips; verify progress and cancellation.
- Close and reopen the project; verify proxies relink and missing proxies are handled safely.
- Analyze two clips with a known audio offset; inspect the proposed offset before accepting it.
- Verify low-confidence/silent audio does not apply a false offset.
- Verify accepting a proposal changes the expected clip offset, and cancel/reject leaves the project unchanged.
- Confirm original media files are never overwritten and the normal export path remains usable.

## Release/version follow-up
- Check that the displayed application version and package version are intentionally aligned with the Beta 9 release before publishing a public release. Do not publish or tag a release until this is verified.

## Completion gate
Beta 9 is ready for release only after the remaining manual media checks pass, version metadata is verified, and the latest CI for the exact candidate commit is green. Keep the branch separate from `main` until explicitly authorized to merge.
