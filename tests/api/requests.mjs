// Vaste set Delivery API-requests. De baseline wordt ermee opgenomen zonder extensie (scripts/record-baseline.mjs);
// de integratietests herhalen ze met extensie. Plain JS, zodat ook het Node-script hem kan laden.
const API_KEY = process.env.UMBRACO_API_KEY ?? 'local-dev-preview-key';
const A = '5e0d0000-0000-4000-8000-000000000211';
const B = '5e0d0000-0000-4000-8000-000000000212';
const C = '5e0d0000-0000-4000-8000-000000000213';
const preview = { Preview: 'true', 'Api-Key': API_KEY };
const edit = { ...preview, 'Visual-Editing': 'true' };
const api = '/umbraco/delivery/api/v2';

/** @type {{ name: string, path: string, headers: Record<string, string> }[]} */
export const REQUESTS = [
	{ name: 'published-by-id', path: `${api}/content/item/${A}`, headers: {} },
	{ name: 'published-by-route', path: `${api}/content/item/waarom-headless/`, headers: {} },
	{ name: 'published-home', path: `${api}/content/item/%2F`, headers: {} },
	{ name: 'published-query', path: `${api}/content?fetch=children:/&sort=sortOrder:asc`, headers: {} },
	{ name: 'published-items', path: `${api}/content/items?id=${A}&id=${B}`, headers: {} },
	// Edit-header zonder preview: moet worden genegeerd.
	{ name: 'published-with-edit-header', path: `${api}/content/item/${A}`, headers: { 'Visual-Editing': 'true' } },
	{ name: 'preview-by-id', path: `${api}/content/item/${A}`, headers: preview },
	{ name: 'preview-by-route', path: `${api}/content/item/waarom-headless/`, headers: preview },
	{ name: 'preview-draft', path: `${api}/content/item/${C}`, headers: preview },
	{ name: 'preview-query', path: `${api}/content?fetch=children:/&sort=sortOrder:asc`, headers: preview },
	{ name: 'preview-items', path: `${api}/content/items?id=${A}&id=${B}`, headers: preview },
	// Edit-header met preview maar een ongeldige API-key: geen toegang, dus ook geen metadata.
	{ name: 'preview-edit-bad-key', path: `${api}/content/item/${A}`, headers: { ...edit, 'Api-Key': 'fout' } },
	// Zonder extensie wordt de header genegeerd; met extensie mag alleen editMetadata erbij komen.
	{ name: 'preview-edit-by-id', path: `${api}/content/item/${A}`, headers: edit },
	{ name: 'preview-edit-by-route', path: `${api}/content/item/waarom-headless/`, headers: edit },
	{ name: 'preview-edit-query', path: `${api}/content?fetch=children:/&sort=sortOrder:asc`, headers: edit },
	{ name: 'preview-edit-items', path: `${api}/content/items?id=${A}&id=${B}`, headers: edit },
];
