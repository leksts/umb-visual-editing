import { expect, test, type Page } from '@playwright/test';
import { FOREIGN_WEB_URL, KEYS, previewUrl } from '../support/env';

/**
 * Modi live / preview / edit (DECISIONS.md D23) op artikel B, met een uitklapblok en een wisselkoersblock dat een
 * "externe" API aanroept. In de tests is die API een nep-endpoint op een andere origin (playwright.config.ts).
 */
const PAGE = '/componenten-als-contract/';
const FAQ = KEYS.block(2, 2);
const RATE = KEYS.block(2, 3);
const RATES_ORIGIN = new URL(FOREIGN_WEB_URL).origin;

function rateRequests(page: Page) {
	const urls: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('/test/rates.json')) urls.push(r.url());
	});
	return urls;
}

test.describe('modi: live, preview en edit', () => {
	test('live: uitklapblok dicht, koers live opgehaald, geen connect-src-beperking', async ({ page }) => {
		const requests = rateRequests(page);
		const res = await page.goto(PAGE);
		expect(res!.headers()['content-security-policy']).toBe("frame-ancestors 'self'");
		await expect(page.locator('details.faq-block')).toHaveCount(1);
		await expect(page.locator('details.faq-block')).not.toHaveAttribute('open', /.*/);
		await expect(page.locator('.rate-block')).toHaveAttribute('data-status', 'ok');
		await expect(page.locator('.rate-block strong')).toHaveText('1,2345');
		expect(requests).toHaveLength(1);
		expect(requests[0]).toContain('to=USD');
	});

	test('preview: zoals live (koers alleen gelezen), connect-src staat alleen de geconfigureerde API toe', async ({ page }) => {
		const requests = rateRequests(page);
		const res = await page.goto(previewUrl(PAGE));
		expect(res!.headers()['content-security-policy']).toContain(`connect-src 'self' ${RATES_ORIGIN}`);
		await expect(page.locator('details.faq-block')).not.toHaveAttribute('open', /.*/);
		await expect(page.locator('.rate-block')).toHaveAttribute('data-behavior', 'readonly');
		await expect(page.locator('.rate-block')).toHaveAttribute('data-status', 'ok');
		expect(requests).toHaveLength(1);
	});

	test('edit: uitklapblok open en klikbaar per veld, koers is voorbeelddata zonder verzoek', async ({ page }) => {
		const requests = rateRequests(page);
		await page.goto(previewUrl(PAGE, { edit: true }));
		const faq = page.locator(`[data-umb-block="${FAQ}"]:not([data-umb-block-prop])`);
		await expect(faq).toHaveClass(/is-open/);
		await expect(page.locator('details.faq-block')).toHaveCount(0);
		await expect(faq.locator('[data-umb-block-prop="question"]')).toBeVisible();
		await expect(faq.locator('[data-umb-block-prop="answer"]')).toBeVisible();

		const rate = page.locator(`[data-umb-block="${RATE}"]:not([data-umb-block-prop])`);
		await expect(rate).toHaveAttribute('data-behavior', 'static');
		await expect(rate).toHaveAttribute('data-status', 'sample');
		// Gehydrateerd en nog steeds geen verzoek naar de externe API.
		await expect(rate.locator('xpath=ancestor::astro-island')).not.toHaveAttribute('ssr', /.*/);
		await page.waitForTimeout(500);
		expect(requests).toHaveLength(0);
	});

	test('edit: vangnet, een component dat zich niet aan de afspraak houdt kan de externe API niet bereiken', async ({ page }) => {
		const res = await page.goto(previewUrl(PAGE, { edit: true }));
		const connectSrc = res!.headers()['content-security-policy'].split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'));
		expect(connectSrc).toBe("connect-src 'self'");
		const outcome = await page.evaluate(async (url) => {
			const violation = new Promise<string>((resolve) =>
				document.addEventListener('securitypolicyviolation', (e) => resolve(e.violatedDirective), { once: true }),
			);
			const fetched = await fetch(url).then(
				() => 'opgehaald',
				() => 'geblokkeerd',
			);
			return { fetched, directive: await violation };
		}, `${RATES_ORIGIN}/test/rates.json?to=USD`);
		expect(outcome).toEqual({ fetched: 'geblokkeerd', directive: 'connect-src' });
	});
});
