import { expect, test } from '@playwright/test';
import { KEYS, previewUrl } from '../support/env';
import {
	FOREIGN_WEB_URL,
	editCount,
	hoverAndGetOverlayLabel,
	lastEdit,
	messages,
	openHarness,
	waitForReady,
} from '../support/harness';

/**
 * Fase 2: frontend-editlaag. Draait tegen de nep-parent (zonder Umbraco-backoffice).
 * Slaagt zowel met gemockte metadata (VE_METADATA_SOURCE=mock) als met echte metadata uit de API (fase 3).
 */
const A = KEYS.articleA;
const QUOTE = KEYS.block(1, 2);
const TEXT0 = KEYS.block(1, 0);
const CALLOUT = KEYS.block(1, 5);
const NESTED_QUOTE = KEYS.nestedBlock(1, 5, 1);

test.describe('fase 2: zonder edit-modus', () => {
	for (const [name, url] of [
		['gepubliceerd', '/waarom-headless/'],
		['preview zonder edit-vlag', previewUrl('/waarom-headless/')],
	] as const) {
		test(`${name}: geen attributen, geen script, geen overlays`, async ({ page }) => {
			await page.goto(url);
			await expect(page.locator('h1')).toBeVisible();
			await expect(page.locator('[data-umb-doc], [data-umb-prop], [data-umb-block]')).toHaveCount(0);
			await expect(page.locator('#umb-ve-config')).toHaveCount(0);
			await expect(page.locator('umb-ve-overlay')).toHaveCount(0);
			const hasEditScript = await page.evaluate(
				() =>
					'__umbVisualEditing' in window ||
					[...document.scripts].some((s) => /startVisualEditing|EditRuntime/.test(s.src + s.textContent)),
			);
			expect(hasEditScript).toBe(false);
			// Ook het gehydrateerde component krijgt geen edit-descriptor in zijn props.
			for (const props of await page.locator('astro-island').evaluateAll((els) => els.map((e) => e.getAttribute('props')))) {
				expect(props).not.toContain('documentKey');
			}
		});
	}
});

test.describe('fase 2: met edit-modus (nep-parent)', () => {
	test('handshake: eerst alleen "loaded", na "init" volgt "ready"', async ({ page }) => {
		await openHarness(page);
		await waitForReady(page);
		const log = await messages(page);
		expect(log.map((m) => m.data.type)).toEqual(['loaded', 'ready']);
		expect(log.every((m) => m.data.source === 'umbraco-visual-editing' && m.data.version === 1)).toBe(true);
		// "ready" meldt welke documenten op de pagina staan (de backoffice herlaadt als één ervan wordt opgeslagen).
		expect(log[1].data.documentKeys).toEqual([A]);
	});

	test('"ready" op de homepage noemt ook de documenten van de artikelkaarten', async ({ page }) => {
		await openHarness(page, { target: '/' });
		await waitForReady(page);
		const ready = (await messages(page)).find((m) => m.data.type === 'ready')!;
		// Minstens de seed-documenten (eigen concept-artikelen onder Home staan er in preview ook bij).
		expect(ready.data.documentKeys).toEqual(expect.arrayContaining([KEYS.home, KEYS.articleA, KEYS.articleB, KEYS.articleC]));
	});

	test('klik op een link in edit-modus volgt de link niet, maar stuurt "edit"', async ({ page }) => {
		const { frame } = await openHarness(page, { target: '/' });
		await waitForReady(page);
		await frame.locator(`.card a[data-umb-doc="${KEYS.articleB}"]`).click();
		expect(await lastEdit(page)).toMatchObject({ documentKey: KEYS.articleB, propertyAlias: 'title' });
		await page.waitForTimeout(500);
		expect(await frame.locator('body').evaluate(() => location.pathname)).toBe('/');
	});

	test('vóór de handshake: geen overlay en geen edit-berichten', async ({ page }) => {
		const { frame } = await openHarness(page, { auto: false });
		await expect.poll(async () => (await messages(page)).map((m) => m.data.type)).toEqual(['loaded']);
		await frame.locator('h1').hover();
		await expect(frame.locator('umb-ve-overlay .box')).toBeHidden();
		await frame.locator('h1').click();
		await page.waitForTimeout(300);
		expect((await messages(page)).map((m) => m.data.type)).toEqual(['loaded']);
	});

	test('hover toont overlay op titel, intro, afbeelding en blocks', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		expect(await hoverAndGetOverlayLabel(frame, 'h1')).toMatch(/tit/i);
		expect(await hoverAndGetOverlayLabel(frame, '.page-intro')).toMatch(/intro/i);
		expect(await hoverAndGetOverlayLabel(frame, '.article-image img')).toMatch(/afbeelding|image/i);
		expect(await hoverAndGetOverlayLabel(frame, `[data-umb-block="${TEXT0}"] h2`)).toMatch(/›/);
		expect(await hoverAndGetOverlayLabel(frame, '.quote-block blockquote')).toMatch(/›/);
		// De overlay ligt precies over het element.
		const box = await frame.locator('umb-ve-overlay .box').boundingBox();
		const target = await frame.locator(`[data-umb-block="${QUOTE}"] blockquote`).boundingBox();
		expect(Math.abs(box!.y - target!.y)).toBeLessThan(2);
		expect(Math.abs(box!.width - target!.width)).toBeLessThan(2);
	});

	test('klik stuurt "edit" met de juiste keys (document-velden)', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		await frame.locator('h1').click();
		expect(await lastEdit(page, 0)).toMatchObject({
			type: 'edit',
			entityType: 'document',
			documentKey: A,
			culture: null,
			propertyAlias: 'title',
			blockKey: null,
			blockPropertyAlias: null,
		});
		await frame.locator('.article-image img').click();
		expect(await lastEdit(page, 1)).toMatchObject({ documentKey: A, propertyAlias: 'image', blockKey: null });
		await frame.locator('.page-intro').click();
		expect(await lastEdit(page, 2)).toMatchObject({ documentKey: A, propertyAlias: 'intro', blockKey: null });
	});

	test('klik op een statisch block (Tekstblok) stuurt block-key en property', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		// Statisch gerenderd: niet binnen een Astro-eiland.
		await expect(frame.locator(`section.text-block[data-umb-block="${TEXT0}"]`)).toHaveCount(1);
		await expect(frame.locator(`astro-island [data-umb-block="${TEXT0}"]`)).toHaveCount(0);
		await frame.locator(`[data-umb-block="${TEXT0}"] h2`).click();
		expect(await lastEdit(page)).toMatchObject({
			documentKey: A,
			propertyAlias: 'blocks',
			blockKey: TEXT0,
			blockPropertyAlias: 'heading',
		});
	});

	test('gehydrateerd block (Citaat): klik werkt, ook na re-renders', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		const quote = frame.locator(`astro-island .quote-block[data-umb-block="${QUOTE}"]`);
		await expect(quote).toHaveCount(1);
		// Wachten tot het eiland gehydrateerd is (Astro verwijdert dan het ssr-attribuut).
		await expect(quote.locator('xpath=ancestor::astro-island')).not.toHaveAttribute('ssr', /.*/);

		await quote.locator('blockquote').click();
		expect(await lastEdit(page)).toMatchObject({
			documentKey: A,
			propertyAlias: 'blocks',
			blockKey: QUOTE,
			blockPropertyAlias: 'quote',
		});

		// Bedieningsknoppen werken gewoon (geen edit-bericht) en veroorzaken re-renders.
		const before = await editCount(page);
		await quote.getByRole('button', { name: 'Kopieer citaat' }).click();
		await expect(quote).toHaveAttribute('data-status', /copied|failed/);
		await quote.getByRole('button', { name: 'Verberg auteur' }).click();
		await expect(quote.locator('figcaption')).toHaveCount(0);
		await quote.getByRole('button', { name: 'Toon auteur' }).click();
		await expect(quote.locator('figcaption')).toHaveCount(1);
		expect(await editCount(page)).toBe(before);

		// Na de re-renders staan de attributen er nog, ook op het opnieuw aangemaakte figcaption-element.
		await expect(quote).toHaveAttribute('data-umb-block', QUOTE);
		await expect(quote.locator('blockquote')).toHaveAttribute('data-umb-block-prop', 'quote');
		await expect(quote.locator('figcaption')).toHaveAttribute('data-umb-block-prop', 'author');
		expect(await hoverAndGetOverlayLabel(frame, '.quote-block figcaption')).toMatch(/auteur|author/i);
		await quote.locator('figcaption').click();
		const top = await lastEdit(page, before);
		expect(top).toMatchObject({ blockKey: QUOTE, blockPropertyAlias: 'author' });
		// Block op het eerste niveau: geen pad (protocol en attributen zoals voorheen).
		expect(top).not.toHaveProperty('blockPath');
		await expect(quote).not.toHaveAttribute('data-umb-block-path', /.*/);
	});

	test('genest block (citaat in Uitgelicht): klik stuurt het pad van blocks mee', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		const callout = frame.locator(`.callout-block[data-umb-block="${CALLOUT}"]`);
		const nested = callout.locator(`.quote-block[data-umb-block="${NESTED_QUOTE}"]`);
		await expect(nested).toHaveAttribute('data-umb-block-path', `blocks/${CALLOUT}/items/${NESTED_QUOTE}`);
		await expect(nested.locator('xpath=ancestor::astro-island')).not.toHaveAttribute('ssr', /.*/);

		// Het binnenste element wint: de auteur van het geneste citaat, niet het Uitgelicht-block eromheen.
		expect(await hoverAndGetOverlayLabel(frame, `[data-umb-block="${NESTED_QUOTE}"] figcaption`)).toMatch(
			/Uitgelicht 6 › Citaat 2 › (Auteur|Author)/,
		);
		const before = await editCount(page);
		await nested.locator('figcaption').click();
		expect(await lastEdit(page, before)).toEqual(
			expect.objectContaining({
				documentKey: A,
				propertyAlias: 'blocks',
				blockKey: NESTED_QUOTE,
				blockPropertyAlias: 'author',
				blockPath: [
					{ propertyAlias: 'blocks', blockKey: CALLOUT },
					{ propertyAlias: 'items', blockKey: NESTED_QUOTE },
				],
			}),
		);

		// De titel van het Uitgelicht-block zelf: een veld van het block op het eerste niveau.
		await callout.locator('h2').first().click();
		const title = await lastEdit(page, before + 1);
		expect(title).toMatchObject({ propertyAlias: 'blocks', blockKey: CALLOUT, blockPropertyAlias: 'title' });
		expect(title).not.toHaveProperty('blockPath');
	});

	test('MutationObserver: dynamisch toegevoegde elementen worden herkend', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		const count = () =>
			frame.locator('body').evaluate(() => (window as any).__umbVisualEditing.editableCount as number);
		const initial = await count();
		await frame.locator('main').evaluate((main, key) => {
			const el = document.createElement('p');
			el.id = 'dynamic';
			el.textContent = 'Dynamisch toegevoegd';
			el.setAttribute('data-umb-doc', key);
			el.setAttribute('data-umb-prop', 'intro');
			el.setAttribute('data-umb-label', 'Dynamisch');
			main.appendChild(el);
		}, A);
		await expect.poll(count).toBe(initial + 1);
		expect(await hoverAndGetOverlayLabel(frame, '#dynamic')).toBe('Dynamisch');
		await frame.locator('#dynamic').evaluate((el) => el.remove());
		await expect.poll(count).toBe(initial);
	});

	test('scrollpositie: opvragen en herstellen na herladen', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		await frame.locator('body').evaluate(() => window.scrollTo(0, 900));
		const scroll = await page.evaluate(() => (window as any).harness.getScroll());
		expect(scroll).toEqual({ x: 0, y: 900 });
		const ready = await page.evaluate(() => (window as any).harness.reload());
		expect(ready?.type).toBe('ready');
		expect(await frame.locator('body').evaluate(() => window.scrollY)).toBe(900);
	});

	test('init met editMode=false: geen overlays', async ({ page }) => {
		const { frame } = await openHarness(page, { auto: false });
		await expect.poll(async () => (await messages(page)).map((m) => m.data.type)).toEqual(['loaded']);
		await page.evaluate(() => (window as any).harness.init({ editMode: false }));
		await waitForReady(page);
		await frame.locator('h1').hover();
		await expect(frame.locator('umb-ve-overlay .box')).toBeHidden();
	});
});

test.describe('fase 2: beveiliging', () => {
	test('berichten van een niet-toegestane origin worden genegeerd', async ({ page }) => {
		// Nep-parent op 127.0.0.1: mag framen (CSP in testconfig), maar staat niet in de postMessage-allowlist.
		const { frame } = await openHarness(page, { parentOrigin: FOREIGN_WEB_URL, auto: false });
		await expect(frame.locator('h1')).toBeVisible();
		await page.waitForTimeout(500);
		// "loaded" is alleen naar toegestane origins gepost, dus hier nooit afgeleverd.
		expect(await messages(page)).toEqual([]);
		// Init en getScroll vanaf deze origin worden genegeerd: geen ready, geen scroll, geen edit-modus.
		await page.evaluate(() => (window as any).harness.init({ editMode: true }));
		expect(await page.evaluate(() => (window as any).harness.getScroll())).toBeNull();
		await frame.locator('h1').hover();
		await frame.locator('h1').click();
		await page.waitForTimeout(300);
		expect(await messages(page)).toEqual([]);
		await expect(frame.locator('umb-ve-overlay .box')).toBeHidden();
		const state = await frame.locator('body').evaluate(() => (window as any).__umbVisualEditing);
		expect(state).toMatchObject({ parentOrigin: null, editMode: false });
	});

	test('berichten die niet van de parent komen worden genegeerd', async ({ page }) => {
		const { frame } = await openHarness(page, { auto: false });
		await expect.poll(async () => (await messages(page)).length).toBe(1);
		// Het iframe post zelf een init naar zichzelf: event.source is dan niet window.parent.
		await frame.locator('body').evaluate(() =>
			window.postMessage({ source: 'umbraco-visual-editing', version: 1, type: 'init', editMode: true }, location.origin),
		);
		await page.waitForTimeout(300);
		const state = await frame.locator('body').evaluate(() => (window as any).__umbVisualEditing);
		expect(state).toMatchObject({ parentOrigin: null, editMode: false });
	});

	test('berichten met een andere protocolversie worden genegeerd', async ({ page }) => {
		const { frame } = await openHarness(page, { auto: false });
		await expect.poll(async () => (await messages(page)).length).toBe(1);
		await page.evaluate(() =>
			(window as any).harness.send({ source: 'umbraco-visual-editing', version: 2, type: 'init', editMode: true }),
		);
		await page.waitForTimeout(300);
		expect((await messages(page)).map((m) => m.data.type)).toEqual(['loaded']);
		const state = await frame.locator('body').evaluate(() => (window as any).__umbVisualEditing);
		expect(state.editMode).toBe(false);
	});

	test('CSP: alleen preview-pagina\'s mogen door de backoffice geframed worden', async ({ request }) => {
		const published = await request.get('/waarom-headless/');
		expect(published.headers()['content-security-policy']).toBe("frame-ancestors 'self'");
		const preview = await request.get(previewUrl('/waarom-headless/', { edit: true }));
		expect(preview.headers()['content-security-policy']).toContain('http://localhost:17575');
	});
});
