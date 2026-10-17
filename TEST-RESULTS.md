# Testresultaten — Fluxivora Studio 0.5.0-beta.4

Controles bijgewerkt op 17 oktober 2026.

- De beta.1-testkandidaat behoudt de geautomatiseerde regressietests voor undo/redo, slepen, projectnaamwijzigingen, afbeeldingsinvoeging, selectiebehoud en lege geschiedenisstappen; de actuele uitkomst staat in [GitHub Actions](https://github.com/DRAVEINX/Fluxivora-Studio/actions).
- Extra Windows-regressiecontrole: opslagacties naar hetzelfde doelbestand worden geserialiseerd wanneer meerdere schrijfacties tegelijk binnenkomen.
- De Windows-workflow voert JavaScript-syntaxcontroles, unit- en UI-contracttests, installerbouw, checksumverificatie en artifact-upload uit.
- De opslaghelper gebruikt UUID-gebaseerde tijdelijke bestanden zodat gelijktijdige schrijfacties niet dezelfde tijdelijke bestandsnaam gebruiken.
- Tests dekken veilige projectbestandsnamen, project-JSON-validatie, atomische bestandsschrijfacties, foutopruiming, projectroundtrip en bescherming van niet-opgeslagen werk.
- Electron vraagt vóór het sluiten om een laatste herstelkopie. Als de renderer niet antwoordt, sluit het venster na maximaal 3,5 seconden alsnog.

## Nog niet geverifieerd

- De gebruiker heeft bevestigd dat alpha.25, alpha.26 en alpha.27 op diens Windows-pc werken. Beta.1 moet na een groene CI-run op de pc worden getest.
- Openstaande beta-releasecheck: sla een `.fluxivora`-project op, sluit de app, open het bestand opnieuw en controleer de inhoud; exporteer daarnaast PNG, SVG en PDF; controleer vervolgens of een bestaande herstelkopie bij herstart kan worden teruggezet.
- De tests bewijzen niet dat elk abrupt stroomverlies of geforceerd beëindigen van Windows alle wijzigingen bewaart; de herstelkopie wordt lokaal geschreven en periodiek bijgewerkt. Beta.1 is daarom nog een testkandidaat, geen definitieve stabiele release.

Een groene test-suite bevestigt de codecontroles, niet de volledige praktijktest op een Windows-pc.


## Beta.4 — Motion Studio test scope
- Added UI contract tests for multi-track video/audio/title capability, track rendering, source relinking, fades, speed/opacity/scale and undo/redo.
- Added Motion Studio to the JavaScript syntax gate used by Windows CI.
- CI will verify this branch in the pull request; real-world audio codec support, 4K performance and Windows interactive usability still require hands-on testing.
