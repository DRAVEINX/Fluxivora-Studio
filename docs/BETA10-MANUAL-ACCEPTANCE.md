# Fluxivora Studio Beta 10 — handmatige acceptatie

Deze checklist hoort bij `feature/beta10-proxy-recovery`. Een groene CI-build is noodzakelijk, maar vervangt deze praktijktest niet. Test met kopieën van videobestanden, niet met de enige originelen.

## Voorbereiding
- [ ] Installeer het Windows-artifact uit de meest recente geslaagde GitHub Actions-run.
- [ ] Maak een testmap met minimaal drie korte videobestanden; bewaar de originelen buiten de proxy-map.
- [ ] Noteer de oorspronkelijke bestandsgroottes en controleer dat de testbestanden afspeelbaar zijn.

## Installatie en starten
- [ ] Voer de installer uit als gewone gebruiker en controleer dat de installatiemap correct wordt aangemaakt.
- [ ] Start Fluxivora Studio direct na installatie en controleer dat het hoofdvenster zichtbaar wordt zonder foutmelding.
- [ ] Sluit de app en start opnieuw via de bureaubladsnelkoppeling.
- [ ] Start opnieuw via het Startmenu; controleer dat beide snelkoppelingen de app openen.
- [ ] Sluit de app normaal af en controleer dat er geen achtergebleven Fluxivora-proces blijft draaien.
- [ ] Verwijder de app via Windows Instellingen > Geïnstalleerde apps en controleer dat de app-installatie en snelkoppelingen worden verwijderd.
- [ ] Installeer de app opnieuw voordat je de overige tests uitvoert.

## Proxy's maken en annuleren
- [ ] Importeer meerdere clips en genereer proxy's voor alle clips.
- [ ] Controleer voortgang en bevestig dat elke voltooide proxy leesbaar is.
- [ ] Start een nieuwe batch en annuleer terwijl een proxy wordt gemaakt.
- [ ] Controleer dat de batch stopt, de interface weer bedienbaar is en er geen gedeeltelijk `.partial.mp4`-bestand als voltooide proxy achterblijft.
- [ ] Controleer dat de originele bestanden ongewijzigd zijn.

## Project opslaan, sluiten en herstellen
- [ ] Sla het montageproject op en sluit Fluxivora Studio volledig af.
- [ ] Verplaats één origineel naar een andere map en heropen het project.
- [ ] Controleer dat ontbrekende media duidelijk als ontbrekend worden gemarkeerd en dat export wordt geblokkeerd totdat de bron is gekoppeld.
- [ ] Koppel het verplaatste origineel handmatig opnieuw en controleer de clipduur, in-/uitpunten en synchronisatie.
- [ ] Verplaats de proxy-map en koppel proxy's opnieuw via de batch-herstelactie.
- [ ] Selecteer bewust twee bestanden met dezelfde naam; controleer dat een dubbelzinnige match wordt overgeslagen en niet automatisch aan een willekeurige clip wordt gekoppeld.
- [ ] Controleer dat een proxy met een afwijkende opgeslagen bestandsgrootte niet automatisch wordt gekoppeld.

## Preview en export
- [ ] Schakel proxy-preview in en controleer dat de preview de proxy gebruikt.
- [ ] Maak een proxy onleesbaar of koppel hem los; controleer dat de preview naar de originele bron terugvalt wanneer die beschikbaar is.
- [ ] Controleer bij multicam dat de terugval de originele bron van de actieve camerahoek gebruikt.
- [ ] Probeer met proxy-preview ingeschakeld te exporteren; bevestig dat de app export blokkeert met een duidelijke melding.
- [ ] Schakel proxy-preview uit en exporteer een korte testmontage.
- [ ] Speel de export af en controleer beeld, audio, clipvolgorde en volledige bronkwaliteit.
- [ ] Controleer nogmaals dat de originele mediabestanden niet zijn gewijzigd of verwijderd.

## Resultaat
- Datum / Windows-versie: ____________________
- GitHub Actions-run / commit: ____________________
- Uitkomst: [ ] Geslaagd  [ ] Mislukt
- Problemen en reproduceerstappen: ____________________

**Acceptatieregel:** markeer Beta 10 pas als geaccepteerd nadat alle relevante punten zijn uitgevoerd en eventuele afwijkingen zijn opgelost. Het document zelf is een checklist; het registreert niet dat de praktijktest al is uitgevoerd.
