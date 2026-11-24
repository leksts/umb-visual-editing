# FINDINGS

Bevindingen uit de PoC "Visual Editing voor headless Umbraco 18" (Umbraco 18.3.2, Astro 7.4, Vue 3.5).
Resultaat: alle vier de doelen werken lokaal en worden aangetoond met 48 geautomatiseerde tests (`npm test`).

## Wat goed werkte

- **Delivery API uitbreiden zonder de output te veranderen.** Een decorator op `IApiContentResponseBuilder` plus een
  System.Text.Json-contract-modifier (`editMetadata` met `ShouldSerialize`) werkte bij de eerste poging voor alle
  content-endpoints, ook de query-endpoint die via het interface-type serialiseert. De integratietest vergelijkt byte voor
  byte met een baseline die is opgenomen met de extensie *uit*: gepubliceerd en preview zonder vlag zijn identiek, en met
  vlag komt alleen `editMetadata` erbij (als laatste veld).
- **Block-keys zaten er al.** `content.id` van een Block List-item is de content-key van het block. De metadata hoeft dus
  alleen te vertellen bij welke property, op welke positie en met welke velden. De frontend koppelt op die bestaande id.
- **"Additional preview environments" is precies het juiste haakje.** `IUrlProvider.GetPreviewUrlAsync` + de standaard
  endpoint `document/{id}/preview-url` leveren de iframe-URL. Dezelfde provider voedt ook de knop "Save and preview".
- **Vue-conventie met een attributen-object (`v-bind="e.field('title')"`).** Identiek in SSR, bij hydration en na
  re-renders; geen directive, geen hydration-mismatch. Zonder descriptor is de HTML exact gelijk aan productie. Props
  werken over Astro-eilandgrenzen heen.
- **De standaard editor naast de preview.** Via het manifest van de Content-view (`createExtensionElement`) draait de
  complete Umbraco-editor (tabs, property-editors, Block List, validatie) in onze eigen view, met tab-routes onder
  `…/view/visual-editing/tab/{tab}`. Daardoor voelt het als Prepr en Sanity: links klikken, rechts bewerken, opslaan, en
  de preview springt terug naar dezelfde plek.
- **Opslaan detecteren** via `UmbEntityUpdatedEvent` op de action-event-context: precies één event per geslaagde save.

## Wat lastig was

- **Login over HTTP.** De backoffice-login (OpenIddict) weigert standaard HTTP. Oplossing:
  `Umbraco:CMS:Global:UseHttps=false` in Development (zet `DisableTransportSecurityRequirement`). Dat is niet direct
  te vinden; de bron is `ConfigureOpenIddict.cs`.
- **Volgorde en lazy loading van workspace-views.** Het standaard edit-element wordt pas gedefinieerd als de Content-view
  één keer is geladen. Rechtstreeks `<umb-content-workspace-view-edit>` renderen gaf in de spike een leeg paneel. Via
  het manifest laden lost dat op en gebruikt alleen publieke API.
- **Tab-routes zijn lowercase** (`encodeFolderName("Blocks")` → `blocks`). Tests en navigatie gebruiken
  `encodeFolderName` uit `@umbraco-cms/backoffice/router` in plaats van de tabnaam letterlijk.
- **postMessage vóór de handshake zonder `*`.** De frontend kent de parent-origin nog niet. We posten `loaded` naar elke
  origin uit de allowlist. De browser levert alleen af bij de juiste, maar logt voor de andere een console-waarschuwing
  ("target origin … does not match"). Dat is onschuldig, maar wel zichtbaar.
- **Route van nooit-gepubliceerde documenten.** In preview is dat `/preview-{key}/`, en de Delivery API vindt die alleen
  mét gecodeerde schuine streep vooraan; een gewone pagina die met `preview-` begint, juist alleen zónder (D20).
- **Block-wijzigingen zijn niet live.** Pas na Update komen ze in het document, en de doorgifte naar het ouder-block is
  asynchroon. Een knop die meerdere niveaus bijwerkt, moet daarop wachten (D21).
- **Schijfruimte en Playwright-browserversies** op de ontwikkelmachine: niet inhoudelijk, wel tijdrovend.

## Wat niet kon in Umbraco 18, en de gekozen workaround

| Wens | Status in v18 | Workaround |
|---|---|---|
| Naar een specifieke property navigeren/focussen | Geen publieke API of route | Tab via de publieke structuur-API en tab-route; daarna `umb-property` (`.alias`) zoeken en het invoerveld in de (lui geladen) property-editor focussen, door shadow roots heen. Geïsoleerd in `backoffice/src/navigation.ts`. |
| Een specifiek block openen en een veld erin focussen | Block-workspace-modal heeft geen stabiele publieke URL | Het `umb-block-list-entry` (`.contentKey`) openen via zijn eigen edit-link en in het modal de property van het block focussen. Wachten tot de link bij de huidige route hoort (anders draait de router de navigatie terug), en de focus kort vasthouden (het modal zet zelf focus op het naamveld). Geneste blocks: hetzelfde, stap voor stap per modal (D19). |
| Geneste block-modals in één keer bijwerken en opslaan | Geen ingebouwde knop: per modal Update, daarna Save; sluiten zonder Update vraagt "Discard unsaved changes" | Eigen `workspaceAction` "Update & save" in de block-workspace, alleen publieke API (D21). |
| Een ander document bewerken vanuit de preview | Een workspace-modal kan (publieke API), maar toont bijna de hele interface | Navigeren naar dat document in Visual editing; het edit-verzoek overleeft het nieuwe view-exemplaar via een module-variabele (D18). |
| Metadata per item via een subclass | Serialisatie via interface-type, geen polymorfisme | JSON-contract-modifier + `ConditionalWeakTable` (DECISIONS D2). |
| Preview-cookies in een cross-site iframe | Third-party cookies (browserbeleid, niet Umbraco) | HMAC-token in de URL; Astro haalt server-side met de API-key op (D6). |
| Configuratie van preview-URL's per documenttype in appsettings | Bestaat niet; alleen code (`IUrlProvider`) | Eigen optie `VisualEditing:DocumentTypes` in de URL-provider. |

Er is geen afwijking van de vaste keuzes van de opdracht nodig geweest.

## Bekende beperkingen van de PoC

- Edit-metadata alleen voor top-level items. Geneste content via `expand` en Element Picker-/Library-elementen (nieuw
  in v18, eigen entiteit en workspace) krijgen nog geen metadata. Block Grid is buiten scope.
- Geneste Block Lists werken op elke diepte (getest met twee niveaus). Elk niveau opent een eigen modal. Met
  **Update & save** worden alle open blocks bijgewerkt en wordt het document opgeslagen in één klik (D21); Escape sluit
  ze één voor één.
- Nooit-gepubliceerde documenten hebben in preview de route `/preview-{key}/` (Umbraco). Kaarten op de homepage linken
  daar ook naar. Een gewone pagina-URL die met `preview-` gevolgd door een GUID begint, zou hiermee botsen (D20).
- `editMetadata.properties` bevat alle properties van het document, ook als `fields=` de output beperkt.
- Alleen invariant content getest. `culture` zit wel in metadata, protocol en navigatie (`/{culture}/view/…`).
- De e2e-test wijzigt de concepttitel van artikel A en zet die daarna terug. Gepubliceerde content wordt nooit aangeraakt.
- Het OpenAPI-schema van de Delivery API kan `editMetadata` als optioneel veld tonen (de modifier hangt aan dezelfde
  JSON-opties). Responses veranderen daar niet door.
- Klikken op links binnen bewerkbare elementen worden in edit-modus edit-verzoeken (de link wordt niet gevolgd).
  Navigeren binnen de preview gaat via niet-bewerkbare links (bijvoorbeeld het logo).
- Terwijl een modal open is, dekt de backdrop de preview af; de eerste klik daarop sluit het modal (standaard
  Umbraco-gedrag).
- Het preview-token geeft toegang tot de preview van alle documenten (niet aan één document gebonden) en verloopt na 60 minuten.

## Inschatting: wat is nodig voor productie

| Onderwerp | Werk | Inschatting |
|---|---|---|
| Robuuste property-/block-focus | Met Umbraco HQ afstemmen over een publieke API (bv. een "focus property"-methode op de workspace-context of een route per property/block); tot die tijd DOM-selectors per minor-versie testen. | 3–5 dagen + afhankelijkheid HQ |
| Metadata voor expansion, Element Picker/Library-elementen en Block Grid | Builder uitbreiden (geneste Block Lists werken al); `entityType: "element"` + navigatie naar de element-workspace. | 3–5 dagen |
| Varianten/culturen en segmenten | Testen met meerdere culturen; culture in URL-provider, Astro-routing en navigatie. | 3–4 dagen |
| Security-hardening | Token per document en gebruiker, korter levend, eventueel server-side intrekbaar; geheimen uit een secret store; CSP ook op de backoffice (`frame-src`); alleen HTTPS. | 3 dagen |
| Packaging | NuGet-pakket (C# + `App_Plugins` als static web assets), npm-pakket voor edit-script en Vue-helper, configuratiedocumentatie. | 4–5 dagen |
| Frontend-DX | Componentconventie afdwingen (lint-regel of storybook-check), descriptors automatisch doorgeven vanuit een block-renderer, overlay-styling en toegankelijkheid (toetsenbord, focus-ring). | 3–5 dagen |
| Hosting en CI | Tests in CI met tijdelijke database; Playwright tegen een staging-omgeving; versiepinning van Umbraco/Astro. | 2–3 dagen |

Totaal ruwweg **4–6 weken** voor één team, exclusief eventuele afstemming met Umbraco HQ over publieke focus-API's.
