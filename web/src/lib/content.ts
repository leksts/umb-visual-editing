import { config } from './config';
import { withMockEditMetadata } from './edit-metadata';
import type { PreviewContext } from './preview';
import { getChildren, getContentById, getContentByRoute, type ApiContent } from './umbraco';

/** Past in fase 2 (VE_METADATA_SOURCE=mock) de nagebootste metadata toe; anders levert de API die zelf. */
function withMetadata(item: ApiContent | null, preview: PreviewContext): ApiContent | null {
	return preview.edit && config.metadataSource === 'mock' ? withMockEditMetadata(item) : item;
}

export async function loadPage(route: string, preview: PreviewContext) {
	return withMetadata(await getContentByRoute(route, preview), preview);
}

export async function loadById(id: string, preview: PreviewContext) {
	return withMetadata(await getContentById(id, preview), preview);
}

export async function loadChildren(id: string, preview: PreviewContext) {
	return (await getChildren(id, preview)).map((c) => withMetadata(c, preview)!);
}
