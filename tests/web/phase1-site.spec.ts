import { expect, test } from '@playwright/test';
import { previewUrl } from '../support/env';

test.describe('fase 1: site en preview', () => {
	test('gepubliceerde artikelpagina toont de titel', async ({ page }) => {
		await page.goto('/waarom-headless/');
		await expect(page.locator('h1')).toHaveText('Waarom headless?');
		await expect(page.locator('.quote-block blockquote')).toHaveText('Wie de componenten beheert, beheert ook de edit-metadata.');
	});

	test('gepubliceerde pagina toont niet de concepttitel', async ({ page }) => {
		await page.goto('/preview-zonder-cookies/');
		await expect(page.locator('h1')).toHaveText('Preview zonder cookies');
	});

	test('preview-modus toont de gewijzigde, niet-gepubliceerde titel', async ({ page }) => {
		await page.goto(previewUrl('/preview-zonder-cookies/'));
		await expect(page.locator('h1')).toHaveText('Preview zonder cookies (concept)');
		await expect(page.locator('.badge')).toHaveText('Preview');
	});

	test('ongeldig preview-token geeft gewoon de gepubliceerde versie', async ({ page }) => {
		await page.goto('/preview-zonder-cookies/?preview=1.ongeldig');
		await expect(page.locator('h1')).toHaveText('Preview zonder cookies');
	});

	test('home toont de artikelen; alleen het citaatblok wordt gehydrateerd', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('.card')).toHaveCount(3);
		await page.goto('/waarom-headless/');
		// Precies één Astro-eiland (QuoteBlock); de rest is statische HTML.
		await expect(page.locator('astro-island')).toHaveCount(1);
		await expect(page.locator('astro-island .quote-block')).toHaveCount(1);
		const copy = page.getByRole('button', { name: 'Kopieer citaat' });
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		await copy.click();
		await expect(page.getByRole('button', { name: 'Gekopieerd!' })).toBeVisible();
	});
});
