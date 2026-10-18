# Fluxivora Studio — Beta 10: proxy recovery and project relinking

## Scope
Beta 10 continues from the user-approved Beta 9 candidate on an isolated feature branch. Preserve the existing Pixel Lab, Vector Forge, Page Studio and Motion Studio workflows. Do not change `main` or merge automatically.

## Goal
Make proxy and source-media recovery clearer and safer when a montage project is reopened or files have moved.

## Work items
1. Audit how project save/reopen serializes source assets and proxy metadata; document what survives a restart and what must be relinked.
2. Add automated regression coverage for assets with missing originals, missing proxies, duplicate basenames, and proxy-preview fallback.
3. Ensure missing or unreadable proxies never silently replace original media in export; preview must safely fall back to the original when possible.
4. Make relinking deterministic: prefer exact stored identity/path metadata when available; never silently link ambiguous same-name candidates.
5. Keep recovery actions non-destructive: never overwrite original media, avoid deleting files on disk, and show actionable status for skipped/failed relinks.
6. Run unit tests, syntax checks, UI-contract tests, and Windows package CI. Verify package/core/visible versions agree at Beta 10.
7. Manual acceptance: create proxies for multiple clips; cancel a batch; close/reopen a project; relink moved originals and proxies; verify ambiguous matches are rejected; export at full quality with proxy preview off.

## Safety and release gates
- Original source files remain untouched.
- Proxy preview must not be used for final export.
- Suggestions and relinking must not silently alter clip timing or project content beyond explicit user actions.
- CI green is necessary but not sufficient; the Windows manual acceptance checklist must pass before Beta 10 is accepted.
- Keep the work on `feature/beta10-proxy-recovery`; no merge, tag, or public release without explicit authorization.
