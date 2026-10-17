# Testresultaten — Fluxivora Studio 0.5.0-alpha.26

Controles bijgewerkt op 17 oktober 2026.

- De suite bevat regressietests voor bounded undo/redo, drag-gedrag, projectnaamwijzigingen, afbeeldingsinvoeging en selectiebehoud na undo/redo; de actuele testuitkomst staat in [GitHub Actions](https://github.com/DRAVEINX/Fluxivora-Studio/actions).
- Extra Windows-regressiecontrole: opslagacties naar hetzelfde doelbestand worden geserialiseerd wanneer meerdere schrijfacties tegelijk binnenkomen.
- De Windows-workflow voert JavaScript-syntaxcontroles, unit- en UI-contracttests, installerbouw, checksumverificatie en artifact-upload uit.
- De opslaghelper gebruikt UUID-gebaseerde tijdelijke bestanden zodat gelijktijdige schrijfacties niet dezelfde tijdelijke bestandsnaam gebruiken.
- Tests dekken veilige projectbestandsnamen, project-JSON-validatie, atomische bestandsschrijfacties, foutopruiming, projectroundtrip en bescherming van niet-opgeslagen werk.
- Electron vraagt vóór het sluiten om een laatste herstelkopie. Als de renderer niet antwoordt, sluit het venster na maximaal 3,5 seconden alsnog.

## Nog niet geverifieerd

- Alpha.25 is door de gebruiker op een Windows-pc bevestigd als werkend; alpha.26 heeft nog een aparte praktijktest op de pc nodig.
- De echte eind-tot-eindstroom — opslaan via de Windows-bestandsdialoog, afsluiten, opnieuw openen en een herstelkopie terugzetten — is nog niet onafhankelijk handmatig bevestigd.
- De tests bewijzen niet dat elk abrupt stroomverlies of geforceerd beëindigen van Windows alle wijzigingen bewaart; de herstelkopie wordt lokaal geschreven en periodiek bijgewerkt.

Een groene test-suite bevestigt de codecontroles, niet de volledige praktijktest op een Windows-pc.
