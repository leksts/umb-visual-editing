import { defineMiddleware } from 'astro:middleware';
import { config } from './lib/config';
import { getPreviewContext } from './lib/preview';

/**
 * Bepaalt de preview-context en zet de CSP-header voor framing (PLAN.md §1.8):
 * alleen preview-pagina's mogen door de toegestane parent-origins (backoffice) in een iframe worden getoond.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	context.locals.preview = getPreviewContext(context.url);
	const response = await next();
	const ancestors = context.locals.preview.enabled ? ["'self'", ...config.allowedParentOrigins] : ["'self'"];
	response.headers.set('Content-Security-Policy', `frame-ancestors ${ancestors.join(' ')}`);
	if (context.locals.preview.enabled) {
		response.headers.set('Cache-Control', 'no-store');
		response.headers.set('Referrer-Policy', 'no-referrer');
	}
	return response;
});
