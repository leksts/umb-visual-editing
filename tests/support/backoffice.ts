import { expect, type Page } from '@playwright/test';

/** Testgebruiker uit de unattended install (cms/VisualEditing.Cms/appsettings.Development.json). */
export const EDITOR = {
	email: process.env.UMBRACO_USER ?? 'editor@visualediting.test',
	password: process.env.UMBRACO_PASSWORD ?? 'VisualEditing!2026',
};

export async function login(page: Page) {
	await page.goto('/umbraco');
	const user = page.getByLabel(/e-?mail|gebruikersnaam|username/i).first();
	await expect(user).toBeVisible({ timeout: 30_000 });
	await user.fill(EDITOR.email);
	await page.getByLabel(/wachtwoord|password/i).first().fill(EDITOR.password);
	await page.getByRole('button', { name: /inloggen|login|sign in/i }).click();
	await expect(page.locator('umb-backoffice-header, umb-app-header').first()).toBeVisible({ timeout: 30_000 });
}

/** Pad binnen de backoffice naar een document-view. */
export function documentViewUrl(key: string, view: string) {
	return `/umbraco/section/content/workspace/document/edit/${key}/invariant/view/${view}`;
}
