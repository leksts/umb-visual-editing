/**
 * Runtime-configuratie van de frontend. Waarden komen uit environment-variabelen (server-side, per request te lezen
 * via process.env). De defaults passen bij appsettings.Development.json van de CMS, zodat lokaal geen .env nodig is.
 */
function list(value: string | undefined, fallback: string[]): string[] {
	return value ? value.split(',').map((v) => v.trim()).filter(Boolean) : fallback;
}

export const config = {
	umbracoUrl: process.env.UMBRACO_URL ?? 'http://localhost:17575',
	/** API-key voor preview-requests naar de Delivery API. Blijft server-side. */
	apiKey: process.env.UMBRACO_API_KEY ?? 'local-dev-preview-key',
	/** Gedeeld geheim met de CMS (VisualEditing:PreviewSecret) om preview-tokens te controleren. */
	previewSecret: process.env.PREVIEW_SECRET ?? 'local-dev-preview-secret-change-me',
	/** Origins die de frontend in een iframe mogen tonen en met het edit-script mogen praten. */
	allowedParentOrigins: list(process.env.VE_ALLOWED_PARENT_ORIGINS, ['http://localhost:17575', 'http://localhost:4321']),
	/**
	 * Origins die de pagina in een iframe mogen tonen (CSP frame-ancestors). Standaard gelijk aan allowedParentOrigins;
	 * apart instelbaar zodat de tests kunnen aantonen dat het edit-script zelf ook op origin filtert.
	 */
	frameAncestors: list(process.env.VE_FRAME_ANCESTORS, list(process.env.VE_ALLOWED_PARENT_ORIGINS, ['http://localhost:17575', 'http://localhost:4321'])),
	/** 'api' = echte edit-metadata uit de Delivery API; 'mock' = in de frontend nagebootst (fase 2). */
	metadataSource: (process.env.VE_METADATA_SOURCE ?? 'api') as 'api' | 'mock',
	/** Testpagina met nep-parent beschikbaar maken (alleen lokaal/test). */
	testHarness: process.env.VE_TEST_HARNESS === '1',
};
