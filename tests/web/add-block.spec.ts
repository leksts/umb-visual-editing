import { expect, test, type Page } from '@playwright/test';
import { KEYS } from '../support/env';
import { messages, openHarness, waitForReady } from '../support/harness';

/** "+"-knoppen boven en onder een block in de preview (DECISIONS.md D24), tegen de nep-parent. */
const A = KEYS.articleA;
const QUOTE = KEYS.block(1, 2);
const CALLOUT = KEYS.block(1, 5);
const NESTED_QUOTE = KEYS.nestedBlock(1, 5, 1);

async function lastAdd(page: Page) {
	await expect.poll(async () => (await messages(page)).filter((m) => m.data.type === 'add').length).toBeGreaterThan(0);
	const adds = (await messages(page)).filter((m) => m.data.type === 'add');
	return adds[adds.length - 1].data;
}

test.describe('block invoegen met "+"', () => {
	test('hover op een block toont "+" boven en onder; klik stuurt "add" en geen "edit"', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		const overlay = frame.locator('umb-ve-overlay');

		// Ook bij hover op een veld in het block horen de knoppen bij het block zelf.
		await frame.locator(`[data-umb-block="${QUOTE}"] blockquote`).hover();
		await expect(overlay).toHaveAttribute('data-add-block', QUOTE);
		await expect(overlay.locator('.add.before')).toBeVisible();
		await expect(overlay.locator('.add.after')).toBeVisible();

		await overlay.locator('.add.after').click();
		expect(await lastAdd(page)).toEqual(
			expect.objectContaining({ type: 'add', documentKey: A, propertyAlias: 'blocks', blockKey: QUOTE, position: 'after' }),
		);
		expect(await lastAdd(page)).not.toHaveProperty('blockPath');
		expect((await messages(page)).filter((m) => m.data.type === 'edit')).toHaveLength(0);
	});

	test('genest block: "+" stuurt het pad mee', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		const overlay = frame.locator('umb-ve-overlay');
		await frame.locator(`[data-umb-block="${NESTED_QUOTE}"] figcaption`).hover();
		await expect(overlay).toHaveAttribute('data-add-block', NESTED_QUOTE);
		await overlay.locator('.add.before').click();
		expect(await lastAdd(page)).toEqual(
			expect.objectContaining({
				blockKey: NESTED_QUOTE,
				position: 'before',
				blockPath: [
					{ propertyAlias: 'blocks', blockKey: CALLOUT },
					{ propertyAlias: 'items', blockKey: NESTED_QUOTE },
				],
			}),
		);
	});

	test('velden van het document zelf hebben geen "+"', async ({ page }) => {
		const { frame } = await openHarness(page);
		await waitForReady(page);
		const overlay = frame.locator('umb-ve-overlay');
		await frame.locator('h1').hover();
		await expect(overlay.locator('.box')).toBeVisible();
		await expect(overlay).not.toHaveAttribute('data-add-block', /.*/);
		await expect(overlay.locator('.add.after')).toBeHidden();
	});
});
