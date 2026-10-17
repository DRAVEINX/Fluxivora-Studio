# Testresultaten — Fluxivora Studio 0.5.0-alpha.22

Controles uitgevoerd op 17 oktober 2026.

- `npm test`: **63 tests geslaagd, 0 mislukt**.
- `npm run check`: **geslaagd** voor Electron main, preload, app en core.
- Nieuwe functie: Ctrl/Cmd + plus of `=` zoomt in, Ctrl/Cmd + min zoomt uit en Ctrl/Cmd + 0 past het canvas aan het beschikbare scherm aan.
- Zoomsneltoetsen zijn uitgeschakeld wanneer een invoerveld, tekstgebied, contenteditable-gebied of keuzelijst actief is.
- Objecten kunnen nauwkeurig worden verplaatst met pijltjestoetsen (1 px) en Shift + pijltjestoetsen (10 px), inclusief Bézier-ankers en handgrepen; vergrendelde objecten worden beschermd.
- Ctrl/Cmd + muiswiel zoomt rond de muiscursor; normaal muiswiel-scrollen blijft beschikbaar.
- Canvas pannen blijft beschikbaar met Spatie + linkermuisknop-slepen of middelste muisknop.
- Windows CI- en releaseworkflows proberen de officiële npm-registry en daarna een alternatieve npm-mirror, met twee pogingen per registry en begrensde npm-retries/time-outs.

## Nog niet geverifieerd

- Windows-installer: **niet gebouwd** in deze omgeving.
- Windows-runtime: niet getest op een echte Windows-pc.
- GitHub Actions: niet uitgevoerd vanuit deze omgeving.
- Een eerdere lokale npm-registrycontrole faalde met `EAI_AGAIN` bij `registry.npmjs.org`. Dat wijst op een DNS/netwerkprobleem in die uitvoeromgeving en bewijst niet dat GitHub Actions hetzelfde probleem zal hebben.

Een groene lokale testsuite bevestigt niet dat de Windows-installer al bestaat of dat de app op een echte Windows-pc is gevalideerd.
