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
