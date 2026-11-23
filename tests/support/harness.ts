import { expect, type FrameLocator, type Page } from '@playwright/test';
import { FOREIGN_WEB_URL, WEB_URL } from './env';

export interface Logged {
	origin: string;
	data: Record<string, unknown> & { type: string };
}

export interface HarnessOptions {
	target?: string;
	edit?: boolean;
	auto?: boolean;
	/** Origin van de nep-parent zelf (WEB_URL = toegestaan, FOREIGN_WEB_URL = niet toegestaan). */
	parentOrigin?: string;
}

/** Opent de nep-parent (web/src/pages/test/harness.astro). */
export async function openHarness(page: Page, opts: HarnessOptions = {}) {
	const parent = opts.parentOrigin ?? WEB_URL;
	const q = new URLSearchParams({
		target: opts.target ?? '/waarom-headless/',
		edit: opts.edit === false ? '0' : '1',
		auto: opts.auto === false ? '0' : '1',
		frame: WEB_URL,
	});
	await page.goto(`${parent}/test/harness?${q}`);
	await page.waitForFunction(() => 'harness' in window);
	const frame = page.frameLocator('#preview');
	return { frame };
}

export function messages(page: Page): Promise<Logged[]> {
	return page.evaluate(() => (window as any).harness.messages.map((m: unknown) => JSON.parse(JSON.stringify(m))));
}

export async function waitForReady(page: Page) {
	await expect.poll(async () => (await messages(page)).some((m) => m.data.type === 'ready')).toBe(true);
}

export async function lastEdit(page: Page, previousCount = 0) {
	await expect
		.poll(async () => (await messages(page)).filter((m) => m.data.type === 'edit').length)
		.toBeGreaterThan(previousCount);
	const edits = (await messages(page)).filter((m) => m.data.type === 'edit');
	return edits[edits.length - 1].data;
}

export async function editCount(page: Page) {
	return (await messages(page)).filter((m) => m.data.type === 'edit').length;
}

/** Label in de overlay (shadow DOM van <umb-ve-overlay>) na hoveren over een element in het iframe. */
export async function hoverAndGetOverlayLabel(frame: FrameLocator, selector: string) {
	const target = frame.locator(selector).first();
	await target.hover();
	const overlay = frame.locator('umb-ve-overlay');
	const expected = await target.evaluate((el) => el.closest('[data-umb-doc]')?.getAttribute('data-umb-label'));
	await expect(overlay).toHaveAttribute('data-target-label', expected ?? /.+/);
	await expect(overlay.locator('.box')).toBeVisible();
	return overlay.getAttribute('data-target-label');
}

export { FOREIGN_WEB_URL };
