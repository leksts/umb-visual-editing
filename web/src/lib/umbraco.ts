import { config } from './config';
import type { EditMetadata } from './edit-metadata';
import type { PreviewContext } from './preview';

/** Subset van het Delivery API v2-model dat deze site gebruikt. */
export interface ApiElement {
	contentType: string;
	id: string;
	properties: Record<string, unknown>;
}

export interface ApiContent extends ApiElement {
	name: string;
	route: { path: string };
	/** Alleen aanwezig bij preview + edit-modus (header Visual-Editing). */
	editMetadata?: EditMetadata;
}

export interface ApiBlockItem {
	content: ApiElement;
	settings: ApiElement | null;
}

export interface ApiMedia {
	id: string;
	name: string;
	url: string;
	width: number;
	height: number;
}

const API = '/umbraco/delivery/api/v2';

function headers(preview: PreviewContext): HeadersInit {
	if (!preview.enabled) return {};
	const h: Record<string, string> = { Preview: 'true', 'Api-Key': config.apiKey };
	if (preview.edit && config.metadataSource === 'api') h['Visual-Editing'] = 'true';
	return h;
}

async function get<T>(path: string, preview: PreviewContext): Promise<T | null> {
	const res = await fetch(`${config.umbracoUrl}${API}${path}`, { headers: headers(preview) });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Delivery API ${res.status} voor ${path}`);
	return (await res.json()) as T;
}

export function getContentByRoute(route: string, preview: PreviewContext) {
	const path = route === '/' || route === '' ? '%2F' : route.replace(/^\//, '');
	return get<ApiContent>(`/content/item/${path}`, preview);
}

export function getContentById(id: string, preview: PreviewContext) {
	return get<ApiContent>(`/content/item/${encodeURIComponent(id)}`, preview);
}

export async function getChildren(id: string, preview: PreviewContext): Promise<ApiContent[]> {
	const result = await get<{ items: ApiContent[] }>(`/content?fetch=children:${id}&sort=sortOrder:asc&take=50`, preview);
	return result?.items ?? [];
}

/** Media-URL's uit de API zijn relatief aan de CMS. */
export function mediaUrl(url: string): string {
	return url.startsWith('http') ? url : `${config.umbracoUrl}${url}`;
}

/** Interne link, met preview-parameters als we in preview zijn. */
export function link(path: string, preview: PreviewContext): string {
	return preview.query ? `${path}?${preview.query}` : path;
}
