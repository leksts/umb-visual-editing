# DECISIONS

Elke beslissing: wat, waarom, alternatieven, bron. Bronpaden verwijzen naar de Umbraco-broncode op tag `release-18.3.2`
(`github.com/umbraco/Umbraco-CMS`) tenzij anders vermeld.

## D1 – Umbraco 18.3.2 en Umbraco.Templates 18.3.2
- **Wat**: Umbraco.Cms 18.3.2 (nieuwste stabiele 18.x bij de start; 19 is beta/rc) op .NET 10, SQLite, unattended install
  met testgebruiker `editor@visualediting.test`.
- **Waarom**: vaste keuze van de opdracht. De nieuwste patch heeft de minste bekende bugs.
- **Bron**: `https://api.nuget.org/v3-flatcontainer/umbraco.cms/index.json`; `dotnet new umbraco --help`.

## D2 – Metadata via builder-decorator + JSON-contract-modifier (geen subclass, geen value converter)
- **Wat**: decorator op `IApiContentResponseBuilder` berekent `EditMetadata` en koppelt die via een
  `ConditionalWeakTable` aan de response-instantie. Een `JsonTypeInfo`-modifier op de Delivery API-`JsonOptions` schrijft
  `editMetadata` alleen als die gekoppeld is **en** het request in edit-modus is.
- **Waarom**: de content-structuur blijft ongewijzigd. Het werkt ook voor `PagedViewModel<IApiContentResponse>` (serialisatie via
  het interface-type), en gepubliceerde output blijft bytegelijk, want de property wordt niet geschreven.
- **Alternatieven**: (a) subclass van `ApiContentResponse`: werkt niet bij serialisatie via het interface-type, en polymorfisme
  aanzetten voegt `$type` toe; (b) metadata in `properties`: verandert de content-structuur; (c) response-header: te klein,
  en niet per item bij queries; (d) eigen controller/endpoint: dupliceert routing, start-item en culture-logica.
- **Bevestigd (fase 3)**: werkt voor `/item/{id}`, `/item/{path}`, `/items` en de query-endpoint (`/content`, met
  serialisatie via het interface-type). Integratietests vergelijken byte voor byte met een baseline die is opgenomen met de
  extensie uitgeschakeld.
- **Bron**: `src/Umbraco.Core/DeliveryApi/ApiContentResponseBuilder.cs`, `ApiContentBuilderBase.cs`,
  `src/Umbraco.Infrastructure/Serialization/ContentJsonTypeResolverBase.cs`,
  `src/Umbraco.Cms.Api.Delivery/DependencyInjection/UmbracoBuilderExtensions.cs` (r. 94-105);
  https://learn.microsoft.com/dotnet/standard/serialization/system-text-json/custom-contracts

## D3 – Edit-vlag als header `Visual-Editing: true`, alleen samen met preview + API-key
- **Waarom**: sluit aan bij de bestaande headers (`Preview`, `Api-Key`). Preview vereist al een geldige API-key
  (`ApiAccessService.HasPreviewAccess`), en preview-responses worden niet ge-output-cached
  (`DefaultDeliveryApiOutputCacheRequestFilter`).
- **Alternatieven**: query-parameter (komt in logs en caches terecht); aparte "edit"-API-key (meer configuratie, geen winst in een PoC).
- **Bron**: `src/Umbraco.Cms.Api.Delivery/Services/RequestPreviewService.cs`, `Services/ApiAccessService.cs`, `Caching/DefaultDeliveryApiOutputCacheRequestFilter.cs`.

## D4 – Metadata op documentniveau, ook voor blocks
- **Wat**: block-metadata (key, elementtype, ouder-property, index, pad) staat in `editMetadata.blocks` van het document,
  op content-key. De frontend koppelt via de bestaande `content.id` van het block-item.
- **Waarom**: block-elementen worden gebouwd door `IApiElementBuilder` in value converters met property-cache-level
  `Elements`/`Snapshot`. Die instanties kunnen tussen requests worden gedeeld, en de builder kent de ouder-property niet.
- **Bron**: `src/Umbraco.Infrastructure/PropertyEditors/ValueConverters/BlockListPropertyValueConverter.cs`
  (`GetDeliveryApiPropertyCacheLevel => Elements`).

## D5 – Iframe-URL uit een `IUrlProvider` ("additional preview environments")
- **Wat**: `VisualEditingUrlProvider` (alias `VisualEditing`) met `GetPreviewUrlAsync`, geregistreerd met
  `builder.AddUrlProvider<T>()`. Plus een `workspaceActionMenuItem` met kind `previewOption`. De workspace-view haalt de URL op
  via `GET /umbraco/management/api/v1/document/{id}/preview-url?providerAlias=VisualEditing`.
- **Waarom**: hergebruik van het officiële mechanisme. Eén bron voor de URL, voor zowel de preview-knop als het iframe.
- **Bron**: https://docs.umbraco.com/umbraco-cms/18.latest/reference/content-delivery-api/additional-preview-environments-support ;
  `src/Umbraco.Cms.Api.Management/Controllers/Document/DocumentPreviewUrlController.cs`;
  `src/Umbraco.Web.UI.Client/src/packages/preview/repository/preview.repository.ts`.

## D6 – Geen cookies voor preview: HMAC-token in de URL
- **Wat**: de URL-provider maakt `?preview=<exp>.<hmac>&ve=1` aan. Astro controleert de HMAC (gedeeld geheim) en de
  vervaltijd, en haalt daarna server-side met de API-key concept-content op.
- **Waarom**: cookies in een cross-site iframe zijn third-party cookies (SameSite=None, Partitioned, browserblokkades).
  Lokaal zou het werken (same-site), maar dan bewijst de PoC niets voor productie.
- **Alternatieven**: draft-mode-cookie (zoals Next.js), `SameSite=None; Secure; Partitioned`.
- **Bron**: https://developer.mozilla.org/docs/Web/Privacy/Guides/Privacy_sandbox/Partitioned_cookies ; MDN SameSite.

## D7 – Vue-conventie: prop `edit` + helper die een attributen-object teruggeeft
- **Wat**: elk content-component krijgt een optionele prop `edit?: EditDescriptor` en gebruikt
  `const e = useEdit(() => props.edit)` met `v-bind="e.root()"` / `v-bind="e.field('title')"`.
- **Waarom**: attributen horen bij de vnode-props, dus identiek in SSR, bij hydration en na re-renders. Props werken over
  Astro-eilandgrenzen heen (provide/inject niet). Zonder descriptor geeft de helper `{}` terug, dus de HTML is identiek.
- **Alternatieven**: directive met `getSSRProps` (registratie via `appEntrypoint`, attributen buiten de vnode om), provide/inject.
- **Bron**: https://vuejs.org/guide/scaling-up/ssr.html#custom-directives ; https://docs.astro.build/en/guides/framework-components/

## D8 – postMessage zonder `*`: "loaded" per toegestane origin
- **Wat**: de frontend kent een allowlist van parent-origins. `loaded` wordt naar elke origin uit de lijst gepost (de browser
  levert alleen af bij de echte parent-origin). Na `init` alleen nog naar die ene origin.
- **Waarom**: de opdracht verbiedt `*` na de handshake. Zo is `*` zelfs vóór de handshake niet nodig.
- **Bron**: https://developer.mozilla.org/docs/Web/API/Window/postMessage ; Prepr Toolkit `packages/toolkit/src/core/iframe-bridge.ts` (patroon, niet gekopieerd).

## D9 – Testopzet frontend: nep-parent op dezelfde server, vreemde origin via 127.0.0.1
- **Wat**: `web/src/pages/test/harness.astro` (alleen met `VE_TEST_HARNESS=1`) laadt een sitepagina in een iframe en speelt
  de backoffice. Voor "niet-toegestane origin" opent de test dezelfde nep-parent op `http://127.0.0.1:4321`: een andere
  origin op dezelfde server.
- **Waarom**: geen tweede server nodig. CSP `frame-ancestors` en de postMessage-allowlist zijn aparte instellingen
  (`VE_FRAME_ANCESTORS` / `VE_ALLOWED_PARENT_ORIGINS`), zodat de test kan aantonen dat het **script zelf** op origin filtert.
  Anders zou de CSP het iframe al blokkeren en test je alleen de CSP.
- **Alternatief**: een tweede statische server op een andere poort (meer bewegende delen).

## D10 – Bedieningselementen in bewerkbare elementen blijven werken
- **Wat**: klikken op `button, input, select, textarea, label, summary, [data-umb-edit-ignore]` binnen een bewerkbaar element
  gaan gewoon door. Alle andere klikken (ook op links) worden in edit-modus een edit-verzoek.
- **Waarom**: de "Kopieer citaat"-knop moet in de preview blijven werken, en zo is ook een re-render van het
  gehydrateerde component te testen. Links worden wel onderschept, omdat navigeren binnen de preview minder belangrijk is
  dan bewerken. Prepr en Sanity doen dit vergelijkbaar.

## D11 – Overlay in een eigen shadow root, één element
- **Wat**: één `<umb-ve-overlay>` met een open shadow root, `position: fixed`, `pointer-events: none`.
- **Waarom**: site-CSS en overlay-CSS raken elkaar niet. Er hoeft niets per element te worden toegevoegd, dus de DOM van de
  site (en daarmee de Vue-hydration) blijft ongemoeid.

## D12 – Twee URL-providers: met en zonder edit-modus
- **Wat**: `VisualEditing` (iframe in de workspace-view, `ve=1`) en `FrontendPreview` (de knop "Save and preview" in een
  nieuw venster, zonder edit-modus). Beide geven een URL `/preview/{documentKey}?preview=<token>`. Daar zoekt Astro de
  route op (ook voor nog nooit gepubliceerde documenten) en stuurt door.
- **Waarom**: in een los venster is er geen parent en zijn overlays zinloos. Via `/preview/{key}` hoeft de CMS de
  frontend-route niet te kennen.
- **Bron**: `IUrlProvider.GetPreviewUrlAsync`, `UrlInfo.FromUri` / `UrlInfo.AsMessage` (Umbraco.Core 18.3.2 XML-docs).

## D13 – Baseline voor "gepubliceerd blijft exact gelijk": live opgenomen met de extensie uit
- **Wat**: `scripts/record-baseline.mjs` start de CMS met `VisualEditing__Enabled=false` (de composer registreert niets),
  voert een vaste set requests uit (`tests/api/requests.mjs`) en slaat de ruwe responses op. Daarna start Playwright de
  CMS met de extensie aan en vergelijkt de tests byte voor byte.
- **Waarom**: dat is letterlijk "gelijk aan zonder de uitbreiding", zonder datums te normaliseren. Omdat de baseline elke
  run opnieuw wordt opgenomen, maakt het niet uit dat de e2e-test concept-content wijzigt.
- **Alternatieven**: vaste fixtures in git (breken na elke herinstallatie of contentwijziging); vergelijken met dezelfde
  request zonder header (bewijst niet dat de modifier zelf niets verandert).

## D14 – Lokaal `Umbraco:CMS:Global:UseHttps=false`
- **Wat**: in `appsettings.Development.json`. Daarmee zet Umbraco `OpenIddictServerAspNetCoreOptions.DisableTransportSecurityRequirement`.
- **Waarom**: zonder deze instelling weigert de backoffice-login over HTTP ("This server only accepts HTTPS requests").
  HTTPS lokaal zou betekenen dat een `http://localhost:4321`-iframe in een `https`-backoffice draait (mixed content), of
  dat Astro ook een certificaat nodig heeft. Alleen voor lokaal. In productie: alles via HTTPS.
- **Bron**: `src/Umbraco.Cms.Api.Common/Configuration/ConfigureOpenIddict.cs` (r. 26).

## D15 – Standaard content-editor naast de preview, geladen via het manifest van de Content-view
- **Wat**: de workspace-view (gewicht 150, dus na "Content" (200), zodat Content de standaard blijft) toont links het
  iframe en rechts de standaard Umbraco-editor. Die wordt gemaakt met `umbExtensionsRegistry.byAlias('Umb.WorkspaceView.Document.Edit')`
  + `createExtensionElement(manifest)` (publieke extension-API). Het element neemt de bestaande workspace- en
  dataset-contexten over, inclusief de tab-routes (`…/view/visual-editing/tab/{tab}`).
- **Waarom**: de redacteur bewerkt naast de preview, en de preview herlaadt na opslaan zonder weg te navigeren. Zo is
  e2e-stap 4 (titel wijzigen, iframe op dezelfde scrollpositie) letterlijk mogelijk. Er wordt geen intern element-tagname gebruikt.
- **Alternatieven**: `<umb-content-workspace-view-edit>` direct renderen (tag is niet geëxporteerd, en is pas gedefinieerd
  nadat de Content-view één keer is geladen; in de spike bleef het paneel leeg); naar de Content-view navigeren (dan
  verdwijnt de iframe).
- **Bron**: `documents/workspace/manifests.js` (alias, gewicht 200, kind `contentEditor`),
  `content/content/workspace/views/edit/content-editor.element.ts` (tab-routes), `@umbraco-cms/backoffice/extension-api`
  (`createExtensionElement`). Bevestigd met een spike in de draaiende backoffice.

## D16 – Navigatie naar tab, property, block en veld (bijgewerkt na feedback)
- **Wat**:
  - Tab via `workspace.structure.getPropertyStructureByAlias` + `getOwnerContainerById` (publiek); route
    `tab/{encodeFolderName(tabnaam)}` of `root`.
  - Veld van het document: `umb-property` met `.alias`, in beeld, en focus op het invoerveld *binnen* de property-editor
    (door shadow roots heen; er wordt gewacht tot de lui geladen editor er is).
  - Veld in een block: het `umb-block-list-entry` (`.contentKey`) wordt geopend via **zijn eigen edit-link** (dezelfde
    routed modal als een klik op het item). In dat modal krijgt de property van het block focus (bv. `author`).
  - Een net geopend modal zet zelf nog de focus op het naamveld, soms pas na meer dan een seconde. Eerst werd de focus
    ~1 s vastgehouden; dat was te kort (de e2e-test typte daardoor in de documentnaam). Nu bewaakt `guardFocus` de focus
    4 s lang en zet die direct terug (op `focusin`) zodra hij ongevraagd weggaat. Zelf klikken, Tab of Escape stopt de
    bewaking meteen.
- **Waarom**: de eerste versie markeerde alleen de Block List-property ("het hele blocks-object"). De redacteur wil
  direct in het juiste veld uitkomen. Er is geen publieke API om een block te openen of een property te focussen. De
  DOM-afhankelijkheid zit in één bestand (`backoffice/src/navigation.ts`).
- **Race**: de edit-link van een block wordt per route opgebouwd. Direct na een tab-navigatie wordt gewacht tot de link
  onder de huidige route valt, en volgt bij geen modal één nieuwe poging (zonder dit faalde de e2e-test af en toe).
- **Bron**: spike in de draaiende backoffice 18.3.2 (link `…/modal/umb-modal-workspace/invariant/{property}/block/edit/{key}/view/content`),
  `content-type-structure-manager.class.d.ts`.

## D18 – Element van een ander document: naar dat document in Visual editing (modal teruggedraaid)
- **Wat**: een klik op een element van een ander document (bv. een artikelkaart op de homepage) navigeert de
  backoffice naar dát document, in de weergave Visual editing. De preview toont dan de pagina van dat document en het
  veld krijgt focus. "Terug" in de browser brengt de redacteur in één stap terug (de tab-navigatie na het wisselen
  gebruikt `replaceState`). De frontend blijft in `ready` melden welke documenten op de pagina staan (`documentKeys`):
  wordt één ervan elders opgeslagen, dan herlaadt de preview.
- **Geschiedenis**: eerst navigeerde de backoffice naar het andere document in de standaard Content-weergave (de
  preview "sprong" mee). Daarna (na feedback) opende het document in een workspace-modal, zodat de preview bleef
  staan. Dat modal bleek bijna de hele Umbraco-interface te zijn (tabs Content/Visual editing/Info, breadcrumbs), en
  de content van het artikel staat niet op de homepage maar op de artikelpagina: navigeren is daar terecht. Op
  verzoek van de opdrachtgever teruggedraaid naar navigeren, nu wel naar Visual editing en met veldfocus.
- **Hoe**: het edit-verzoek wordt module-breed bewaard (`pendingEdit`, met tijdstempel, max. 15 s), want bij het
  wisselen van document maakt de workspace een nieuw exemplaar van de view. Alleen het exemplaar dat op de pagina
  staat handelt het af: wachten tot de editor properties toont (anders draait de router de tab-navigatie terug), dan
  tab en veld. `focusTarget` wacht tot het gevonden veld blijft staan (na een tab-navigatie bouwt de router de editor
  soms nog een keer op, en dan viel de focus terug naar body).
- **Alternatieven**: workspace-modal (vorige versie, te zwaar); een kale editor met alleen de velden in een modal
  (geen publieke API; zou weer op interne DOM leunen).

## D19 – Geneste blocks: platte metadata met ouder-verwijzing, pad in het edit-bericht
- **Wat**:
  - API: `EditMetadataBuilder` loopt Block List-properties van blocks recursief af. Alle blocks blijven in één platte
    dictionary `blocks` (opzoeken op de bestaande `content.id` blijft één stap). Nieuw veld `parentBlockKey`;
    `propertyAlias` is de Block List-property waarin het block staat; `path` wordt bv. `blocks[5].items[1]`.
  - Frontend: `blockEdit` bouwt het pad via `parentBlockKey` en rendert het als `data-umb-block-path` (alleen bij een
    genest block). `BlockList.astro` rendert geneste blocks recursief (`Astro.self`) in de slot van het Vue-component
    `CalloutBlock` ("Uitgelicht").
  - Protocol: `edit` krijgt optioneel `blockPath` (additief binnen versie 1). Blocks op het eerste niveau sturen
    precies hetzelfde bericht als voorheen.
  - Backoffice: `focusTarget` opent de blocks van het pad één voor één via hun eigen edit-link. In elk nieuw modal wordt
    de volgende Block List-property gezocht, en in het laatste modal het veld. Er wordt alleen gezocht in een modal dat
    *na* de klik is geopend, niet in het ouder-modal eronder.
  - Seed: element type `calloutBlock` ("Uitgelicht": titel + Block List `items` met tekstblokken en citaten), als
    zesde block in artikel A, met een tekstblok en een citaat erin.
- **Waarom**: vraag van de opdrachtgever ("ook als die dieper zit"). Een platte lijst met ouder-verwijzing houdt de
  frontend-koppeling eenvoudig en maakt elk niveau diep mogelijk zonder het formaat te wijzigen.
- **Alternatieven**: geneste `blocks` per block in de metadata (zoeken wordt recursief); het pad laten afleiden door de
  backoffice (die heeft de metadata niet).
- **Bron**: spike in de draaiende backoffice 18.3.2: de edit-link van een genest item valt onder de route van het
  ouder-modal (`…/block/edit/{ouder}/…/block/edit/{kind}/…`), dus dezelfde wachtregel als bij D16 werkt.

## D20 – Nooit-gepubliceerde documenten: route `/preview-{key}/` met schuine streep opvragen
- **Probleem**: de preview van een document dat nog nooit is gepubliceerd gaf "Niet gevonden". De Delivery API geeft
  zo'n document in preview de tijdelijke route `/preview-{key}/`. De frontend haalde bij het opvragen op route de
  schuine streep vooraan weg, en zonder die streep geeft de API 404.
- **Wat**: `getContentByRoute` stuurt alleen voor routes van precies die vorm (`/preview-` + GUID) het pad mét
  gecodeerde streep (`%2Fpreview-{key}%2F`). Alle andere routes gaan zoals voorheen zonder streep.
- **Waarom niet altijd met streep**: dan wordt elk pad dat met `/preview-` begint als zo'n tijdelijke route opgevat. De
  gewone pagina `/preview-zonder-cookies/` gaf dan 404 (gezien in de tests).
- **Bron**: spike tegen de draaiende Delivery API (18.3.2): `preview-{key}/` → 404, `%2Fpreview-{key}%2F` → 200,
  `%2Fpreview-zonder-cookies%2F` → 404, en zonder `Preview`-header ook 404 (dus niets zichtbaar in de gepubliceerde API).

## D21 – Knop "Update & save" in block-modals
- **Probleem**: bij geneste blocks staan meerdere block-modals open. Een wijziging komt pas in het document na
  **Update** per modal, en de Save-knop van het document zit achter de modals: Update, Update, Save. Sluiten zonder
  Update (Escape, routewissel) vraagt "Discard unsaved changes" (spike: block-wijzigingen zijn niet live).
- **Wat**: een eigen `workspaceAction` (publiek extensiepunt, conditie `Umb.Workspace.Block`) naast Update. Die doet
  `requestSubmit()` op elk open block van binnen naar buiten (precies wat Update doet: valideren, de waarde naar het
  ouder-block schrijven, modal sluiten) en daarna `requestSave()` op het document (precies wat Save doet). De preview
  herlaadt daarna vanzelf (D17).
  - Het ouder-block wordt gevonden met een `UmbContextConsumer` met `skipHost()` vanaf het block-workspace: modals
    erven de contexten van het element dat ze opende. Losse consumers moeten zelf `request()` aanroepen.
  - Het document-workspace heeft dezelfde context-alias als het block-workspace; zonder `passContextAliasMatches()`
    wordt het niet gevonden (de knop bleef dan uitgeschakeld). Buiten een document blijft de knop uitgeschakeld.
  - Na elke submit wordt gewacht tot de data van het ouder-block (of het document) echt is bijgewerkt: dat gebeurt
    asynchroon via de property-editor. Zonder wachten werd de oude waarde opgeslagen (gezien in de spike).
  - Faalt de validatie van een block, dan stopt de reeks en blijft dat modal open met de meldingen.
- **Alternatieven**: inline-modus van de Block List (geen modals; getest en werkend, maar geldt voor alle redacteuren
  en vraagt aanpassing van de navigatie); alle modals sluiten via de route (gooit wijzigingen weg).
- **Bekend**: `getHasUnpersistedChanges()` van Umbraco logt een console-waarschuwing ("Changes detected based on JSON
  comparison …") per block. Onschuldig.
- **Bron**: `block/workspace/manifests.js` (Update = `UmbSubmitWorkspaceAction` → `requestSubmit`),
  `block-workspace.context.js` (`submit`), `submittable-workspace-context-base.js`, `content-detail-workspace-base.js`
  (`requestSave`), `context-consumer.js` (`skipHost`, `request`, `asPromise`).

## D22 – Visual editing als eerste weergave, alleen bij documenten met een frontend-preview
- **Probleem**: navigeren in de contentboom opende steeds de weergave Content; Umbraco opent altijd de eerste
  weergave (laagste positie = hoogste `weight`). Dat geldt voor elke weergave (ook Info).
- **Wat**: `weight: 250` (vóór Content, 200), plus een eigen condition `VisualEditing.Condition.HasFrontendPreview`. Die
  vraagt via dezelfde URL-provider als de view of het document een frontend-preview heeft (`VisualEditing:DocumentTypes`
  in de CMS-config, en het document moet opgeslagen zijn). Zo blijft Content de eerste weergave voor documenttypes
  zonder frontend.
- **Alternatief**: de laatst gekozen weergave onthouden en bij openen omleiden. Afgewezen: dat vraagt het onderscheppen
  van Umbraco's routering (interne werking) en geeft een zichtbare sprong.
- **Bron**: `core/extension-registry/conditions/switch.condition.js` (UmbConditionBase); spike: document openen via
  `…/edit/{key}` en via de boom → Visual editing actief.

## D23 – Modi live / preview / edit, gedrag per blocktype, CSP als vangnet
- **Waarom**: sommige componenten moeten in preview of edit-modus iets anders doen: geen tracking, geen echte acties,
  geen externe verzoeken bij elke save, verborgen inhoud bereikbaar. Andere platforms (Sanity `useIsPresentationTool`,
  Builder `isEditing`/`isPreviewing`, Next.js `draftMode`) geven alleen een modus-signaal; de keuze ligt bij het
  component. Hier wordt die keuze per blocktype expliciet en op één plek vastgelegd.
- **Wat**:
  - `web/src/lib/render-mode.ts`: modus (`live` | `preview` | `edit`) uit de server-side preview-context, dus SSR en
    hydration zien dezelfde waarde. Per blocktype een `BlockPolicy` (`preview` en `edit`: `live` | `readonly` |
    `static` | `placeholder`). Zonder regel: preview `readonly`, edit `static`.
  - `BlockList.astro` geeft `mode`/`behavior` door; `placeholder` rendert het component niet.
  - Voorbeelden: `FaqBlock` (in edit-modus open en zonder `<summary>`, anders kun je het antwoord niet aanklikken) en
    `ExchangeRateBlock` (externe API: live en preview ophalen, edit-modus een vaste voorbeeldwaarde).
  - Vangnet: CSP `connect-src` in preview (`'self'` + `VE_PREVIEW_CONNECT_SRC`, standaard de origin van de koers-API) en
    in edit-modus (alleen `'self'`). Een component dat zich niet aan zijn afspraak houdt, faalt zichtbaar. Live
    ongewijzigd.
  - Seed-upgrade (`ApplyUpgradesAsync`): de twee blocktypes en blocks in artikel B worden ook aan een bestaande database
    toegevoegd, zodat eigen content blijft staan.
- **Niet gedaan**: analytics uitzetten buiten live (hoort in de layout, er is geen analytics in de PoC); een schakelaar
  Bewerken/Bekijken in de backoffice.

## D24 – "+" boven en onder een block in de preview: Umbraco's eigen invoegflow
- **Wat**: het edit-script toont bij een block (ook bij hover op een veld erin) twee "+"-knoppen in de overlay. Een
  klik stuurt `add` (optioneel bericht, additief binnen protocolversie 1: velden zoals `edit` plus `position`). De
  backoffice opent de tab, bij een genest block eerst de ouder-blocks, en volgt dan in de Block List de link van
  Umbraco's eigen invoegknop: vóór elk item een "inline create"-knop met `…/_catalogue/create/{index}`, aan het eind
  `…/create/-1`. Daarna is het de gewone flow: blocktype kiezen, invullen, Create (of Update & save).
- **Waarom**: dezelfde keuzes, validatie en blocktypes als in de editor; niets eigens om te onderhouden behalve het
  vinden van de link (net als de edit-link bij blocks, D16).
- **Bron**: `block-list/property-editors/block-list-editor/property-editor-ui-block-list.element.js`
  (`#renderInlineCreateButton`, `#renderCreateButton`), `block-list/context/block-list-entries.context.js`
  (`getPathForCreateBlock`). Spike: "+" onder het citaat → Tekstblok → Update & save → nieuw block op index 3.
- **Beperking**: alleen blocks in een Block List; nieuwe documenten (bv. een artikel onder Home) niet.

## D17 – Herladen na opslaan: `UmbEntityUpdatedEvent` op de action-event-context
- **Wat**: de view luistert via `UMB_ACTION_EVENT_CONTEXT` naar `UmbEntityUpdatedEvent.TYPE` voor de eigen `unique`.
  Daarna volgen `getScroll`, een nieuwe preview-URL (vers token) met cache-buster, `init` met de scrollpositie en dan `ready`.
- **Bron**: `content/content/workspace/content-detail-workspace-base.ts` (`#update` → `#dispatchActionEvents`).
