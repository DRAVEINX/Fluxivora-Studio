# Fluxivora Studio — gereedschapsinventaris

**Gecontroleerde basis:** `feature/beta10-proxy-recovery`, packageversie `0.5.0-beta.10`.

Deze inventaris is gebaseerd op broncode-inspectie en bestaande UI-contracttests. Een knop of codepad betekent niet automatisch dat alle gebruikersscenario's handmatig zijn gevalideerd. Handmatige acceptatie en daadwerkelijke exporttests blijven nodig.

## Pixel Lab — fotobewerking

### Aanwezig in de code
- Selecteren en verplaatsen van objecten; lagen met zichtbaarheid en vergrendeling.
- Penseel, pen/vrij pad en gum.
- Lijn, rechthoek, afgeronde rechthoek, ellips, driehoek, ster, vijfhoek, zeshoek, ruit, pijl, achthoek en tekstballon.
- Tekst en pipet.
- Afbeeldingsimport, uitsnijden, helderheid, contrast, verzadiging, PNG-export, canvas-pannen en zoom.

### Belangrijke uitbreidingen
- Niet-destructieve rasterlagen en laagmaskers.
- Lasso-/veelhoekselectie en selecties omkeren/verzachten.
- Kloonstempel, herstelpenseel en vlekverwijdering.
- Verlopen, patronen, ruis/blur/sharpen en betere penseelinstellingen.
- Historie per bewerking en controles op kleurprofiel/bitdiepte.

## Vector Forge — vectorontwerp

### Aanwezig in de code
- Selecteren/verplaatsen, basisvormen, vrije paden en Bézier-pen.
- Bézier-ankers en handgrepen bewerken, afbeeldingen plaatsen, tekst en pipet.
- Objectgum, object-/lagenbeheer, uitlijnen en SVG-export.

### Belangrijke uitbreidingen
- Booleaanse vormbewerkingen: verenigen, aftrekken, doorsnede en uitsluiten.
- Verlopen, patronen, kleurstalen en stippel-/streepinstellingen.
- Uitlijnen op selectie, verdelen, slimme hulplijnen en magnetisch raster.
- Tekst op pad, lettercontouren, symbolen en herbruikbare componenten.
- SVG-import/export-regressietests met complexe paden en transparantie.

## Page Studio — pagina- en publicatieontwerp

### Aanwezig in de code
- Meerdere pagina's, pagina dupliceren/verwijderen, objecten en tekstkaders.
- Afbeeldingen, vormen, Bézier-paden, uitlijnen en PDF-afdruk/export.
- Paginaformaten en object-/lagenbeheer.

### Belangrijke uitbreidingen
- Gekoppelde tekstkaders en doorlopende tekst over kolommen/pagina's.
- Masterpagina's, paginanummers, kop-/voetteksten en inhoudsopgave.
- Alinea-/tekenstijlen, kolommen, tabstops, tekstomloop en voetnoten.
- Afloop, snijtekens, drukwerk-PDF-profielen en preflight-controle.
- Betere font-insluiting, ontbrekende-fontmeldingen en lange-documenttests.

## Motion Studio — videomontage

### Aanwezig in de code
- Meersporige tijdlijn met video-, audio- en titelclips; splitsen, trimmen, ripple delete en markers.
- Clipinspecteur voor positie, in-/uitpunten, snelheid, dekking, schaal, positie en volume.
- Keyframes, curve-editor, fades, crossfade, effectenstapel en kleurcorrectie.
- LUT-import, scopes, proxygeneratie/annuleren/herkoppelen, multicamgroepen en audio-syncsuggesties.
- Project opslaan/openen, ontbrekende media markeren, offline MP4-export en realtime WebM-export.

### Belangrijke uitbreidingen
- Volledige effectstapel met instelbare parameters en keyframebare effectwaarden.
- Meer overgangen, maskers, chroma key en motion tracking.
- Live multicam-monitor met betrouwbare angle-switching en sync-validatie.
- Exportpresets, bitrate/codec/audio-instellingen, voortgang, foutmeldingen en reproduceerbare exporttests.
- Proxy-, bron- en projectherstel handmatig testen op grote en beschadigde mediabestanden.

## Volgorde voor implementatie

1. Eerst automatische regressietests voor alle bestaande tools, projectopslag en export.
2. Pixel Lab: selecties, maskers en retouche.
3. Vector Forge: booleaanse vormen, verlopen en precisie-uitlijning.
4. Page Studio: gekoppelde tekst, masterpagina's en drukwerkcontrole.
5. Motion Studio: effectparameters, overgangen en exportpresets.
6. Per fase: CI, visuele/handmatige acceptatie en controle dat bestaande bestanden/projecten compatibel blijven.

## Grenzen van deze controle

Dit document is een implementatieplan en broncode-inventaris, geen claim dat elk scenario op een echte Windows-installatie handmatig is getest. Publieke release blijft geblokkeerd tot relevante acceptatietests zijn uitgevoerd.
