# Windows-build — Fluxivora Studio 0.5.0-alpha.22

## Lokaal bouwen

Vereisten: Windows 10/11 x64, Node.js 24 en internettoegang om Electron en de buildafhankelijkheden op te halen.

```powershell
npm install
npm run check
npm test
npm run dist:win
```

Verwacht resultaat: `release/Fluxivora-Studio-Setup-0.5.0-alpha.22.exe`.

## GitHub Actions

De workflow `.github/workflows/windows-build.yml` start bij pushes en pull requests naar `main`/`master` en kan ook handmatig worden gestart via **Actions → Fluxivora Studio — Windows CI → Run workflow**. Na een geslaagde run vind je het installatiebestand onder **Artifacts**. De workflow controleert dat er een niet-leeg `.exe`-bestand bestaat en maakt `SHA256SUMS.txt` aan.

De releaseworkflow bouwt alleen wanneer een `v*`-tag wordt gepusht en controleert dat de tagversie exact overeenkomt met `package.json`. Een release wordt als prerelease gepubliceerd.

## Installatieprobleem met npm

De Windows-workflows proberen eerst de officiële npm-registry (`registry.npmjs.org`) en schakelen bij mislukte pogingen over op `registry.npmmirror.com`. Per registry worden maximaal twee installatiepogingen gedaan, met npm-retries en time-outs. Dit kan een tijdelijke storing opvangen, maar omzeilt geen netwerk dat beide registries blokkeert. Controleer bij fouten de volledige npm-uitvoer in GitHub Actions.

## Pannen van het canvas

Houd **Spatie** ingedrukt en sleep met de linkermuisknop om het zichtbare canvas te verschuiven. Als alternatief werkt slepen met de middelste muisknop. Dit verplaatst de weergave, niet de objecten in het ontwerp.

## Belangrijke releasecontrole

Groene unit- en syntaxiscontroles bewijzen niet dat de installer of de geïnstalleerde app op een echte Windows-machine werkt. Voer na de build expliciet installatie, starten via Startmenu/bureaublad, openen en opslaan van `.fluxivora`, PNG/SVG/PDF-export, upgrade en verwijderen uit. In deze ontwikkelomgeving zijn de Windows-installer en Windows-runtime niet gevalideerd.
