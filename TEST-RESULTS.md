# Testresultaten — Fluxivora Studio 0.5.0-alpha.24

Controles bijgewerkt op 17 oktober 2026.

- De suite is uitgebreid met history-manager- en drag-regressietests; de actuele testuitkomst wordt bevestigd door de [GitHub Actions-runs](https://github.com/DRAVEINX/Fluxivora-Studio/actions).
- `npm run check`: de alpha.24-run controleert Electron main, preload, app en core.
- De opslaghelper gebruikt UUID-gebaseerde tijdelijke bestanden zodat gelijktijdige schrijfacties niet dezelfde tijdelijke bestandsnaam gebruiken.
- Tests dekken veilige projectbestandsnamen, project-JSON-validatie, atomische bestandsschrijfacties, foutopruiming, projectroundtrip en bescherming van niet-opgeslagen werk.
- Electron vraagt vóór het sluiten om een laatste herstelkopie. Als de renderer niet antwoordt, sluit het venster na maximaal 3,5 seconden alsnog.

## Nog niet geverifieerd

- De installatie en runtime van de alpha.24-installer op een fysieke Windows 10/11-pc moeten nog handmatig worden getest.
- De echte eind-tot-eindstroom — opslaan via de Windows-bestandsdialoog, afsluiten, opnieuw openen en een herstelkopie terugzetten — is nog niet onafhankelijk handmatig bevestigd.
- De tests bewijzen niet dat elk abrupt stroomverlies of geforceerd beëindigen van Windows alle wijzigingen bewaart; de herstelkopie wordt lokaal geschreven en periodiek bijgewerkt.

Een groene test-suite bevestigt de codecontroles, niet de volledige praktijktest op een Windows-pc.
