import { createHmac } from 'node:crypto';

export const CMS_URL = process.env.UMBRACO_URL ?? 'http://localhost:17575';
export const WEB_URL = process.env.WEB_URL ?? 'http://localhost:4321';
/** Zelfde host, andere origin: niet in de allowlist van de frontend. */
export const FOREIGN_WEB_URL = WEB_URL.replace('localhost', '127.0.0.1');
export const API_KEY = process.env.UMBRACO_API_KEY ?? 'local-dev-preview-key';
export const PREVIEW_SECRET = process.env.PREVIEW_SECRET ?? 'local-dev-preview-secret-change-me';

export const KEYS = {
	home: '5e0d0000-0000-4000-8000-000000000201',
	articleA: '5e0d0000-0000-4000-8000-000000000211',
	articleB: '5e0d0000-0000-4000-8000-000000000212',
	articleC: '5e0d0000-0000-4000-8000-000000000213',
	block: (article: number, index: number) => `5e0d0000-0000-4000-8000-0000000003${article}${index}`,
	/** Block in een block (de "items" van een Uitgelicht-block). */
	nestedBlock: (article: number, parent: number, index: number) => `5e0d0000-0000-4000-8000-000000004${article}${parent}${index}`,
};

/** Zelfde tokenformaat als de CMS (VisualEditingUrlProvider) en web/src/lib/preview.ts. */
export function previewToken(ttlSeconds = 3600): string {
	const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
	return `${exp}.${createHmac('sha256', PREVIEW_SECRET).update(String(exp)).digest('base64url')}`;
}

export function previewUrl(path: string, opts: { edit?: boolean } = {}): string {
	const q = new URLSearchParams({ preview: previewToken() });
	if (opts.edit) q.set('ve', '1');
	return `${path}?${q}`;
}
