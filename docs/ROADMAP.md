# Fluxivora Studio — ontwikkelroadmap

## Fase 1 — zelfstandige alpha (0.1.0)

- Moderne donkere desktop-shell met Foto, Vector en Pagina als aparte werkruimtes.
- Eén lokaal `.fluxivora`-projectformaat.
- Pixel: rasterimport, penseel/gum, vormen, tekst, basisfilters en PNG-export.
- Vector: rechthoeken, ellipsen, lijnen, vrije paden, tekst, rasterafbeeldingen en SVG-export.
- Layout: basisobjecten, meerdere pagina’s en afdruk-naar-PDF.
- Lagen-/objectenlijst, selectie, verplaatsen, basale undo/redo en documentafmetingen.

## Fase 2 — betrouwbaarheid en workflow (huidige basis: 0.5.0-beta.5 (testkandidaat))

- Lagen dupliceren en volgorde aanpassen.
- Pagina’s dupliceren/verwijderen met minimaal één pagina per document.
- PNG-export zonder editorselecties; tests voor projectnormalisatie en SVG-veiligheid.
- Valideren van HTML/JavaScript DOM-contracten, data-URL’s, numerieke waarden en object-ID’s.
- Zichtbaarheid en vergrendeling per object; verborgen objecten worden uit standaardexport weggelaten.
- Lokale herstelkopie van niet-opgeslagen werk en herstel-/verwijderprompt bij herstart.
- Zoomknoppen van 10% tot 300%.
- Herhaalbare Windows CI inclusief installer-artifact.
- Driehoek- en stervormen als vectorpolygonen in Pixel Lab, Vector Forge en Page Studio, met vulkleur, lijn, lagen en SVG-export.
- Limieten voor project-, afbeeldings- en exportbestanden; projectbestanden worden gevalideerd en via atomische opslag weggeschreven.
- Afgerond in alpha.22: canvas pannen, toetsenbordzoom, nauwkeurige objectverplaatsing en behoud van Bézier-ankers/-handgrepen tijdens transformaties.
- Toegevoegd: bij openen van een ander project of starten van een nieuw ontwerp wordt eerst gevraagd het huidige niet-opgeslagen project op te slaan; annuleren voorkomt overschrijven.
- Toegevoegd: geautomatiseerde JSON-roundtriptest voor pixel-, vector- en pagina-inhoud, meerdere pagina’s, afbeeldingen, lagenvlaggen, rotatie en Bézier-handgrepen.
- Afgerond in alpha.24: undo/redo-historyhelpers getest en begrensd tot 60 snapshots; nieuwe bewerkingen wissen de redo-tak.
- Afgerond in alpha.24: een gewone selectieklik maakt geen geschiedenisstap; verplaatsen in Vector Forge/Page Studio initialiseert de pointerpositie en slaat geschiedenis pas bij echte beweging op.
- Aanvulling in alpha.24: opslagacties naar hetzelfde doelbestand worden geserialiseerd om een Windows-`EPERM`-race bij gelijktijdige vervanging te voorkomen.
- Afgerond in alpha.25: projectnaamwijzigingen zijn ongedaan te maken en een ongewijzigde naam maakt geen lege geschiedenisstap.
- Alpha.25 is door de gebruiker bevestigd als werkend op de eigen Windows-pc.
- Toegevoegd in alpha.26: undo/redo behoudt de objectselectie wanneer het geselecteerde object nog bestaat; verouderde Bézier-selectiestatus wordt gereset. De gebruiker heeft alpha.26 op Windows bevestigd als werkend.
- Toegevoegd in alpha.27-broncode: inspector- en fotofilterwijzigingen maken pas een geschiedenisstap bij echte wijzigingen; no-op focus wist de redo-tak niet en filteraanpassingen markeren herstelbare wijzigingen direct als onopgeslagen.
- Beta.1 was de eerste functievrijeze-testkandidaat. Op basis van de gemelde ontbrekende gereedschappen voegt beta.2 een gecontroleerde uitbreiding van de drie werkruimtes toe; na deze uitbreiding geldt opnieuw een stabilisatieperiode.
- De gebruiker heeft alpha.27 op Windows bevestigd als werkend en de alpha.27 CI/build was groen.
- Om beta.2 te accepteren moet de Windows-praktijktest opslaan/sluiten/heropenen, PNG/SVG/PDF-export en herstelkopieën bevestigen. Daarna volgen de tests voor installeren, bijwerken en verwijderen vóór 1.0.0.

## Fase 3 — solide grafische basis

- Betrouwbare undo/redo voor alle eigenschappen en niet-destructieve bewerkingsstappen.
- Echte rasterlagen, gegroepeerde lagen, laag-blending en aanpasbare laagtypen.
- Selectiekaders, lasso/maskers, transformaties, rotatie, heal/clone en kleurpipet. (Basis-crop voor Pixel Lab is toegevoegd in 0.5.0-alpha.1.)
- Drukpen-input waar ondersteund, volledige toetsenbordnavigatie en testen van herstel na geforceerde afsluiting.
- Vector nodes/Bezier-handles, booleaanse vormen, grids/guides, alignment en snapping.

## Fase 4 — professionele vector-workflow

- Pen-tool met Bézier-curves, node-editing, strokes/dashes, gradients en patronen.
- Symbols/components, reusable swatches, typografische stijlen, outlines en uitgebreide SVG-validatie.
- Logovarianten, icon sheets, export-presets en SVG/PDF round-trip-tests.

## Fase 5 — pagina’s en publicaties

- Tekstkaders met thread/flow, meerdere kolommen, alineastijlen en OpenType-functies.
- Masterpagina’s, marges, afloop/bleed, hulplijnen, paginanummering, inhoudsopgave en boeken.
- Drukklare PDF-export en preflight-controles; kleurprofiel/CMYK-support pas na end-to-end tests.
- Import/export voor gangbare open formaten waar specs beschikbaar zijn; Adobe-formaten alleen met betrouwbare en licentieconforme ondersteuning.

## Fase 6 — modernisering 2026/2027

- Plugin-API met versiebeleid en geïsoleerde capabilities.
- Optionele lokale AI-functies (bijv. achtergrondmasker) als losse, uitschakelbare module; nooit nodig voor de basis.
- GPU-versnelde filters waar stabiel, grote documenten, performance-profielen en crashherstel.
- Toegankelijkheid, schaalbare UI, licht/donker thema, NL/EN en geautomatiseerde regressietests.

## Motion Studio — professionele montage-uitbouw (beta.5 en volgende fases)

### Afgerond in beta.5
- Afzonderlijke bronmonitor en programmamonitor, mediabibliotheek met zoeken/filteren, bron-in/out-punten en invoegen op de playhead.
- Mediabronnen blijven als metadata in het montageproject staan wanneer een timelineclip wordt verwijderd; het bronbestand wordt niet in het project-JSON ingebed en moet na heropenen gekoppeld worden.
- Reversibele effectstack met in-/uitschakelen, volgorde aanpassen en verwijderen.
- Clip-kleurinstellingen voor exposure, contrast, saturatie, temperatuur en tint, plus RGB-histogram en luma-waveform van de samengestelde programmamonitor.
- Keyframe-interpolatie: lineair, ease-in, ease-out, ease-in-out en hold.

### Volgende fase — kleur en keyframes
- Echte Bézier-curve-editor met handles, snelheids-/waarde-curves en keyframes voor alle animabele eigenschappen.
- Import en validatie van .cube-LUT's, LUT-intensiteit per clip en gecontroleerde preview-rendering.
- Nauwkeurigere scopes en kleurpipelines met expliciete kleur-ruimte, referentieniveaus en testmateriaal; de beta.5-scopes zijn indicatief en niet gekalibreerd.
- Meer effecttypen en instelbare parameters per effect, maskers en niet-destructieve effect-presets.

### Volgende fase — proxies en multicam
- Proxy-bestanden genereren of koppelen met originele/proxy-relatie, duidelijke status, batchworkflow en veilig relinken.
- Multicam-groepen met synchronisatie op audio/tijdcode, hoekselectie tijdens afspelen en terugschrijven als bewerkbare montage.
- Geheugenlimieten, codec-detectie en stress tests voor lange clips, hoge resolutie en meerdere actieve tracks.

### Volgende fase — volwaardige offline render/export
- Aparte render-engine/worker die sequenties frame voor frame rendert onafhankelijk van realtime playback.
- Betrouwbare encoderintegratie voor MP4/H.264 met AAC, exportpresets, bitrate, framerate, schaal, kleurbehoud, voortgang, annuleren en nette foutherstel.
- Regressieclips voor A/V-sync, fade-overgangen, keyframes, kleur, audio-mix, audio-clipping, en renderen na project-heropening.
- Hardware-acceleratie alleen gebruiken na capability-detectie en fallback-tests; nooit aannemen dat elke Windows-machine dezelfde encoder ondersteunt.

## Release-gates vóór een publieke 1.0

1. Volledige unit- en integratietest van import, save/reopen, undo/redo en export.
2. Windows 10/11-installatie, starten, verwijderen, upgrade en herstel getest op schone systemen.
3. Projecten met grote afbeeldingen, veel pagina’s en complexe SVG-bestanden getest.
4. Rechten/attributies, componentlicenties, privacyverklaring, foutmeldingen en crash logging expliciet beoordeeld.
5. Ondersteunde bestandsformaten en beperkingen zichtbaar documenteren; nooit compatibiliteit beloven zonder tests.


## 0.5.0-beta.2 — extra gereedschappen

- Pixel Lab: rechte lijn, pen als aparte bewerkbare padlaag, afgeronde rechthoek, extra geometrische vormen en pipet voor zichtbare canvaspixels.
- Vector Forge: extra geometrische vormen, afgeronde rechthoek, afbeelding plaatsen, pipet en objectgum met bescherming voor vergrendelde lagen.
- Page Studio: dezelfde extra vormen, vrije paden, Bézier-curves met bewerkbare ankerpunten, pipet en objectgum.
- Polygon-geometrie wordt gevalideerd en bewaard bij projectopslag/heropenen en meegenomen in SVG-export.
- De straal van afgeronde rechthoeken wordt bewaard in .fluxivora-projecten en SVG-export.
- Acceptatie blijft afhankelijk van groene syntax-, unit- en UI-contracttests én een praktische Windows-test van tekenen, opslaan/heropenen en PNG/SVG/PDF-export.


## 0.5.0-beta.5 — Motion Studio professional NLE foundation

- Separate Motion Studio workspace with a sequence monitor, editable multi-track timeline and clip inspector.
- Video, audio and title tracks. Add tracks, drag clips to compatible tracks, move clips in time, trim with edge handles, lock tracks, hide video tracks and mute audio tracks.
- Clip controls for source in/out, timeline position, playback speed, opacity, scale, fit mode, volume, fades and a first set of look filters.
- Canvas-based multi-layer preview with title rendering; Web Audio mixing and real-time WebM capture where supported by the installed Electron runtime.
- Projects store track layout and edit metadata locally; source video/audio files remain external and must be relinked when reopening a project.
- Version still uses a real-time recorder and WebM browser codecs. A complete professional parity target needs subsequent work on frame-accurate decode/encode, keyframe curves, color scopes/LUTs, transitions beyond fades, title/motion graphics, proxies, multicam, media conforming, autosave/recovery and a broader export codec pipeline.
