import { defineMiddleware } from 'astro:middleware';
import { config } from './lib/config';
import { getPreviewContext } from './lib/preview';

/**
 * Bepaalt de preview-context en zet de CSP-header:
 * - frame-ancestors (PLAN.md §1.8): alleen preview-pagina's mogen door de toegestane parent-origins (backoffice) in een
 *   iframe worden getoond;
 * - connect-src (DECISIONS.md D23): vangnet naast de afspraken per blocktype. In preview mag de browser alleen met de
 *   eigen origin en de geconfigureerde lijst praten, in edit-modus alleen met de eigen origin. Een component dat zich
 *   niet aan zijn afspraak houdt, faalt dan zichtbaar in plaats van stil een externe API aan te roepen.
 *   Live verandert er niets.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	context.locals.preview = getPreviewContext(context.url);
	const response = await next();
	const { enabled, edit } = context.locals.preview;
	const ancestors = enabled ? ["'self'", ...config.frameAncestors] : ["'self'"];
	const policy = [`frame-ancestors ${ancestors.join(' ')}`];
	if (enabled) policy.push(`connect-src ${["'self'", ...(edit ? [] : config.previewConnectSrc)].join(' ')}`);
	response.headers.set('Content-Security-Policy', policy.join('; '));
	if (context.locals.preview.enabled) {
		response.headers.set('Cache-Control', 'no-store');
		response.headers.set('Referrer-Policy', 'no-referrer');
	}
	return response;
});
