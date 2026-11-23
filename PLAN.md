# PLAN – Visual Editing PoC voor headless Umbraco 18

Status: opgesteld in fase 0; bijgewerkt na fase 4 (bevestigingen uit spikes staan in DECISIONS.md D2, D14–D17). Antwoorden zijn gebaseerd op de broncode van Umbraco **18.3.2** (tag `release-18.3.2` van
`github.com/umbraco/Umbraco-CMS`, lokaal verkend) en de documentatie op `docs.umbraco.com/umbraco-cms/18.latest/`.
Waar een antwoord nog niet met een draaiende spike is bevestigd, staat dat erbij. In `DECISIONS.md` staat per keuze de
uiteindelijke bevestiging.

Gebruikte versies: Umbraco 18.3.2 op .NET 10 (SDK 10.0.404), Astro 7.4, @astrojs/vue 7.1, Vue 3.5, @astrojs/node 11.1,
Playwright 1.65.1, Node 26.

---

## 1. Antwoorden op de verkenningsvragen

### 1.1 Delivery API-response uitbreiden, alleen voor preview

**Extensiepunten die er zijn** (bron: `src/Umbraco.Core/DeliveryApi/*`, `src/Umbraco.Cms.Api.Delivery/*`):

| Extensiepunt | Wat het doet | Geschikt? |
|---|---|---|
| `IApiContentResponseBuilder` (`ApiContentResponseBuilder : ApiContentBuilderBase<IApiContentResponse>`) | Bouwt elk top-level content-item (`/item/{id}`, `/item/{path}`, `/items`, query `/content`). Maakt per request een nieuw object (`new ApiContentResponse(...)`). | **Ja**: hier zitten alle gegevens (`IPublishedContent`) om metadata te berekenen. |
| `IApiContentBuilder` / `IApiElementBuilder` | Bouwen geneste content (expansion) en block-elementen. | Gedeeltelijk: block-elementen kennen hun ouder-property niet. De resultaten kunnen in de property-cache belanden (cache level `Elements`/`Snapshot`), dus geen veilige plek om per-request data aan te hangen. |
| `IOutputExpansionStrategy` | Bepaalt welke properties worden uitgevoerd (`expand`/`fields`). | Nee: alleen property-selectie, geen extra data naast `properties`. |
| `IDeliveryApiPropertyValueConverter` | Per editor de API-waarde. | Nee: zou de property-waarde zelf veranderen ("content-structuur verandert niet"). |
| JSON-serializer: named `JsonOptions` `Constants.JsonOptionsNames.DeliveryApi` met `DeliveryApiJsonTypeResolver` (`UmbracoBuilderExtensions.AddDeliveryApi`, r. 94-105) | Bepaalt hoe de modellen worden geserialiseerd. | **Ja, in combinatie**: een `JsonTypeInfo`-modifier kan een extra JSON-property toevoegen die alleen wordt geschreven als er metadata is. |

**Probleem met subclassen**: `ApiContentResponse` subclassen met een extra property werkt niet overal. In de query-endpoint
(`PagedViewModel<IApiContentResponse>`) wordt via het gedeclareerde interface-type geserialiseerd, en de
`DeliveryApiJsonTypeResolver` configureert geen polymorfisme. Een extra property op een subclass verschijnt dan niet. Polymorfisme
aanzetten zou een `$type`-discriminator toevoegen en daarmee de gepubliceerde output veranderen.

**Gekozen aanpak** (spike in fase 3 bevestigt dit):
1. Decorator op `IApiContentResponseBuilder`. Die roept de standaardbuilder aan en berekent, **alleen** als het request een
   preview-request in edit-modus is, een `EditMetadata`-object uit het `IPublishedContent`. Dat object wordt via een
   `ConditionalWeakTable<IApiContentResponse, EditMetadata>` aan de response-instantie gekoppeld. Het response-object zelf
   verandert niet.
2. Een `JsonTypeInfo`-modifier op de Delivery API-`JsonOptions` voegt aan alle typen die `IApiContentResponse` implementeren
   (inclusief het interface zelf) een property `editMetadata` toe. Met `ShouldSerialize` wordt die alleen geschreven als er
   metadata gekoppeld is **en** het huidige request in edit-modus is (dubbele borging).
3. Gepubliceerde requests en preview-requests zonder edit-vlag raken de tabel nooit, dus de bytes zijn identiek.

Bron: `ApiContentResponseBuilder.cs`, `ApiContentBuilderBase.cs`, `ContentJsonTypeResolverBase.cs`,
`Umbraco.Cms.Api.Delivery/DependencyInjection/UmbracoBuilderExtensions.cs`. System.Text.Json contract-customization:
https://learn.microsoft.com/dotnet/standard/serialization/system-text-json/custom-contracts

### 1.2 Preview-request herkennen en een edit-vlag toevoegen

- Preview = header `Preview: true` (`RequestPreviewService.IsPreview()`, `Umbraco.Cms.Api.Delivery/Services/RequestPreviewService.cs`).
- Preview vereist altijd een geldige `Api-Key`-header (`ApiAccessService.HasPreviewAccess() => HasValidApiKey()`). De key wordt
  ingesteld via `Umbraco:CMS:DeliveryApi:ApiKey`. Doc: https://docs.umbraco.com/umbraco-cms/18.latest/reference/content-delivery-api (sectie *Preview*).
- Preview-responses worden nooit in de output-cache gezet (`DefaultDeliveryApiOutputCacheRequestFilter`: `IsPreview() is false && HasPublicAccess()`).
- **Edit-vlag**: een eigen header `Visual-Editing: true`. Edit-modus geldt alleen als `IRequestPreviewService.IsPreview()`
  **en** `IApiAccessService.HasPreviewAccess()` **en** de header aanwezig is. Een header past bij de bestaande conventie
  (`Preview`, `Api-Key`, `Accept-Language`, `Start-Item`) en vervuilt geen query-strings.
  Alternatief overwogen: query-parameter `?edit=true` (zichtbaar in logs/caches) en een aparte API-key (overkill voor een PoC).

### 1.3 Blocks in de Delivery API-output (v18)

- Block List: `ApiBlockListModel { items: ApiBlockItem[] }`, `ApiBlockItem { content: IApiElement, settings: IApiElement? }`.
  `content.id` is de **content-key van het block** (`BlockItem.Content.Key`, via `CreateApiBlockItem(IApiElementBuilder)`;
  `BlockListPropertyValueConverter.ConvertIntermediateToDeliveryApiObject`). Block Grid voegt `areas`, `rowSpan`, `columnSpan` toe.
- Block-data wordt opgeslagen als `{ layout, contentData[], settingsData[], expose[] }` (`BlockValue`/`BlockListValue` in
  `src/Umbraco.Core/Models/Blocks`). Sinds v15 bepaalt `expose` welke blocks per culture zichtbaar zijn. Een block zonder
  `expose`-entry verschijnt niet in de API. Dat is relevant voor de seed.
- Keys om een block terug te vinden in de backoffice: de **content-key** (en eventueel settings-key) plus de **alias van de
  property** op het document. De backoffice opent een block via de block-workspace-modal die per property-editor op een
  route onder de property hangt. Daar is geen stabiele publieke URL voor (zie 1.5).
- **Elements/Library (nieuw in v18)**: er is een apart entiteitstype *element* (globale bibliotheek met herbruikbare
  elementen) met een eigen `IPublishedElementCache` en een *Element Picker* (`ElementPickerValueConverter`), die in de API
  `IApiElement[]` uitvoert. Zulke elementen zijn **geen** blocks van het document: ze hebben een eigen key en workspace
  (`src/Umbraco.Web.UI.Client/src/packages/elements`, `.../library`). In de metadata moeten ze daarom als aparte entiteit
  (type `element`) worden gemarkeerd, met navigatie naar de element-workspace. De seed gebruikt alleen een Block List, conform
  de opdracht. Element Picker-ondersteuning staat als risico/vervolg in FINDINGS.

### 1.4 Eigen weergave in de document-workspace

- Manifesttype **`workspaceView`** met conditie `Umb.Condition.WorkspaceAlias` = `Umb.Workspace.Document`, en `meta: { label, pathname, icon }`.
  Bron: `examples/workspace-view-hint/index.ts`, doc https://docs.umbraco.com/umbraco-cms/18.latest/customizing/extending-overview/extension-types/workspaces/workspace-views
- Document-key: `UMB_DOCUMENT_WORKSPACE_CONTEXT` (`unique`-observable) uit `@umbraco-cms/backoffice/document`.
- Culture: de view zit binnen de variant van de split-view, dus `UMB_PROPERTY_DATASET_CONTEXT.getVariantId().culture`
  (null = invariant). Bevestigd voor invariant content.
- Preview-URL: de Management API-endpoint `GET /umbraco/management/api/v1/document/{id}/preview-url?providerAlias=…&culture=…`
  (`DocumentPreviewUrlController`), in de client beschikbaar als `DocumentService.getDocumentByIdPreviewUrl` uit
  `@umbraco-cms/backoffice/external/backend-api` (zo gebruikt door `UmbPreviewRepository`). Dat geeft de URL van de
  server-side `IUrlProvider` met de opgegeven alias (zie 1.7).

### 1.5 Navigeren naar een ander document, tab of property

- Documentroute: `UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateAbsolute({ unique })` (`documents/documents/paths.ts`),
  gevolgd door de variant-segment (`invariant` of culture) en `view/{pathname}`. Navigeren gaat met `history.pushState`;
  de Umbraco-router (`umb-router-slot`) luistert naar `popstate`/`pushState`.
- Tab: de content-editor (`umb-content-workspace-view-edit`, `content/content/workspace/views/edit/content-editor.element.ts`)
  maakt routes `tab/{encodeFolderName(tabName)}` en `root` (properties zonder tab). Een tab is dus te adresseren via de URL.
- Property: er is **geen** publieke API om op een property te focussen. Beste haalbare alternatief: na navigatie naar de
  juiste tab het `umb-property`-element met de juiste alias opzoeken (door shadow roots heen) en `scrollIntoView()` +
  focus + tijdelijke markering. Dat hangt af van interne DOM-structuur. Het is een risico en staat daarom geïsoleerd in één functie.
- Block: geen stabiele publieke URL voor de block-workspace-modal. Uitgevoerd: het block-item zoeken en openen via zijn
  eigen edit-link, en in het modal het veld van het block focussen (DECISIONS.md D16).
- Ander document: openen in een workspace-modal via `UmbModalRouteRegistrationController` + `UMB_WORKSPACE_MODAL`
  (DECISIONS.md D18), zodat de preview blijft staan.

### 1.6 Weten dat het document is opgeslagen

Na een geslaagde save dispatcht `UmbContentDetailWorkspaceContextBase.#update` (`content-detail-workspace-base.ts`) via
`UMB_ACTION_EVENT_CONTEXT` een `UmbRequestReloadStructureForEntityEvent` en een **`UmbEntityUpdatedEvent`**
(`{ unique, entityType, eventUnique }`). De extensie luistert op de action-event-context naar `UmbEntityUpdatedEvent` voor de
eigen `unique` en herlaadt dan de iframe. Alternatief: `persistedData` van de workspace-context observeren (vuurt ook bij
het laden en bij reloads, en is dus minder precies).

### 1.7 "Additional preview environments" hergebruiken

v18 (doc: https://docs.umbraco.com/umbraco-cms/18.latest/reference/content-delivery-api/additional-preview-environments-support):
- Server: een `IUrlProvider` met `Alias` en `GetPreviewUrlAsync(IContent, culture, segment)`, geregistreerd met
  `builder.AddUrlProvider<T>()`.
- Client: een `workspaceActionMenuItem` met kind `previewOption` en `meta.urlProviderAlias`. Die verschijnt in het menu
  bij "Save and preview".
- Er is geen configuratie per documenttype in appsettings. Per-documenttype-logica zit in de `IUrlProvider`-code.

**Hergebruik**: ja. Wij registreren één `IUrlProvider` (alias `VisualEditing`) die de frontend-URL per documenttype
bepaalt (configuratie in `appsettings`: basis-URL en documenttypes). De workspace-view vraagt via de standaard
preview-url-endpoint dezelfde URL op, en we registreren ook een `previewOption`, zodat redacteuren de preview in een nieuw
venster kunnen openen. Het iframe gebruikt dus exact dezelfde bron als de standaard preview-knop.

### 1.8 CSP / frame-ancestors en cookies

- Umbraco 18 stuurt standaard geen CSP- of `X-Frame-Options`-headers voor de backoffice (gecontroleerd met `curl -D -`
  op `/umbraco/`). De backoffice mag dus een iframe naar Astro openen, zonder `frame-src`-aanpassing. Wie in productie een
  CSP op de backoffice zet, moet `frame-src <frontend-origin>` toevoegen.
- Astro moet framen toestaan: op preview-responses `Content-Security-Policy: frame-ancestors 'self' <backoffice-origins>`.
  Gepubliceerde pagina's krijgen `frame-ancestors 'self'`.
- **Cookies**: lokaal zijn `localhost:17575` en `localhost:4321` *same-site* (poort telt niet mee voor "site"), dus
  `SameSite=Lax` zou werken. In productie (andere registrable domains) wordt een cookie in een cross-site iframe een
  third-party cookie: dan is `SameSite=None; Secure`, en met het uitfaseren van third-party cookies ook `Partitioned` (CHIPS),
  nodig. **Keuze**: geen cookies. Preview en edit-modus komen via de iframe-URL (`?preview=<token>&ve=1`), met een
  HMAC-token met vervaltijd dat de URL-provider in Umbraco aanmaakt en Astro controleert. Interne links binnen het iframe
  krijgen de parameters via het edit-script mee.

### 1.9 Edit-attributen in Vue (SSR + hydration)

- Astro rendert Vue server-side via `@vue/server-renderer`. Componenten zonder `client:*` blijven statische HTML. Componenten
  met `client:*` worden eilanden (aparte Vue-apps), en hun props worden geserialiseerd naar de client.
- **Prop** is de enige vorm die over eilandgrenzen heen werkt: `provide/inject` stopt bij een eilandgrens, want elk eiland
  is een eigen app.
- **Directive** (`v-edit`): werkt in SSR alleen met `getSSRProps`, moet in de Astro `appEntrypoint` worden geregistreerd en
  zet attributen buiten de vnode-props om (risico op hydration-mismatch en overschrijven bij re-render).
- **Helper/composable die een attributen-object teruggeeft** (`v-bind="edit.field('title')"`): de attributen horen bij de
  vnode-props. Vue rendert ze dus identiek in SSR, hydrateert ze zonder mismatch en behoudt ze bij re-renders. Zonder
  descriptor geeft de helper `{}` terug, en `v-bind="{}"` rendert niets: productie-HTML blijft identiek.
- **Keuze**: optionele prop `edit` (descriptor) + helper `useEdit(props.edit)` met `.root()` / `.field(alias)`.
  Bron: Vue SSR-docs over custom directives (https://vuejs.org/guide/scaling-up/ssr.html#custom-directives) en Astro
  framework components (https://docs.astro.build/en/guides/framework-components/).

---

## 2. postMessage-protocol (versie 1)

Alle berichten: `{ source: "umbraco-visual-editing", version: 1, type: "...", ...payload }`. Berichten met een andere
`source` of een onbekende `version` worden genegeerd.

| # | Richting | `type` | Payload | Regels |
|---|---|---|---|---|
| 1 | frontend → parent | `loaded` | `{ url }` | Het enige bericht vóór de handshake. Wordt verstuurd met `targetOrigin` = elke geconfigureerde toegestane parent-origin (nooit `*`). Alleen de origin die echt de parent is, ontvangt het. |
| 2 | parent → frontend | `init` | `{ editMode: boolean, scroll?: { x, y } }` | Frontend accepteert alleen als `event.source === window.parent` en `event.origin` in de allowlist staat. Daarna onthoudt hij die origin. Alle volgende berichten gaan alleen naar die origin, en alleen berichten van die origin worden geaccepteerd. Een tweede `init` van een andere origin wordt genegeerd. |
| 3 | frontend → parent | `ready` | `{ url, editMode, documentKeys? }` | Bevestiging van de handshake (na herstel van de scrollpositie). `documentKeys` (later toegevoegd, additief): documenten met bewerkbare elementen op de pagina; opslaan van één ervan herlaadt de preview. |
| 4 | frontend → parent | `edit` | `{ documentKey, culture, propertyAlias, blockKey?, blockPropertyAlias?, entityType: "document" }` | Bij een klik op een bewerkbaar element in edit-modus. |
| 5 | parent → frontend | `getScroll` | `{ requestId }` | Vlak vóór herladen. |
| 6 | frontend → parent | `scroll` | `{ requestId, x, y }` | Antwoord op 5. |

De parent (backoffice) accepteert alleen berichten met `event.source === iframe.contentWindow` en een `event.origin` die
gelijk is aan de origin van de preview-URL **en** in de server-geconfigureerde allowlist staat.

Herladen na opslaan: `getScroll` → `scroll` (time-out 500 ms, dan de laatst bekende waarde) → iframe-`src` opnieuw zetten →
`loaded` → `init { editMode: true, scroll }` → de frontend herstelt de scrollpositie (opnieuw na `load` van afbeeldingen) →
`ready`.

## 3. Edit-metadata in de API-response

Alleen bij `Preview: true` + geldige `Api-Key` + `Visual-Editing: true`. Naast de bestaande velden van het item, die
ongewijzigd blijven:

```json
{
  "contentType": "article",
  "name": "…", "createDate": "…", "updateDate": "…", "route": { … }, "id": "…",
  "properties": { … ongewijzigd … },
  "cultures": { },
  "editMetadata": {
    "version": 1,
    "entityType": "document",
    "documentKey": "8a2c…",
    "documentType": "article",
    "culture": null,
    "properties": {
      "title":  { "alias": "title",  "label": "Titel", "editorAlias": "Umbraco.TextBox", "tab": "Inhoud" },
      "blocks": { "alias": "blocks", "label": "Blocks", "editorAlias": "Umbraco.BlockList", "tab": "Blocks" }
    },
    "blocks": {
      "<block content key>": {
        "blockKey": "<block content key>",
        "settingsKey": null,
        "elementType": "quoteBlock",
        "propertyAlias": "blocks",
        "path": "blocks[1]",
        "index": 1,
        "properties": {
          "quote":  { "alias": "quote",  "label": "Citaat", "editorAlias": "Umbraco.TextArea" },
          "author": { "alias": "author", "label": "Auteur", "editorAlias": "Umbraco.TextBox" }
        }
      }
    }
  }
}
```

In de frontend wordt dit omgezet naar een **edit-descriptor** per component en naar data-attributen:

| Attribuut | Betekenis |
|---|---|
| `data-umb-doc` | document-key |
| `data-umb-culture` | culture (weggelaten bij invariant) |
| `data-umb-prop` | property-alias op het document (bij blocks: de Block List-property) |
| `data-umb-block` | content-key van het block (alleen bij blocks) |
| `data-umb-block-prop` | property-alias binnen het block |
| `data-umb-label` | label voor de overlay |

## 4. Architectuur en repository-indeling

```
cms/VisualEditing.Cms/          Umbraco 18-site (SQLite, unattended)
  VisualEditing/                C#: edit-metadata, URL-provider, seed, composer
  App_Plugins/VisualEditing/    build-output van de backoffice-extensie
backoffice/                     TypeScript-bron van de backoffice-extensie (Vite, lib-build)
web/                            Astro 7 SSR + Vue 3
  src/edit/                     edit-script (vanilla TS), protocol, attribute-helper
shared/protocol.ts              berichttypes, gedeeld door web en backoffice
tests/                          Playwright: api-, frontend- en e2e-projecten
scripts/                        dev-/test-orchestratie (één commando start alles)
```

## 5. Risico's

1. **Interne DOM van de backoffice** voor focus op een property (`umb-property`, shadow roots) en voor block-markering.
   Geen publieke API, dus het kan per minor-versie breken. Daarom geïsoleerd in één functie met fallback naar alleen de tab.
2. **Standaard editor naast de iframe** (spike, opgelost): de tag `umb-content-workspace-view-edit` direct renderen
   werkte niet (lazy gedefinieerd). Via het manifest van de Content-view en `createExtensionElement` werkt het wel, met
   alleen publieke API (DECISIONS.md D15).
3. **Property-caching van block-elementen**: metadata nooit aan block-`IApiElement`-instanties hangen (mogelijk gedeeld
   tussen requests). Daarom berekenen we alles op documentniveau.
4. **OpenAPI-schema**: de JSON-modifier kan `editMetadata` als optioneel veld in het Delivery API-schema laten verschijnen.
   Dat is geen wijziging van responses, maar wel zichtbaar voor clientgenerators.
5. **Expansion/geneste content** (`expand=properties[...]`): geneste content-items krijgen in deze PoC geen metadata.
6. **Third-party cookies in productie** (zie 1.8): vermeden door URL-tokens. Dat vraagt wel om token-propagatie voor
   interne links en een korte levensduur van het token.
7. **Element Picker / Library-elementen** (nieuw in v18): vergen een andere navigatie (element-workspace). Buiten de seed.
8. **Scroll-herstel na herladen** kan verspringen door afbeeldingen die later laden. Daarom herstellen we opnieuw na `load`.
9. **Versies**: Astro 7 en Vite 8 zijn nieuw. SSR zonder hydration voor niet-interactieve Vue-componenten werkt
   (fase 1-test: precies één `astro-island`).
11. **Login over HTTP** (ontdekt in fase 4): OpenIddict weigert HTTP tenzij `Global:UseHttps=false` (DECISIONS.md D14).
10. **Schijfruimte** op de ontwikkelmachine (al eens 0 MB vrij): de build-artefacten zo klein mogelijk houden.

## 6. Fasering en eindstrepen

Zie de opdracht. Per fase één commit met een samenvatting. Tests:
- `npm run test:api`: integratietests tegen de Delivery API, inclusief een baseline die wordt opgenomen met de extensie
  **uitgeschakeld** (`VisualEditing:Enabled=false`, de composer registreert dan niets) en byte-voor-byte wordt vergeleken.
- `npm run test:web`: Playwright voor frontend en protocol (nep-parent).
- `npm run test:e2e`: Playwright door de backoffice heen.
- `npm test`: alles.
