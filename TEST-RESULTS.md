# Testresultaten — Fluxivora Studio 0.5.0-alpha.22

Controles uitgevoerd op 17 oktober 2026.

- `npm test`: **70 tests geslaagd, 0 mislukt** in GitHub Actions-run [39057717446](https://github.com/DRAVEINX/Fluxivora-Studio/actions/runs/39057717446).
- `npm run check`: geslaagd voor Electron main, preload, app en core.
- `npm run check`: **geslaagd** voor Electron main, preload, app en core.
- Nieuwe functie: Ctrl/Cmd + plus of `=` zoomt in, Ctrl/Cmd + min zoomt uit en Ctrl/Cmd + 0 past het canvas aan het beschikbare scherm aan.
- Zoomsneltoetsen zijn uitgeschakeld wanneer een invoerveld, tekstgebied, contenteditable-gebied of keuzelijst actief is.
- Objecten kunnen nauwkeurig worden verplaatst met pijltjestoetsen (1 px) en Shift + pijltjestoetsen (10 px), inclusief Bézier-ankers en handgrepen; vergrendelde objecten worden beschermd.
- Ctrl/Cmd + muiswiel zoomt rond de muiscursor; normaal muiswiel-scrollen blijft beschikbaar.
- Canvas pannen blijft beschikbaar met Spatie + linkermuisknop-slepen of middelste muisknop.
- Windows CI- en releaseworkflows proberen de officiële npm-registry en daarna een alternatieve npm-mirror, met twee pogingen per registry en begrensde npm-retries/time-outs.

## Nog niet geverifieerd

- Windows-installer: de GitHub Actions-build voor de nieuwste projectveiligheidswijzigingen werd na de geslaagde teststap gestart; controleer de actuele eindstatus en het artifact in [workflow 39057717446](https://github.com/DRAVEINX/Fluxivora-Studio/actions/runs/39057717446).
- Windows-runtime: moet nog handmatig op een echte Windows 10/11-pc worden getest.
- De JSON-roundtriptest controleert normalisatie en behoud van projectdetails, maar vervangt geen end-to-end test van de Windows-bestandsdialogen, daadwerkelijke schijfopslag en heropenen in de gebouwde app.

Een groene testsuite is geen bewijs van een volledige praktijktest op Windows.
