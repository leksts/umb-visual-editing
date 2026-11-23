import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config';

/**
 * Preview-context van een request. Preview en edit-modus komen uit de URL (geen cookies, zie DECISIONS.md D6):
 *   ?preview=<exp>.<hmac>   token van de CMS (VisualEditingUrlProvider), HMAC-SHA256 over "<exp>"
 *   &ve=1                    edit-modus (alleen geldig samen met een geldig preview-token)
 */
export interface PreviewContext {
	/** Concept-content ophalen. */
	enabled: boolean;
	/** Edit-attributen renderen en het edit-script laden. */
	edit: boolean;
	/** Query-parameters om aan interne links mee te geven. */
	query: string;
}

export const NO_PREVIEW: PreviewContext = { enabled: false, edit: false, query: '' };

export function signPreviewToken(expiresAtUnix: number, secret = config.previewSecret): string {
	const mac = createHmac('sha256', secret).update(String(expiresAtUnix)).digest('base64url');
	return `${expiresAtUnix}.${mac}`;
}

export function verifyPreviewToken(token: string | null, now = Date.now(), secret = config.previewSecret): boolean {
	if (!token) return false;
	const [exp, mac] = token.split('.');
	const expiresAt = Number(exp);
	if (!Number.isInteger(expiresAt) || !mac) return false;
	if (expiresAt * 1000 < now) return false;
	const expected = Buffer.from(signPreviewToken(expiresAt, secret));
	const actual = Buffer.from(token);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getPreviewContext(url: URL): PreviewContext {
	const token = url.searchParams.get('preview');
	if (!verifyPreviewToken(token)) return NO_PREVIEW;
	const edit = url.searchParams.get('ve') === '1';
	const query = new URLSearchParams({ preview: token!, ...(edit ? { ve: '1' } : {}) }).toString();
	return { enabled: true, edit, query };
}
