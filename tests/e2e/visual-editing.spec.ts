import { expect, test, type Page } from '@playwright/test';
import { KEYS } from '../support/env';
import { documentViewUrl, login } from '../support/backoffice';

/**
 * Fase 4: end-to-end door de echte backoffice heen.
 * 1. inloggen  2. artikel A openen en de Visual editing-view kiezen  3. klik op het citaatblok in de iframe →
 * juiste document, tab, property en block  4. titel wijzigen, opslaan → iframe toont de nieuwe titel op dezelfde
 * scrollpositie.
 */
const A = KEYS.articleA;
const QUOTE = KEYS.block(1, 2);
const ORIGINAL_TITLE = 'Waarom headless?';

const view = (page: Page) => page.locator('visual-editing-workspace-view');
const preview = (page: Page) => page.frameLocator('visual-editing-workspace-view iframe');
const ready = (page: Page) => view(page).locator('#preview[data-ready]');
const html = (page: Page) => page.locator('html');
const saveButton = (page: Page) => page.getByRole('button', { name: /^(save|opslaan)$/i });
const titleInput = (page: Page) => view(page).locator('umb-property[data-mark="property:title"] input');

test.describe('fase 4: visual editing in de backoffice', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('klik op citaatblok → juist document en property; opslaan → nieuwe titel op dezelfde scrollpositie', async ({ page }) => {
		// 2. Artikel A openen (standaard de Content-view) en de Visual editing-view kiezen.
		await page.goto(documentViewUrl(A, 'content'));
		await page.getByRole('tab', { name: 'Visual editing' }).click();
		await expect(page).toHaveURL(new RegExp(`/edit/${A}/invariant/view/visual-editing`));
		await expect(ready(page)).toBeVisible({ timeout: 30_000 });
		const frame = preview(page);
		await expect(frame.locator('h1')).toHaveText(ORIGINAL_TITLE);

		// 3. Klik op het citaatblok in de iframe.
		await frame.locator(`.quote-block[data-umb-block="${QUOTE}"] blockquote`).click();
		await expect(page).toHaveURL(new RegExp(`/edit/${A}/invariant/view/visual-editing/tab/blocks$`));
		await expect(html(page)).toHaveAttribute('data-visual-editing-focus-property', 'blocks');
		await expect(html(page)).toHaveAttribute('data-visual-editing-focus-block', QUOTE);
		// Het block-item van het citaat staat in beeld in de editor.
		const entry = view(page).locator('umb-block-list-entry').nth(2);
		await expect(entry).toContainText('Citaat: Ada de Redacteur');
		await expect(entry).toBeInViewport();

		// 4. Klik op de titel → tab Inhoud, property title. Titel wijzigen en opslaan.
		await frame.locator('h1').click();
		await expect(page).toHaveURL(/\/view\/visual-editing\/tab\/inhoud$/);
		await expect(html(page)).toHaveAttribute('data-visual-editing-focus-property', 'title');
		await expect(titleInput(page)).toHaveValue(ORIGINAL_TITLE);

		const newTitle = `Waarom headless? (bewerkt ${Date.now()})`;
		await titleInput(page).fill(newTitle);
		await frame.locator('body').evaluate(() => window.scrollTo(0, 700));
		expect(await frame.locator('body').evaluate(() => window.scrollY)).toBe(700);
		await saveButton(page).click();

		await expect(frame.locator('h1')).toHaveText(newTitle, { timeout: 20_000 });
		await expect(ready(page)).toBeVisible();
		expect(await frame.locator('body').evaluate(() => window.scrollY)).toBe(700);
		// De pagina is echt herladen (nieuwe iframe-URL met cache-buster).
		expect(await view(page).locator('iframe').getAttribute('src')).toContain('rnd=');

		// Opruimen: concepttitel terugzetten (gepubliceerd is nooit veranderd).
		await titleInput(page).fill(ORIGINAL_TITLE);
		await saveButton(page).click();
		await expect(frame.locator('h1')).toHaveText(ORIGINAL_TITLE, { timeout: 20_000 });
	});

	test('klik op een ander document (artikelkaart op home) → navigeert naar dat document', async ({ page }) => {
		await page.goto(documentViewUrl(KEYS.home, 'visual-editing'));
		await expect(ready(page)).toBeVisible({ timeout: 30_000 });
		await preview(page).locator(`.card [data-umb-doc="${KEYS.articleB}"][data-umb-prop="title"]`).click();
		await expect(page).toHaveURL(new RegExp(`/edit/${KEYS.articleB}/invariant/view/visual-editing`));
		await expect(ready(page)).toBeVisible({ timeout: 30_000 });
		await expect(preview(page).locator('h1')).toHaveText('Componenten als contract');
		await expect(html(page)).toHaveAttribute('data-visual-editing-focus-property', 'title');
		await expect(titleInput(page)).toHaveValue('Componenten als contract');
	});
});
