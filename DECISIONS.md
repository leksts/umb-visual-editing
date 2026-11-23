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

## D16 – Navigatie naar tab, property en block
- **Wat**: de tab wordt bepaald via `workspace.structure.getPropertyStructureByAlias` + `getOwnerContainerById` (publiek),
  en de route is `tab/{encodeFolderName(tabnaam)}` of `root`. De property en het block-item worden gezocht door shadow roots
  heen (`umb-property` met `.alias`, `umb-block-list-entry` met `.contentKey`), en daarna scrollen we ze in beeld, markeren we ze
  en focussen we het invoerveld. Bij een ander document: navigeren naar diens `…/view/visual-editing`, met het focusdoel in
  `sessionStorage`.
- **Waarom**: er is geen publieke API om op een property te focussen of een block te openen. De DOM-afhankelijkheid zit
  in één functie (`backoffice/src/navigation.ts: focusProperty`).
- **Bron**: spike (DOM bekeken in de draaiende backoffice 18.3.2), `content-type-structure-manager.class.d.ts`.

## D17 – Herladen na opslaan: `UmbEntityUpdatedEvent` op de action-event-context
- **Wat**: de view luistert via `UMB_ACTION_EVENT_CONTEXT` naar `UmbEntityUpdatedEvent.TYPE` voor de eigen `unique`.
  Daarna volgen `getScroll`, een nieuwe preview-URL (vers token) met cache-buster, `init` met de scrollpositie en dan `ready`.
- **Bron**: `content/content/workspace/content-detail-workspace-base.ts` (`#update` → `#dispatchActionEvents`).
