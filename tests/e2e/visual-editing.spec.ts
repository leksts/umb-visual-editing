import { expect, test, type Page } from '@playwright/test';
import { KEYS } from '../support/env';
import { documentViewUrl, focused, login, managementApi } from '../support/backoffice';

/**
 * Fase 4: end-to-end door de echte backoffice heen.
 * 1. inloggen  2. artikel A openen en de Visual editing-view kiezen  3. klik op het citaatblok in de iframe →
 * het block opent en het juiste veld heeft focus  4. titel wijzigen, opslaan → iframe toont de nieuwe titel op
 * dezelfde scrollpositie. Plus: element van een ander document → dat document in een modal, preview blijft staan.
 */
const A = KEYS.articleA;
const B = KEYS.articleB;
const QUOTE = KEYS.block(1, 2);
const CALLOUT = KEYS.block(1, 5);
const NESTED_QUOTE = KEYS.nestedBlock(1, 5, 1);
const ORIGINAL_TITLE = 'Waarom headless?';

const view = (page: Page) => page.locator('visual-editing-workspace-view');
const preview = (page: Page) => page.frameLocator('visual-editing-workspace-view iframe');
const ready = (page: Page) => view(page).locator('#preview[data-ready]');
const html = (page: Page) => page.locator('html');
const titleInput = (page: Page) => view(page).locator('umb-property[data-mark="property:title"] input');
const modal = (page: Page) => page.locator('umb-workspace-modal').last();

async function expectFocus(page: Page, property: string, value?: string) {
	await expect.poll(async () => (await focused(page)).property).toBe(property);
	const f = await focused(page);
	expect(f.tag).toMatch(/^(input|textarea)$/);
	if (value !== undefined) expect(f.value).toBe(value);
}

async function closeModals(page: Page) {
	while ((await page.locator('umb-workspace-modal').count()) > 0) {
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);
	}
}

test.describe('fase 4: visual editing in de backoffice', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('klik op citaatblok → block open met focus op het veld; opslaan → nieuwe titel op dezelfde scrollpositie', async ({ page }) => {
		// 2. Artikel A openen (standaard de Content-view) en de Visual editing-view kiezen.
		await page.goto(documentViewUrl(A, 'content'));
		await page.getByRole('tab', { name: 'Visual editing' }).click();
		await expect(page).toHaveURL(new RegExp(`/edit/${A}/invariant/view/visual-editing`));
		await expect(ready(page)).toBeVisible({ timeout: 30_000 });
		const frame = preview(page);
		await expect(frame.locator('h1')).toHaveText(ORIGINAL_TITLE);

		// 3a. Klik op de auteur in het citaatblok: het block opent en het veld "author" heeft focus.
		await frame.locator(`.quote-block[data-umb-block="${QUOTE}"] figcaption`).click();
		await expect(page).toHaveURL(new RegExp(`/view/visual-editing/tab/blocks/modal/.*/block/edit/${QUOTE}/`));
		await expectFocus(page, 'author', 'Ada de Redacteur');
		await expect(html(page)).toHaveAttribute('data-visual-editing-focus-block-property', 'author');
		await closeModals(page);

		// 3b. Klik op het citaat zelf: zelfde block, veld "quote".
		await frame.locator(`.quote-block[data-umb-block="${QUOTE}"] blockquote`).click();
		await expect(page).toHaveURL(new RegExp(`/block/edit/${QUOTE}/`));
		await expectFocus(page, 'quote', 'Wie de componenten beheert, beheert ook de edit-metadata.');
		await closeModals(page);

		// 4. Klik op de titel → tab Inhoud, veld "title" heeft focus. Titel wijzigen en opslaan.
		await frame.locator('h1').click();
		await expect(page).toHaveURL(new RegExp(`/edit/${A}/invariant/view/visual-editing/tab/inhoud$`));
		await expectFocus(page, 'title', ORIGINAL_TITLE);

		const newTitle = `Waarom headless? (bewerkt ${Date.now()})`;
		await titleInput(page).fill(newTitle);
		await frame.locator('body').evaluate(() => window.scrollTo(0, 700));
		expect(await frame.locator('body').evaluate(() => window.scrollY)).toBe(700);
		await page.getByRole('button', { name: /^(save|opslaan)$/i }).click();

		await expect(frame.locator('h1')).toHaveText(newTitle, { timeout: 20_000 });
		await expect(ready(page)).toBeVisible();
		expect(await frame.locator('body').evaluate(() => window.scrollY)).toBe(700);
		expect(await view(page).locator('iframe').getAttribute('src')).toContain('rnd=');

		// Opruimen: concepttitel terugzetten (gepubliceerd is nooit veranderd).
		await titleInput(page).fill(ORIGINAL_TITLE);
		await page.getByRole('button', { name: /^(save|opslaan)$/i }).click();
		await expect(frame.locator('h1')).toHaveText(ORIGINAL_TITLE, { timeout: 20_000 });
	});

	test('klik op de auteur van een genest citaat → beide blocks open, focus op het veld', async ({ page }) => {
		await page.goto(documentViewUrl(A, 'visual-editing'));
		await expect(ready(page)).toBeVisible({ timeout: 30_000 });
		const frame = preview(page);

		await frame.locator(`[data-umb-block="${NESTED_QUOTE}"] figcaption`).click();
		// Eerst het Uitgelicht-block, daarin het geneste citaat: twee modals boven elkaar.
		await expect(page).toHaveURL(new RegExp(`/block/edit/${CALLOUT}/.*/block/edit/${NESTED_QUOTE}/`));
		await expectFocus(page, 'author', 'Nina Nest');
		await expect(html(page)).toHaveAttribute('data-visual-editing-focus-block-path', `${CALLOUT}/${NESTED_QUOTE}`);
		await closeModals(page);

		// Daarna nog een veld van het Uitgelicht-block zelf (eerste niveau).
		await frame.locator(`[data-umb-block="${CALLOUT}"] > h2`).click();
		await expect(page).toHaveURL(new RegExp(`/block/edit/${CALLOUT}/`));
		await expectFocus(page, 'title', 'Verdieping: blocks in blocks');
		await closeModals(page);
	});

	test('"Update & save" in een genest block: alle blocks bijgewerkt en het document opgeslagen in één klik', async ({ page }) => {
		await page.goto(documentViewUrl(A, 'visual-editing'));
		await expect(ready(page)).toBeVisible({ timeout: 30_000 });
		const frame = preview(page);
		const author = frame.locator(`[data-umb-block="${NESTED_QUOTE}"] figcaption`);
		const updateAndSave = () => modal(page).getByRole('button', { name: 'Update & save' });

		for (const value of [`Nina Nest (bewerkt ${Date.now()})`, 'Nina Nest']) {
			await author.click();
			await expectFocus(page, 'author');
			await expect(page.locator('umb-workspace-modal')).toHaveCount(2);
			await page.keyboard.press('Control+A');
			await page.keyboard.type(value);
			await expectFocus(page, 'author', value);
			await updateAndSave().click();
			// Beide modals dicht (geen "Discard unsaved changes"), document opgeslagen, preview herladen.
			await expect(page.locator('umb-workspace-modal')).toHaveCount(0);
			await expect(page.locator('uui-dialog-layout')).toHaveCount(0);
			await expect(author).toHaveText(`— ${value}`, { timeout: 20_000 });
		}
	});

	test('nooit gepubliceerd document: de preview toont het concept', async ({ page }) => {
		const key = '5e0d0000-0000-4000-8000-0000000009e2';
		const title = 'Concept zonder publicatie';
		await managementApi(page, 'DELETE', `/document/${key}`); // restant van een afgebroken run
		const created = await managementApi(page, 'POST', '/document', {
			id: key,
			parent: { id: KEYS.home },
			documentType: { id: '5e0d0000-0000-4000-8000-000000000002' },
			template: null,
			values: [{ alias: 'title', value: title, culture: null, segment: null }],
			variants: [{ name: title, culture: null, segment: null }],
		});
		expect(created.status).toBe(201);
		try {
			await page.goto(documentViewUrl(key, 'visual-editing'));
			await expect(ready(page)).toBeVisible({ timeout: 30_000 });
			// Umbraco geeft het concept in preview de tijdelijke route /preview-{key}/.
			expect(await preview(page).locator('body').evaluate(() => location.pathname)).toBe(`/preview-${key}/`);
			await expect(preview(page).locator('h1')).toHaveText(title);
			await preview(page).locator('h1').click();
			await expectFocus(page, 'title', title);
		} finally {
			expect((await managementApi(page, 'DELETE', `/document/${key}`)).status).toBe(200);
		}
	});

	test('klik op een artikelkaart (link) op home → naar het artikel in Visual editing, titel in focus; terug → home', async ({ page }) => {
		await page.goto(documentViewUrl(KEYS.home, 'visual-editing'));
		await expect(ready(page)).toBeVisible({ timeout: 30_000 });
		const frame = preview(page);
		await frame.locator(`.card a[data-umb-doc="${B}"][data-umb-prop="title"]`).click();

		// De backoffice gaat naar artikel B (geen modal); de preview toont de artikelpagina en de titel heeft focus.
		await expect(page).toHaveURL(new RegExp(`/edit/${B}/invariant/view/visual-editing/tab/inhoud$`));
		await expect(page.locator('umb-workspace-modal')).toHaveCount(0);
		await expect(ready(page)).toBeVisible({ timeout: 30_000 });
		await expect(frame.locator('h1')).toHaveText('Componenten als contract');
		expect(await frame.locator('body').evaluate(() => location.pathname)).toBe('/componenten-als-contract/');
		await expectFocus(page, 'title', 'Componenten als contract');

		// Terug in de browser: weer de homepage.
		await page.goBack();
		await expect(page).toHaveURL(new RegExp(`/edit/${KEYS.home}/invariant/view/visual-editing`));
		await expect(ready(page)).toBeVisible({ timeout: 30_000 });
		expect(await frame.locator('body').evaluate(() => location.pathname)).toBe('/');
	});
});
