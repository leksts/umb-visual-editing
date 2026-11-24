import type { APIRoute } from 'astro';
import { config } from '../../lib/config';

/**
 * Nep-wisselkoers-API voor de tests (alleen met VE_TEST_HARNESS=1). De tests roepen hem aan via een andere origin
 * (127.0.0.1 in plaats van localhost), zodat hij voor de browser echt "extern" is en CSP connect-src erop van toepassing is.
 */
export const GET: APIRoute = ({ url }) => {
	if (!config.testHarness) return new Response('Niet gevonden', { status: 404 });
	const to = url.searchParams.get('to') ?? 'USD';
	return new Response(JSON.stringify({ base: 'EUR', rates: { [to]: 1.2345 } }), {
		headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
	});
};
