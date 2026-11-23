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

/**
 * Het element dat echt focus heeft (door shadow roots heen), met de alias van de omliggende `umb-property`
 * en de huidige waarde van het invoerveld.
 */
export function focused(page: Page) {
	return page.evaluate(() => {
		let el: any = document.activeElement;
		while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
		let p: any = el;
		while (p && p.localName !== 'umb-property') p = p.parentNode instanceof ShadowRoot ? p.parentNode.host : p.parentNode;
		return { tag: el?.localName as string | undefined, property: p?.alias as string | undefined, value: el?.value as string | undefined };
	});
}
