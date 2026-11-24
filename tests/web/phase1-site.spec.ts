import { expect, test } from '@playwright/test';
import { previewUrl } from '../support/env';

test.describe('fase 1: site en preview', () => {
	test('gepubliceerde artikelpagina toont de titel', async ({ page }) => {
		await page.goto('/waarom-headless/');
		await expect(page.locator('h1')).toHaveText('Waarom headless?');
		await expect(page.locator('.quote-block blockquote').first()).toHaveText('Wie de componenten beheert, beheert ook de edit-metadata.');
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
		// Alleen de citaatblokken (ook het geneste in "Uitgelicht") zijn Astro-eilanden; de rest is statische HTML.
		await expect(page.locator('astro-island')).toHaveCount(2);
		await expect(page.locator('astro-island .quote-block')).toHaveCount(2);
		await expect(page.locator('.callout-block astro-island .quote-block')).toHaveCount(1);
		const copy = page.getByRole('button', { name: 'Kopieer citaat' }).first();
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		await copy.click();
		await expect(page.getByRole('button', { name: 'Gekopieerd!' })).toBeVisible();
	});
});
