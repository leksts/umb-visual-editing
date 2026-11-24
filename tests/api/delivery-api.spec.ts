import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CMS_URL, KEYS } from '../support/env';
import { REQUESTS } from './requests.mjs';

/**
 * Fase 3: integratietests van de Delivery API-uitbreiding.
 * De baseline is opgenomen met VisualEditing:Enabled=false (scripts/record-baseline.mjs, gestart door scripts/test.mjs),
 * dus met exact de standaard-Umbraco-API. Deze tests draaien tegen dezelfde database mét extensie.
 */
const baselineDir = new URL('./.baseline/', import.meta.url);

function baseline(name: string): { status: number; body: string } {
	const file = new URL(`${name}.json`, baselineDir);
	if (!existsSync(file)) throw new Error(`Baseline ontbreekt (${name}). Draai via "npm run test:api".`);
	return JSON.parse(readFileSync(file, 'utf8'));
}

async function current(name: string) {
	const req = REQUESTS.find((r) => r.name === name)!;
	const res = await fetch(`${CMS_URL}${req.path}`, { headers: req.headers });
	return { status: res.status, body: await res.text() };
}

type Item = Record<string, unknown> & { id: string; editMetadata?: any };

function items(body: unknown): Item[] {
	const b = body as { items?: Item[] } | Item | Item[];
	return Array.isArray(b) ? b : 'items' in b && Array.isArray(b.items) ? b.items : [b as Item];
}

/** Verwijdert editMetadata en serialiseert opnieuw; volgorde van keys blijft behouden. */
function withoutEditMetadata(body: string): string {
	return JSON.stringify(JSON.parse(body), (key, value) => (key === 'editMetadata' ? undefined : value));
}

test.describe('fase 3: Delivery API zonder edit-modus is ongewijzigd', () => {
	for (const name of ['published-by-id', 'published-by-route', 'published-home', 'published-query', 'published-items']) {
		test(`${name} is bytegelijk aan de API zonder extensie`, async () => {
			const before = baseline(name);
			const now = await current(name);
			expect(now.status).toBe(200);
			expect(now.status).toBe(before.status);
			expect(now.body).toBe(before.body);
			expect(now.body).not.toContain('editMetadata');
		});
	}

	test('edit-header zonder preview wordt genegeerd (gepubliceerd blijft gelijk)', async () => {
		const now = await current('published-with-edit-header');
		expect(now.body).toBe(baseline('published-with-edit-header').body);
		expect(now.body).toBe(baseline('published-by-id').body);
		expect(now.body).not.toContain('editMetadata');
	});

	for (const name of ['preview-by-id', 'preview-by-route', 'preview-draft', 'preview-query', 'preview-items']) {
		test(`${name} (preview zonder edit-vlag) is bytegelijk`, async () => {
			const before = baseline(name);
			const now = await current(name);
			expect(now.status).toBe(200);
			expect(now.body).toBe(before.body);
			expect(now.body).not.toContain('editMetadata');
		});
	}

	test('preview + edit-vlag met ongeldige API-key: geen toegang en geen metadata', async () => {
		const now = await current('preview-edit-bad-key');
		expect(now.status).toBe(401);
		expect(now).toEqual(baseline('preview-edit-bad-key'));
		expect(now.body).not.toContain('editMetadata');
	});
});

test.describe('fase 3: preview + edit-vlag', () => {
	for (const name of ['preview-edit-by-id', 'preview-edit-by-route', 'preview-edit-query', 'preview-edit-items']) {
		test(`${name}: alleen editMetadata komt erbij, de rest is identiek`, async () => {
			const before = baseline(name);
			const now = await current(name);
			expect(now.status).toBe(200);
			// Zonder extensie geeft dezelfde request geen metadata (header onbekend).
			expect(before.body).not.toContain('editMetadata');
			// Elk item heeft metadata die bij het item hoort.
			const parsed = items(JSON.parse(now.body));
			expect(parsed.length).toBeGreaterThan(0);
			for (const item of parsed) {
				expect(item.editMetadata, `metadata voor ${item.id}`).toBeTruthy();
				expect(item.editMetadata.documentKey).toBe(item.id);
				// editMetadata staat naast de bestaande velden, als laatste.
				expect(Object.keys(item).at(-1)).toBe('editMetadata');
			}
			// Na verwijderen van editMetadata: exact de baseline (zelfde waarden én volgorde).
			expect(withoutEditMetadata(now.body)).toBe(JSON.stringify(JSON.parse(before.body)));
		});
	}

	test('metadata van artikel A: document, properties, tabs en labels', async () => {
		const meta = JSON.parse((await current('preview-edit-by-id')).body).editMetadata;
		expect(meta).toMatchObject({
			version: 1,
			entityType: 'document',
			documentKey: KEYS.articleA,
			documentType: 'article',
			culture: null,
		});
		expect(meta.properties).toEqual({
			title: { alias: 'title', label: 'Titel', editorAlias: 'Umbraco.TextBox', tab: 'Inhoud' },
			intro: { alias: 'intro', label: 'Intro', editorAlias: 'Umbraco.TextArea', tab: 'Inhoud' },
			image: { alias: 'image', label: 'Afbeelding', editorAlias: 'Umbraco.MediaPicker3', tab: 'Inhoud' },
			blocks: { alias: 'blocks', label: 'Blocks', editorAlias: 'Umbraco.BlockList', tab: 'Blocks' },
		});
	});

	test('metadata van artikel A: blocks met block-key, ouder-property, pad en velden', async () => {
		const body = JSON.parse((await current('preview-edit-by-id')).body);
		const meta = body.editMetadata;
		const apiBlockIds: string[] = body.properties.blocks.items.map((i: any) => i.content.id);

		// Elke block in de output is via zijn bestaande content.id terug te vinden in de metadata; geneste blocks
		// (de items van Uitgelicht) volgen direct na hun ouder.
		const nestedIds: string[] = body.properties.blocks.items[5].content.properties.items.items.map((i: any) => i.content.id);
		expect(Object.keys(meta.blocks)).toEqual([...apiBlockIds, ...nestedIds]);
		expect(apiBlockIds).toHaveLength(6);
		expect(nestedIds).toEqual([KEYS.nestedBlock(1, 5, 0), KEYS.nestedBlock(1, 5, 1)]);

		expect(meta.blocks[KEYS.block(1, 2)]).toEqual({
			blockKey: KEYS.block(1, 2),
			settingsKey: null,
			elementType: 'quoteBlock',
			propertyAlias: 'blocks',
			parentBlockKey: null,
			path: 'blocks[2]',
			index: 2,
			properties: {
				quote: { alias: 'quote', label: 'Citaat', editorAlias: 'Umbraco.TextArea', tab: 'Inhoud' },
				author: { alias: 'author', label: 'Auteur', editorAlias: 'Umbraco.TextBox', tab: 'Inhoud' },
			},
		});
		expect(meta.blocks[KEYS.block(1, 0)]).toMatchObject({
			blockKey: KEYS.block(1, 0),
			elementType: 'textBlock',
			propertyAlias: 'blocks',
			path: 'blocks[0]',
			index: 0,
		});
		expect(Object.keys(meta.blocks[KEYS.block(1, 0)].properties)).toEqual(['heading', 'text']);
	});

	test('metadata van artikel A: geneste blocks met ouder-block en pad', async () => {
		const meta = JSON.parse((await current('preview-edit-by-id')).body).editMetadata;
		expect(meta.blocks[KEYS.block(1, 5)]).toMatchObject({
			elementType: 'calloutBlock',
			propertyAlias: 'blocks',
			parentBlockKey: null,
			path: 'blocks[5]',
		});
		expect(meta.blocks[KEYS.block(1, 5)].properties.items).toEqual({
			alias: 'items', label: 'Items', editorAlias: 'Umbraco.BlockList', tab: 'Inhoud',
		});
		expect(meta.blocks[KEYS.nestedBlock(1, 5, 1)]).toEqual({
			blockKey: KEYS.nestedBlock(1, 5, 1),
			settingsKey: null,
			elementType: 'quoteBlock',
			propertyAlias: 'items',
			parentBlockKey: KEYS.block(1, 5),
			path: 'blocks[5].items[1]',
			index: 1,
			properties: {
				quote: { alias: 'quote', label: 'Citaat', editorAlias: 'Umbraco.TextArea', tab: 'Inhoud' },
				author: { alias: 'author', label: 'Auteur', editorAlias: 'Umbraco.TextBox', tab: 'Inhoud' },
			},
		});
	});

	test('query-endpoint: elk item heeft zijn eigen metadata', async () => {
		const body = JSON.parse((await current('preview-edit-query')).body);
		const keys: string[] = body.items.map((i: any) => i.editMetadata.documentKey);
		// Alleen de seed-artikelen bekijken: eigen concept-artikelen onder Home staan in preview ook in de lijst.
		const seed = [KEYS.articleA, KEYS.articleB, KEYS.articleC];
		expect(keys.filter((k) => seed.includes(k))).toEqual(seed);
		const b = body.items.find((i: any) => i.id === KEYS.articleB).editMetadata;
		expect(Object.keys(b.blocks)).toEqual([KEYS.block(2, 0), KEYS.block(2, 1)]);
	});
});
