# Testresultaten — Fluxivora Studio 0.5.0-beta.7

Controles bijgewerkt op 17 oktober 2026.

- De beta.1-testkandidaat behoudt de geautomatiseerde regressietests voor undo/redo, slepen, projectnaamwijzigingen, afbeeldingsinvoeging, selectiebehoud en lege geschiedenisstappen; de actuele uitkomst staat in [GitHub Actions](https://github.com/DRAVEINX/Fluxivora-Studio/actions).
- Extra Windows-regressiecontrole: opslagacties naar hetzelfde doelbestand worden geserialiseerd wanneer meerdere schrijfacties tegelijk binnenkomen.
- De Windows-workflow voert JavaScript-syntaxcontroles, unit- en UI-contracttests, installerbouw, checksumverificatie en artifact-upload uit.
- De opslaghelper gebruikt UUID-gebaseerde tijdelijke bestanden zodat gelijktijdige schrijfacties niet dezelfde tijdelijke bestandsnaam gebruiken.
- Tests dekken veilige projectbestandsnamen, project-JSON-validatie, atomische bestandsschrijfacties, foutopruiming, projectroundtrip en bescherming van niet-opgeslagen werk.
- Electron vraagt vóór het sluiten om een laatste herstelkopie. Als de renderer niet antwoordt, sluit het venster na maximaal 3,5 seconden alsnog.

## Motion Studio beta.7 — kubische Bézier-keyframes

- Pure unit tests cover default linear Bezier controls, shaped tangents, bounded control points and validation of untrusted project handle data.
- UI contract tests cover Bezier interpolation selection, visible/draggable in/out handles, shared curve evaluation in preview and offline audio automation, plus project metadata preservation.
- The same shared curve module is used in the browser preview and audio offline mixer. The new CI must run these tests and package the Windows installer before beta.7 can be merged.

## Motion Studio beta.6 — offline MP4-render

- Added pure unit tests for export limits, supported resolutions, safe names, JPEG frame validation, bounded stereo Float32 audio chunks and FFmpeg argument construction.
- Added a native FFmpeg smoke test to verify the shipped binary has libx264 and AAC encoders and can create a real MP4 from two streamed JPEG frames plus stereo Float32 audio through fd 3.
- UI contract tests cover the MP4/WebM controls, cancellation/progress UI, preload APIs, IPC frame/audio streams and bundled FFmpeg packaging settings.
- The native export is capped at 15 minutes and the browser offline audio decoder at 256 MB per source file; undecodable audio inside video files is skipped and reported, while a standalone audio clip decode failure stops export.
- The new branch's CI must complete the encoder smoke test and Windows installer/checksum/artifact workflow before this beta is considered ready to merge.

## Motion Studio beta.5 — nieuwe testscope

- Source monitor playback/scrubbing, media-bin search/filter, in/out selection, insert-at-playhead, source relinking and project migration are covered by UI contract checks.
- Color-grade controls, effect-stack actions, the draggable keyframe curve editor and output-LUT history are wired to project/clip metadata and undo/redo snapshots.
- 3D `.cube` output LUTs are validated and applied to the composed program canvas with a WebGL2 3D texture; LUT data is stored in sequence metadata.
- Proxy contracts cover pre-generated proxy linking/relinking, original-vs-proxy preview switching, persistent proxy filenames and prevention of proxy-quality exports.
- Multicam contracts cover saved angle groups, manual timeline-zero source offsets, split-at-playhead angle cuts, angle source relinking, and independent original-audio playback.
- RGB histogram and luma waveform are derived from a reduced-size copy of the program canvas to limit analysis overhead.
- The source bin records asset metadata only; actual source media remains external and must be relinked after reopening a project.
- Scope accuracy is indicative rather than broadcast-calibrated. WebGL2 support, visual color fidelity across displays, long-duration media, 4K export performance, automatic proxy generation, waveform/timecode-based multicam sync, live multiview monitoring, and final offline MP4/H.264 rendering still require separate implementation and practical validation.

## Nog niet geverifieerd

- De gebruiker heeft bevestigd dat alpha.25, alpha.26 en alpha.27 op diens Windows-pc werken. Beta.1 moet na een groene CI-run op de pc worden getest.
- Openstaande beta-releasecheck: sla een `.fluxivora`-project op, sluit de app, open het bestand opnieuw en controleer de inhoud; exporteer daarnaast PNG, SVG en PDF; controleer vervolgens of een bestaande herstelkopie bij herstart kan worden teruggezet.
- De tests bewijzen niet dat elk abrupt stroomverlies of geforceerd beëindigen van Windows alle wijzigingen bewaart; de herstelkopie wordt lokaal geschreven en periodiek bijgewerkt. Beta.1 is daarom nog een testkandidaat, geen definitieve stabiele release.

Een groene test-suite bevestigt de codecontroles, niet de volledige praktijktest op een Windows-pc.


## Beta.4 — Motion Studio test scope
- Added UI contract tests for multi-track video/audio/title capability, track rendering, source relinking, fades, speed/opacity/scale and undo/redo.
- Added Motion Studio to the JavaScript syntax gate used by Windows CI.
- CI will verify this branch in the pull request; real-world audio codec support, 4K performance and Windows interactive usability still require hands-on testing.
