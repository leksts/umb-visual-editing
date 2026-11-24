# Visual Editing voor headless Umbraco 18 – proof of concept

Redacteuren zien in de Umbraco-backoffice de frontendpagina naast het document, zien bij hover welke elementen
bewerkbaar zijn, klikken op een element en komen uit bij het juiste document, de juiste tab en de juiste property (en het
juiste block). Na opslaan herlaadt de preview op dezelfde scrollpositie.

Zonder stega: de Delivery API stuurt in preview + edit-modus expliciete `editMetadata` mee, en Vue-componenten
renderen die als `data-umb-*`-attributen.

| Onderdeel | Map |
|---|---|
| Umbraco 18.3.2 (.NET 10, SQLite, unattended) + Delivery API-uitbreiding, URL-provider en seed | `cms/VisualEditing.Cms` (`VisualEditing/`) |
| Backoffice-extensie (workspace-view, web components) | `backoffice/` → gebouwd naar `cms/VisualEditing.Cms/App_Plugins/VisualEditing` |
| Astro 7 SSR + Vue 3-componenten, edit-script (vanilla TS) | `web/` |
| postMessage-protocol (versie 1), gedeeld | `shared/protocol.ts` |
| Playwright-tests (api, web, e2e) | `tests/` |

Achtergrond: [PLAN.md](PLAN.md) (verkenning, protocol, metadataformaat, risico's), [DECISIONS.md](DECISIONS.md),
[FINDINGS.md](FINDINGS.md), [QUESTIONS.md](QUESTIONS.md).

## Vereisten

- .NET SDK 10
- Node.js ≥ 22.23 (getest met 26)
- Eenmalig: `npm install` en de Playwright-browser: `npx playwright install --only-shell chromium`

## Opstarten

```powershell
npm install
```

```powershell
npm run dev
```

Dit bouwt de backoffice-extensie en start de CMS en Astro samen:

- Backoffice: http://localhost:17575/umbraco, login `editor@visualediting.test` / `VisualEditing!2026`
  (testgebruiker uit de unattended install, `appsettings.Development.json`)
- Frontend: http://localhost:4321

De eerste start maakt de SQLite-database aan, installeert Umbraco en seedt de content (documenttypes Home en Artikel,
Block List met Tekstblok, Citaat en Uitgelicht, drie artikelen). Uitgelicht heeft zelf weer een Block List: zo bevat
artikel A geneste blocks. Opnieuw beginnen: stop alles en verwijder
`cms/VisualEditing.Cms/umbraco/Data/Umbraco.sqlite.db*`. De seed gebruikt vaste keys. Een database van vóór de geneste
blocks wordt niet bijgewerkt (de CMS logt dan een waarschuwing): verwijder hem en start opnieuw.

### Gebruik

1. Open in de backoffice een artikel en kies rechtsboven de weergave **Visual editing**.
2. Links staat de preview (concept-content), rechts de gewone editor.
3. Beweeg over de preview: bewerkbare elementen krijgen een kader met label. Klik op een element: rechts opent de juiste
   tab en het veld krijgt focus. Bij een veld in een block (bijvoorbeeld de auteur van een citaat) opent het block en
   krijgt dát veld focus, ook in een block binnen een block (het citaat in "Uitgelicht"). Een element van een ander document (zoals een artikelkaart op de homepage, ook als het een
   link is) opent dat document in een modal; de preview blijft staan en ververst na opslaan.
4. Wijzig iets en klik **Save**: de preview herlaadt op dezelfde scrollpositie. In een block (ook genest) kan dat in
   één klik met **Update & save**: alle open blocks worden bijgewerkt en het document wordt opgeslagen.

Ook nooit-gepubliceerde documenten hebben een preview (Umbraco geeft ze de route `/preview-{key}/`).

Via **Save and preview ▸ Frontend (Astro)** opent de frontend-preview in een nieuw venster (zonder edit-modus).

## Tests

De CMS en de frontend mogen bij het starten van de tests **niet** al draaien: de API-tests nemen eerst een baseline op
met de extensie uitgeschakeld. Playwright start daarna zelf de CMS en de gebouwde Astro-server.

```powershell
npm test
```

Of per onderdeel: `npm run test:api` (Delivery API-integratie), `npm run test:web` (frontend en protocol met de
nep-parent `/test/harness`), `npm run test:e2e` (door de backoffice heen). Fase 2 met gemockte metadata:
`$env:VE_METADATA_SOURCE='mock'; npm run test:web`.

## Configuratie

CMS (`appsettings.Development.json`):

| Sleutel | Betekenis |
|---|---|
| `Umbraco:CMS:DeliveryApi:ApiKey` | API-key voor preview-requests |
| `Umbraco:CMS:Global:UseHttps` | `false` lokaal, anders weigert de login over HTTP (DECISIONS D14) |
| `VisualEditing:Enabled` | `false` = extensie volledig uit (standaard-Umbraco) |
| `VisualEditing:FrontendUrl` | basis-URL van de frontend; de origin hiervan is ook de postMessage-allowlist in de backoffice |
| `VisualEditing:PreviewSecret` | gedeeld HMAC-geheim met de frontend |
| `VisualEditing:DocumentTypes` | documenttypes met een frontend-preview |

Frontend (environment-variabelen; de defaults passen bij de CMS-config hierboven):
`UMBRACO_URL`, `UMBRACO_API_KEY`, `PREVIEW_SECRET`, `VE_ALLOWED_PARENT_ORIGINS` (postMessage-allowlist),
`VE_FRAME_ANCESTORS` (CSP, standaard gelijk aan de allowlist), `VE_METADATA_SOURCE` (`api`|`mock`),
`VE_TEST_HARNESS=1` (nep-parent beschikbaar maken).

## Hoe het werkt (kort)

1. **Delivery API** – bij `Preview: true` + geldige `Api-Key` + `Visual-Editing: true` krijgt elk content-item een
   `editMetadata`-object naast de bestaande velden (document-key, documenttype, culture, per property alias/label/tab, per
   block key/ouder-property/ouder-block/pad, ook voor geneste blocks). Alle andere responses zijn bytegelijk aan standaard-Umbraco.
2. **Vue-componenten** – optionele prop `edit` + `useEdit()`; `v-bind="e.field('title')"` zet de `data-umb-*`-attributen.
3. **Edit-script** – alleen geladen met een geldig preview-token en `ve=1`; handshake `loaded` → `init` → `ready`,
   overlays, klik → `edit`, `getScroll`/`scroll`. Nooit `*` als target origin.
4. **Backoffice** – workspace-view met het iframe (URL van de `VisualEditing`-URL-provider), de standaard editor ernaast,
   navigatie bij `edit`, herladen na `UmbEntityUpdatedEvent`.
