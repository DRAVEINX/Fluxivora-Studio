# Wijzigingen

## 0.5.0-beta.1 — 17 oktober 2026

- Eerste beta-testkandidaat met functiestop: er worden geen nieuwe features toegevoegd tijdens de beta, alleen noodzakelijke reparaties en releaseblokkades.
- De werkende functies en stabiliteitsreparaties uit alpha.27 zijn behouden; de gebruiker heeft alpha.27 op Windows bevestigd als werkend.
- Versienummers van pakket, core en zichtbare interface zijn bijgewerkt naar 0.5.0-beta.1; versieconsistentie wordt door de bestaande tests gecontroleerd.
- Voordat beta.1 als stabiel kan gelden, moet de Windows-praktijktest opslaan/sluiten/heropenen, PNG/SVG/PDF-export en herstelkopieën bevestigen.

## 0.5.0-alpha.27 — 17 oktober 2026

- Inspectorvelden maken pas een undo-stap wanneer projectgegevens echt veranderen; alleen focussen of aanklikken maakt geen lege stap en wist de redo-geschiedenis niet.
- Wijzigingen aan helderheid, contrast en verzadiging bewaren één beginsnapshot per schuifactie en markeren echte aanpassingen direct als onopgeslagen.
- Gelijkblijvende documentafmetingen en foto-resetacties maken geen overbodige geschiedenisstap.
- Kern- en UI-regressietests toegevoegd voor no-op bewerkingen, redo-behoud en fotofiltergeschiedenis.
- Alpha.26 is door de gebruiker op Windows bevestigd als werkend; alpha.27 moet zijn eigen CI-build en praktijktest doorlopen.

## 0.5.0-alpha.26 — 17 oktober 2026

- Undo/redo houdt het geselecteerde object actief als het object in de herstelde projecttoestand nog bestaat; zo kan de gebruiker direct verder bewerken.
- Niet meer bestaande selecties worden gewist en Bézier-anker-/handgreepselecties worden na undo/redo gereset om verouderde UI-status te vermijden.
- Kern- en UI-contracttests toegevoegd voor selectieherstel en versienummers.
- Alpha.25 is door de gebruiker op Windows bevestigd als werkend; alpha.26 moet opnieuw door CI en een praktijktest.

## 0.5.0-alpha.25 — 17 oktober 2026

- Projectnamen wijzigen is nu correct undo/redo-ondersteund: de vorige toestand wordt vóór de naamswijziging vastgelegd.
- Een bevestiging zonder gewijzigde projectnaam voegt geen lege geschiedenisstap toe.
- Regressietests toegevoegd voor het ongedaan maken van projectnaamwijzigingen en het invoegen van afbeeldingen met een undo-checkpoint.
- Alpha.25 is door de gebruiker op Windows bevestigd als werkend; alpha.26 vraagt een nieuwe CI-build en praktijktest.


## 0.5.0-alpha.24 — 17 oktober 2026

- Undo/redo gebruikt de geteste core-historymanager; de geschiedenis is begrensd tot 60 stappen en snapshots zijn onafhankelijk.
- Een nieuwe bewerking na undo wist de redo-tak; lege undo/redo-acties veranderen de geschiedenis niet.
- Alleen daadwerkelijk verplaatsen van een object of Bézier-anker registreert een geschiedenisstap. Een gewone klik om te selecteren maakt geen schijnstap en markeert het project niet als gewijzigd.
- Reparatie: slepen van objecten in Vector Forge en Page Studio initialiseert nu de vorige pointerpositie correct.
- Geautomatiseerde regressietests toegevoegd voor snapshot-roundtrips, geschiedenislimieten, vertakkingen en selecties zonder wijzigingen.
- Windows-opslag: writes naar hetzelfde doelbestand worden geserialiseerd; de regressietest oefent twaalf concurrerende schrijfacties.
- Zie [TEST-RESULTS.md](TEST-RESULTS.md) en de actuele [GitHub Actions-runs](https://github.com/DRAVEINX/Fluxivora-Studio/actions) voor de buildstatus.

## 0.5.0-alpha.22 — 17 oktober 2026

- Nieuwe zoomsneltoetsen: Ctrl/Cmd + plus of gelijkteken zoomt in; Ctrl/Cmd + min zoomt uit.
- Ctrl/Cmd + 0 past het canvas opnieuw aan het beschikbare scherm aan.
- Zoomsneltoetsen worden niet overgenomen wanneer de gebruiker in een invoerveld, tekstgebied, contenteditable-gebied of keuzelijst werkt.
- Sneltoetsen zijn toegevoegd aan het helpvenster.
- De Windows-installer en Windows-runtime zijn nog niet gevalideerd; zie TEST-RESULTS.md.


## 0.5.0-alpha.21 — 17 oktober 2026

- Geselecteerde objecten nauwkeurig verplaatsen met de pijltjestoetsen: 1 documentpixel per stap.
- Shift + pijltjestoets verplaatst 10 documentpixels per stap.
- Verplaatsen werkt ook met paden en Bézier-curves; ankerpunten en handgrepen bewegen mee.
- Vergrendelde lagen kunnen niet per ongeluk met de pijltjestoetsen worden verplaatst.
- Elke nieuwe toetsenactie is ongedaan te maken; herhaalde toets-events veroorzaken geen stapel afzonderlijke geschiedenis-snapshots.
- De sneltoetsen zijn toegevoegd aan het helpvenster.
- Windows-installer en Windows-runtime zijn nog niet gevalideerd; zie TEST-RESULTS.md.

## 0.5.0-alpha.11 — 17 oktober 2026

- Toegevoegd: afzonderlijke Windows-releaseworkflow voor GitHub-tags `v*`.
- De workflow controleert eerst of de tag overeenkomt met `package.json`, voert syntaxcontrole en tests uit, bouwt daarna de Windows NSIS-installer en publiceert die als prerelease.
- De bestaande dagelijkse Windows CI-workflow blijft behouden.
- Toegevoegd: UI-contracttest die de volgorde en essentiële beveiligingsvoorwaarden van de releaseworkflow controleert.
- Let op: de workflow is lokaal statisch gecontroleerd; er is in deze omgeving geen GitHub Actions-run of Windows-installer uitgevoerd.


## 0.5.0-alpha.11 — 17 oktober 2026
- Bug opgelost waarbij het schalen van een Bézier-curve de aangepaste in- en uit-handgrepen kon verliezen.
- Handgrepen worden nu met dezelfde geometrische transformatie als de ankerpunten geschaald; het oorspronkelijke object blijft onveranderd.
- Regressietest toegevoegd voor aangepaste handgrepen en immutability van de oorspronkelijke curve.
- Windows-installer en echte Windows-runtime blijven apart te bouwen en te valideren.


## 0.5.0-alpha.7 — 17 oktober 2026
- Exportoptie toegevoegd om bij PNG- en SVG-export een transparante achtergrond te gebruiken, handig voor logo’s en losse grafische elementen.
- Witte achtergrond blijft de standaard om het bestaande exportgedrag te behouden; de keuze geldt voor de huidige exportactie en wordt niet in projectbestanden opgeslagen.
- PDF-export blijft op witte pagina’s, zodat printgedrag voorspelbaar blijft.
- UI-contracttest toegevoegd voor de transparantieoptie en de exportpaden.
- Automatische tests en syntaxcontroles moeten in deze omgeving worden uitgevoerd; Windows-runtime en installer zijn nog niet gevalideerd.


## 0.5.0-alpha.6 — 17 oktober 2026
- Inspector uitgebreid met zes uitlijnacties: links, horizontaal midden, rechts, boven, verticaal midden en onder ten opzichte van het canvas.
- Uitlijnen werkt op gewone objecten en verschuift bij paden ook ankerpunten en Bézier-handgrepen mee.
- Uitlijnacties worden opgenomen in de bestaande geschiedenis, zodat ze ongedaan gemaakt kunnen worden.
- UI-contracttest toegevoegd voor de zes knoppen en het uitlijnpad.
- Dit blijft een alpha-broncodeversie; Windows-installer en runtime moeten apart worden gebouwd en getest.


## 0.5.0-alpha.4 — 17 oktober 2026
- Bézier-curves tonen nu bewerkbare in- en uit-handgrepen, inclusief hulplijnen.
- Handgrepen kunnen worden versleept om de kromming van een segment aan te passen; aangepaste controlepunten blijven in projectbestanden bewaard.
- Verplaatsen van een curve of ankerpunt houdt de bijbehorende handgrepen op hun plaats ten opzichte van het object.
- Kern- en UI-contracttests toegevoegd voor automatische en aangepaste controlepunten.
- Dit blijft een alpha-broncodeversie; installer en Windows-runtime moeten afzonderlijk worden getest.


## 0.5.0-alpha.3 — 17 oktober 2026
- Geselecteerde Bézier-curves tonen nu afzonderlijke ankerpunten in Vector Forge.
- Ankerpunten kunnen met de muis worden versleept; de curve wordt tijdens het slepen live bijgewerkt.
- Ankerpuntwijzigingen worden opgenomen in de bestaande geschiedenis en als projectwijziging gemarkeerd.
- Automatische UI-contracttest toegevoegd voor de ankerpuntbewerking.
- Dit is een alpha-broncodeversie; Windows-installer en runtime zijn niet automatisch hiermee bewezen.


## 0.5.0-alpha.1 — 17 oktober 2026
- Nieuwe bijsnijdfunctie in Pixel Lab met X/Y-coördinaten en instelbare breedte/hoogte.
- Bijsnijden verwerkt de basisafbeelding naar een lokale PNG en verplaatst bestaande objecten en vrije paden zodat hun positie relatief aan de uitsnede behouden blijft.
- Bijsnijdbewerking ondersteunt ongedaan maken via de bestaande projectgeschiedenis; ongeldige of buiten het canvas vallende uitsneden worden geweigerd.
- Versienummers bijgewerkt en UI-contracttests toegevoegd.
- Nog geen Windows-installer gebouwd of runtime op Windows getest in deze omgeving.

## 0.4.0-alpha.2 — 17 oktober 2026
- Objectrotatie werkt nu ook in Pixel Lab, rond het midden van het object.
- Projectnormalisatie bewaart rotatie-instellingen; vector- en pagina-export ondersteunen deze al.
- Nieuwe interface-contracttest voor rotatie in Pixel Lab.
- Validatie: 34 automatische tests en syntaxcontrole geslaagd.
- Geen Windows-installer gebouwd of runtime op Windows getest in deze omgeving.


## 0.4.0-alpha.1 — 17 oktober 2026

- Driehoek- en vijfpuntige stervormen toegevoegd als polygonen met instelbare vulkleur, lijn en dekking.
- Polygonen werken in Pixel Lab, Vector Forge en Page Studio, inclusief lagen, zichtbaarheid, vergrendeling, dupliceren en verplaatsen.
- SVG-export ondersteunt polygonen als schaalbare `<polygon>`-elementen.
- Projectbestanden worden bij openen en opslaan beperkt op grootte en gecontroleerd op het verwachte projectformaat.
- Opslaan gebruikt tijdelijke bestanden en hernoemen om gedeeltelijk geschreven projectbestanden te helpen voorkomen.
- Projectpaden moeten door de app-native open-/opslaandialoog zijn geautoriseerd; afbeeldingimport is begrensd tot 60 MB en export tot 220 MB.
- Alle zichtbare en projectversienummers gelijkgetrokken op `0.4.0-alpha.1`; tests uitgebreid naar 27 geautomatiseerde controles.

## 0.2.0-alpha.2 — 17 oktober 2026

- Laagzichtbaarheid en vergrendeling in Pixel Lab, Vector Forge en Page Studio.
- In- en uitzoomen tussen 10% en 300%.
- Lokale herstelkopieën voor niet-opgeslagen projecten, met herstel-/verwijderprompt bij herstart.
- Verborgen objecten uitgesloten van normale PNG/SVG/PDF-uitvoer.

## 0.2.0-alpha.1 — 17 oktober 2026

- Lagen dupliceren en in de stapelvolgorde verplaatsen via knoppen en sneltoetsen.
- Pagina's dupliceren en verwijderen met minimaal één pagina per document.
- PNG-export zonder editorselecties.
- Projectnormalisatie en SVG-serialisatie robuuster gemaakt voor ongeldige numerieke waarden, objecttypen, verfkleuren, lettertypes, data-URL's en dubbele object-ID's.
- Windows-workflow voert syntaxchecks en tests uit voordat een installer wordt gebouwd.

## 0.4.0-alpha.1 — 17 oktober 2026
- Kernfuncties toegevoegd om objecten te roteren en te schalen met behoud van aspectverhouding.
- Geroteerde objecten worden als SVG-transform geëxporteerd.
- Vergrendelde objecten kunnen niet via deze kernfuncties worden gewijzigd.
- Versienummers bijgewerkt en automatische tests uitgebreid naar 30.
- Let op: rotatie/schalen zijn op dit moment kern-API's; er zijn nog geen zichtbare inspector-controls voor deze functies.

### 0.4.0-alpha.1 — vervolgverbetering
- Inspector uitgebreid met X/Y-positie, breedte, hoogte, rotatie en optioneel behoud van verhoudingen.
- Rotatie blijft bewaard bij het importeren/normaliseren van projectbestanden en wordt toegepast in vector- en paginaweergave.
- Extra regressietests voor rotatieopslag en begrenzing van invoer.


## 0.5.0-alpha.2

- Added a Bézier pen to Vector Forge: click to add anchors, then finish with double-click or Enter.
- Curves are generated as smooth cubic SVG paths and remain editable as vector point data in the project.
- Added automated contract and SVG-export tests for Bézier paths.
- This remains an alpha source release; Windows packaging and end-to-end runtime testing are not claimed unless run separately.


## 0.5.0-alpha.5 — 17 oktober 2026

- Added a core Bézier segment-splitting helper based on De Casteljau subdivision, preserving the original cubic curve when adding a point.
- Added anchor-point insertion and deletion controls for selected Bézier paths in Vector Forge.
- Highlighted the selected anchor and prevented deleting a curve below two anchors.
- Added regression tests for subdivision geometry, invalid indices, and anchor deletion.
- Source-only alpha release; Windows runtime/installer still requires a separate build and practical test.


## 0.5.0-alpha.8
- Added A4 portrait, A4 landscape, A5 portrait and US Letter page formats in Page Studio.
- Applying a format stores the selected PDF paper size without changing canvas coordinates or artwork dimensions.
- PDF print output now requests the matching physical page size and scales artwork to fit.
- Added UI contract coverage for page-format controls and print sizing.


## 0.5.0-alpha.11 — 17 oktober 2026
- PDF-export ruimt tijdelijke printmarkup en papierformaatstijlen op nadat het afdrukvenster sluit.
- SVG-export regressietest toegevoegd voor documentafmetingen, viewBox en XML-escapete tekst.
- Versienummers bijgewerkt; extra UI-contracttest voor PDF-export-opruiming.
- Broncode-alpha; Windows-installer en echte Windows-praktijktest blijven afzonderlijke stappen.


## 0.5.0-alpha.12

- Added 1×, 2× and 3× PNG export resolution options in Pixel Lab.
- Export uses the document coordinate system while rendering to a higher-resolution output canvas.
- Added dimension and 50-million-pixel and dimension safety limits to avoid excessive canvas memory use.
- Export confirmation now reports the actual PNG pixel dimensions.
- Added a UI-contract regression test for resolution options and safety guards.


## 0.5.0-alpha.13 — 17 oktober 2026

- Windows-releaseworkflow controleert expliciet of de installer na de build aanwezig en niet leeg is.
- Genereert `SHA256SUMS.txt` voor de Windows-installer en voegt dit bestand toe aan de GitHub-prerelease.
- Extra UI-contracttest controleert de volgorde van build, validatie, checksum en publicatie.
- Broncode-alpha; GitHub-workflow en Windows-runtime zijn nog niet uitgevoerd/getest.


## 0.5.0-alpha.15 — 17 oktober 2026

- Herstelkopieën gebruiken voortaan de gedeelde atomische opslaghelper met unieke tijdelijke bestandsnamen.
- Mislukte tijdelijke schrijfacties worden opgeruimd; overlappende autosave-verzoeken delen niet langer hetzelfde vaste tijdelijke pad.
- Extra regressietest voor atomische herstelopslag.
- Windows-installer is niet gebouwd: toegang tot de npm-registry faalde met `EAI_AGAIN`.


## 0.5.0-alpha.15 — 17 oktober 2026

- Kopiëren en plakken van geselecteerde objecten met Ctrl+C en Ctrl+V, inclusief nieuwe object-ID en offset.
- De interne clipboard kopieert de objectdata onafhankelijk en blijft lokaal in het app-geheugen; geplakte objecten zijn zichtbaar en ontgrendeld.
- Sneltoetsen toegevoegd aan de hulplijst en regressiecontroles bijgewerkt.


## 0.5.0-alpha.17 — 17 oktober 2026

- Sneltoetsen voor ongedaan maken/opnieuw, dupliceren, lagen verplaatsen en verwijderen grijpen niet langer in wanneer een tekstveld, selectievak of bewerkbare tekst actief is.
- De Enter-sneltoets voor het afronden van Bézier-paden wordt niet geactiveerd terwijl de gebruiker tekst invoert.
- Extra UI-contracttest voor behoud van native tekstbewerking.
- Dit is een broncode-alpha; de Windows-installer en Windows-runtime moeten nog op Windows worden gevalideerd.


## 0.5.0-alpha.17 — 17 oktober 2026

- Versterkte Windows CI- en release-workflows tegen tijdelijke npm-registry- en DNS-storingen.
- Expliciete officiële npm-registry, interne npm-retries, langere time-out en maximaal drie installatiepogingen met oplopende wachttijd.
- Extra contracttest controleert dat beide workflows dezelfde herstelstrategie gebruiken.
- Dit is een verbetering van de buildprocedure; een Windows-installer is pas beschikbaar nadat de workflow echt succesvol is uitgevoerd.


## 0.5.0-alpha.21 — 17 oktober 2026

- Windows CI- en releaseworkflows proberen bij npm-installatieproblemen eerst de officiële npm-registry en daarna een alternatieve npm-mirror.
- Per registry worden twee pogingen gedaan met begrensde retries en time-outs, zodat een tijdelijke DNS-storing niet meteen de build stopt en de workflow niet onbeperkt blijft hangen.
- Contracttest bijgewerkt voor de fallback-strategie.
- De lokale omgeving heeft nog steeds geen DNS-toegang tot registry.npmjs.org; daarom is een echte Windows-installer pas bevestigd na een geslaagde GitHub Actions-run.


## 0.5.0-alpha.21 — 17 oktober 2026

- Ctrl + muiswiel (of Cmd + muiswiel op macOS) zoomt in en uit rond de cursorpositie, zodat je tijdens detailwerk het doelgebied in beeld houdt.
- Gewoon muiswiel-scrollen blijft beschikbaar voor navigatie in het canvasvenster.
- Canvasweergave pannen met Spatie + linkermuisknop-slepen of met de middelste muisknop, zonder objecten te verplaatsen of documentinhoud te wijzigen.
- Pannen wordt bij pointer-cancel, verlies van pointer capture en vensterfocusverlies veilig beëindigd.
- Helpvenster en UI-contracttests bijgewerkt.
- Windows-installer blijft afhankelijk van een geslaagde build op Windows/GitHub Actions.
