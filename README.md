# Fluxivora Studio

**Eén gratis creatieve werkplaats voor beeldbewerking, vectorontwerp en pagina-opmaak.**

Fluxivora Studio is een zelfstandig, local-first Windows-desktopproject van DRAVEINX. Versie 0.5.0-alpha.24 brengt drie werkruimtes samen in één projectbestand:

- **Pixel Lab** — rasterafbeeldingen importeren, vrije penseelstreken en gum, vormen, tekst, basisfilters en PNG-export.
- **Vector Forge** — schaalbare vormen, lijnen, vrije paden, tekst en rasterafbeeldingen; SVG-export.
- **Page Studio** — objecten en tekst plaatsen, meerdere pagina’s toevoegen/dupliceren/verwijderen en via het afdrukvenster naar PDF exporteren.

## Nieuw in 0.5.0-alpha.24
- Gelijktijdige opslagacties naar hetzelfde bestand worden op volgorde uitgevoerd, om concurrerende Windows-bestandsvervangingen te voorkomen.

- Undo/redo gebruikt een geteste geschiedenismanager met maximaal 60 snapshots per richting; een nieuwe bewerking wist de redo-tak.
- Alleen een echte verplaatsing van een object of Bézier-anker maakt een geschiedenisstap. Alleen selecteren vervuilt de geschiedenis niet en markeert het project niet als gewijzigd.
- Reparatie in Vector Forge en Page Studio: slepen initialiseert nu de vorige pointerpositie, zodat objectverplaatsing geen lege pointerreferentie gebruikt.

- Bij het sluiten van het venster vraagt Electron de renderer eerst om de laatste lokale herstelkopie weg te schrijven. De app sluit daarna normaal; een time-out van 3,5 seconden voorkomt dat een vastgelopen renderer het sluiten onbeperkt blokkeert.
- Projectopslag is ondergebracht in `electron/project-store.cjs`, met unieke tijdelijke bestandsnamen, veilige bestandsnaamopschoning, JSON-validatie en atomische vervanging.
- Extra opslagtests controleren bestandsnaamvalidatie, geldige/ongeldige projectdata, gelijktijdige schrijfacties en het opruimen van tijdelijke bestanden bij fouten.
- Een project openen of een nieuw ontwerp maken overschrijft niet langer stilzwijgend niet-opgeslagen wijzigingen.
- De project-roundtriptests controleren behoud van inhoud uit Pixel Lab, Vector Forge en Page Studio.

## Nieuw in 0.5.0-alpha.22

- Project openen en een nieuw ontwerp beginnen beschermen niet-opgeslagen werk: eerst opslaan of annuleren.
- Zoom met Ctrl/Cmd + `+` of `=` en Ctrl/Cmd + `-`; Ctrl/Cmd + `0` past het canvas aan het beschikbare scherm aan. Deze sneltoetsen respecteren actieve tekstvelden en keuzelijsten.
- Verplaats geselecteerde objecten met de pijltjestoetsen (1 px) of Shift + pijltjestoetsen (10 px); Bézier-ankers en -handgrepen bewegen mee.

- Zoom rond de muiscursor met Ctrl + muiswiel; gewoon scrollen blijft werken.

- Canvas verplaatsen zonder de tekening te wijzigen: houd **Spatie** ingedrukt en sleep met de linkermuisknop, of sleep met de middelste muisknop. Laat Spatie los om direct weer te tekenen of objecten te selecteren.

- Editor-sneltoetsen laten de standaard tekstbewerking intact wanneer een invoerveld, keuzelijst of bewerkbare tekst actief is.
- Geselecteerde objecten intern kopiëren en plakken met Ctrl+C en Ctrl+V; de plakactie maakt een onafhankelijk object met een nieuwe ID en een kleine offset.
- De objectclipboard blijft lokaal in het actieve app-geheugen en gebruikt geen systeemclipboard of netwerk. Vergrendeling wordt niet meegenomen naar het geplakte object.

- Reparatie: aangepaste Bézier-handgrepen blijven behouden en worden correct meegeschaald wanneer een curve wordt geschaald.
- Transparante achtergrondoptie voor PNG- en SVG-export; witte achtergrond blijft de standaard.
- Pixel Lab ondersteunt PNG-export op 1×, 2× en 3× resolutie met limieten voor canvasafmetingen en maximaal 50 miljoen pixels.

- Geselecteerde objecten kunnen links, horizontaal gecentreerd, rechts, boven, verticaal gecentreerd of onder op het canvas worden uitgelijnd.
- Uitlijnen verschuift ankerpunten en Bézier-handgrepen mee en ondersteunt ongedaan maken.
- Bézier-handgrepen kunnen worden versleept om de kromming van vectorpaden te verfijnen.
- Controlepunten worden opgeslagen in het project en meegenomen wanneer een curve wordt verplaatst.

- Rotatie van geselecteerde objecten werkt ook in Pixel Lab, naast vector- en paginaobjecten.

- Driehoek- en vijfpuntige stervormen als echte polygon-objecten in Pixel Lab, Vector Forge en Page Studio.
- Vormen kunnen worden gevuld, omlijnd, verplaatst, vergrendeld, verborgen, gedupliceerd en opgeslagen in het `.fluxivora`-project.
- SVG-export ondersteunt driehoeken en sterren als schaalbare `<polygon>`-elementen.
- Selectie-inspector bevat positie, breedte, hoogte, rotatie en de optie om verhoudingen te behouden voor objecten in vector- en paginaweergave.
- Rotatie blijft behouden in opgeslagen projectobjecten; extra regressietests dekken rotatie en invoerbegrenzing.
- Verstevigde bestandsvalidatie bij openen en opslaan van projecten, inclusief een bestandsgroottegrens en atomic writes.
- Afbeeldingsimport begrensd op 60 MB en export op 220 MB; projectpaden mogen niet zomaar vanuit de renderer worden gekozen.
- De actuele testsuite wordt per alpha-uitbreiding bijgewerkt; zie `TEST-RESULTS.md` voor de laatste lokale resultaten.

## Bestaande functies uit eerdere alpha-versies

- Lagen dupliceren en naar voren/achteren verplaatsen; beschikbaar via het lagenpaneel en `Ctrl+D`, `Ctrl+]` en `Ctrl+[`.
- Pagina’s dupliceren en verwijderen, met behoud van minimaal één pagina.
- PNG-export wordt los opgebouwd zonder zichtbare selectie-rand uit de editor.
- Laagzichtbaarheid, vergrendeling, zoomknoppen en lokale herstelkopieën van niet-opgeslagen werk.
- Projectinvoer en SVG-uitvoer valideren numerieke waarden, objecttypen, lettertypes, kleuren, data-URL’s en dubbele object-ID’s.
- Uitgebreidere automatische tests voor de kernlogica en HTML/JavaScript-koppelingen.

## Snel starten op Windows

1. Installeer Node.js 24 en Git.
2. Pak deze map uit of clone de repository.
3. Open een terminal in de projectmap en voer uit:

   ```powershell
   npm install
   npm run check
   npm test
   npm start
   ```

## Windows-installer bouwen

```powershell
npm install
npm run check
npm test
npm run dist:win
```

De installer komt in `release/` als `Fluxivora-Studio-Setup-<versie>.exe`. De workflow `.github/workflows/windows-build.yml` voert syntaxchecks en tests uit, bouwt op een Windows GitHub Actions-runner een NSIS `.exe`-installer en biedt het bestand als workflow-artifact aan. Dit pakket bevat op dit moment geen `.msi`-target.

## Projectstructuur

```text
FluxivoraStudio/
├── .github/workflows/windows-build.yml
├── assets/fluxivora-mark.svg
├── assets/fluxivora.ico
├── docs/ROADMAP.md
├── electron/main.cjs
├── electron/preload.cjs
├── electron/project-store.cjs
├── src/index.html
├── src/styles.css
├── src/app.js
├── src/core.js
├── tests/core.test.cjs
├── tests/project-store.test.cjs
├── tests/ui-contract.test.cjs
└── package.json
```

## Privacy & beveiliging

- Projectbestanden worden lokaal gelezen en opgeslagen via native bestandsdialogen.
- Niet-opgeslagen werk heeft een lokale JSON-herstelkopie in de gebruikersmap van de app. Deze herstelkopie is niet versleuteld; gebruik apparaatbeveiliging en sla vertrouwelijke projecten op in een passende beveiligde locatie.
- Geen analytics, advertenties, login, cloudopslag of externe API in de huidige basis.
- Electron gebruikt `contextIsolation`, `nodeIntegration: false` en een beperkte preload-API.
- Content Security Policy blokkeert netwerkverbindingen vanuit de renderer (`connect-src 'none'`).
- Geïmporteerde projectobjecten worden genormaliseerd en alleen ondersteunde ingebedde raster-data-URL’s worden als afbeelding behandeld.
- Gebruik afbeeldingen, fonts en andere assets waarvoor je de gebruiksrechten hebt.

## Grenzen van deze alpha

Dit is geen volledige vervanging van Photoshop, Illustrator of InDesign. Geavanceerde selecties/maskers, RAW-bewerking, volledige Bézier-curves en node-editing, CMYK/ICC-profielen, doorlopende tekstkaders, masterpagina’s, drukwerk-PDF/X en import/export van PSD/AI/INDD zijn nog niet geïmplementeerd en moeten in latere fases gebouwd en getest worden.

## Naam

**Fluxivora Studio** is een voorlopige productnaam. Een eerste beperkte controle van openbare zoekresultaten en GitHub leverde geen exacte `Fluxivora`-match op. Dit is geen volledige merk-, domein- of handelsnaamcontrole en geen juridische beschikbaarheidsgarantie. Controleer vóór publieke lancering de relevante merkregisters en domeinen.

## Status van tests en installatie

De alpha.24-testsuite bevat extra regressietests voor begrensde undo/redo-geschiedenis en slepen/selecteren zonder neveneffecten. De actuele testuitkomst en Windows-build staan in de nieuwste [GitHub Actions-runs](https://github.com/DRAVEINX/Fluxivora-Studio/actions). Een groene CI-run bevestigt niet zelfstandig dat de installer op een echte Windows 10/11-pc is geïnstalleerd en gebruikt. De sluitprocedure, herstelkopie en objectverplaatsing moeten daarom ook in de gebouwde app praktisch worden gecontroleerd.

## Licentie

MIT. Zie [LICENSE](LICENSE). Third-party dependencies blijven onder hun eigen licenties vallen.



### Toegevoegd in 0.5.0-alpha.6

- Laagzichtbaarheid met het oog-icoon in het lagenpaneel. Verborgen lagen worden niet weergegeven en komen niet mee in PNG/SVG/PDF-export.
- Lagen vergrendelen om onbedoelde objectwijzigingen te voorkomen.
- Zoomknoppen van 10% tot 300%.
- Lokale herstelkopie van niet-opgeslagen werk. Bij de volgende start kun je deze herstellen of verwijderen; na succesvol opslaan wordt de herstelkopie gewist. Er wordt geen gegevenskopie naar internet of de cloud gestuurd.
- Electron is bijgewerkt naar 44.9.0.

## Nieuw in 0.5.0-alpha.6
- Rotatie van geselecteerde objecten werkt ook in Pixel Lab, naast vector- en paginaobjecten.
- Core API voor proportioneel schalen en roteren van objecten.
- Rotatie wordt meegenomen in SVG-export.
- 30 automatische tests geslaagd in de beschikbare Node-omgeving.
- Windows-installer nog niet gebouwd; zie `BUILD-WINDOWS.md`.


### Bézier-pen (alpha.2)
In Vector Forge kies je **Bézier-pen**, klik je minimaal twee ankerpunten op het canvas en sluit je het pad af met dubbelklik of Enter. De app maakt een vloeiende kubische SVG-curve.


### Vector Forge — ankerpunten (0.5.0-alpha.6)
Selecteer een Bézier-curve met het selectiegereedschap. De ronde ankerpunten verschijnen op de curve; sleep een punt om de curve live aan te passen. Gebruik Ctrl+Z om de wijziging ongedaan te maken.

## Exportopties in 0.5.0-alpha.13

De documentsectie bevat nu de optie **Transparante achtergrond bij PNG/SVG-export**. Deze staat standaard uit zodat eerdere exports wit blijven. Zet de optie aan om bij Pixel Lab (PNG) of Vector Forge (SVG) geen witte achtergrondlaag toe te voegen. Een geïmporteerde basisfoto blijft uiteraard zichtbaar; transparantie verwijdert geen pixels uit die foto. PDF-export blijft wit.

## Validatie van 0.5.0-alpha.13

- 47 geautomatiseerde tests geslaagd.
- JavaScript-syntaxcontrole geslaagd.
- Windows-installer en runtime zijn niet in deze omgeving gebouwd of getest.


### Page Studio — papierformaten

Page Studio ondersteunt A4 staand, A4 liggend, A5 staand en US Letter staand. Kies een papierformaat voor de PDF-uitvoer; de inhoud wordt passend geschaald zonder de oorspronkelijke canvasafmetingen te wijzigen.


## 0.5.0-alpha.13

PDF-export ruimt tijdelijke printmarkup en papierformaatstijlen op na het sluiten van het afdrukvenster. Extra regressietests controleren SVG-documentafmetingen en veilige XML-tekst.


### Windows-release via GitHub-tags

De workflow `.github/workflows/windows-release.yml` maakt een prerelease wanneer een tag zoals `v0.5.0-alpha.13` wordt gepusht. De tag moet exact overeenkomen met `package.json`; daarna voert GitHub Actions de syntaxcontrole, tests en Windows-installerbuild uit voordat het `.exe`-bestand aan een GitHub Release wordt toegevoegd. Deze workflow is voorbereid, maar pas actief nadat de repository de wijziging bevat en de tag is gepusht.


### PNG-exportresolutie (0.5.0-alpha.13)

Pixel Lab ondersteunt PNG-export op 1×, 2× en 3× resolutie. Exports groter dan 50 miljoen pixels worden geweigerd met een duidelijke melding om overmatig geheugenverbruik te voorkomen. SVG blijft vectorgebaseerd en wordt niet door deze instelling beïnvloed.


### Windows-releasecontrole (0.5.0-alpha.13)

De releaseworkflow controleert na de build dat er daadwerkelijk een `.exe` bestaat, genereert `SHA256SUMS.txt` en publiceert de installer samen met de checksum. Hiermee kan een gedownloade installer op integriteit worden gecontroleerd. De workflow moet nog op GitHub worden uitgevoerd voordat dit als geteste Windows-release geldt.


## 0.5.0-alpha.15

- Herstelkopieën gebruiken dezelfde atomische bestandsvervanging als projectbestanden.
- Unieke tijdelijke bestandsnamen voorkomen conflicten bij overlappende autosave-verzoeken; mislukte schrijfacties ruimen hun tijdelijke bestand op.
- Extra regressietest voor atomische opslag van herstelkopieën.
- Windows-installer is nog niet gebouwd; npm-registry-toegang was niet beschikbaar in deze ontwikkelomgeving.


## 0.5.0-alpha.22

- Correctie van toetsenbordfocus: ongedaan maken/opnieuw, verwijderen, dupliceren en laagverplaatsing onderbreken geen tekstinvoer meer.
