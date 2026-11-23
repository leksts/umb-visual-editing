import { defineConfig, devices } from '@playwright/test';
import { CMS_URL, WEB_URL } from './support/env';

/**
 * Start zelf de CMS (dotnet) en de gebouwde Astro-server, tenzij ze al draaien (reuseExistingServer).
 * Projecten: web (frontend + protocol), api (Delivery API-integratie), e2e (door de backoffice heen).
 */
export default defineConfig({
	testDir: '.',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [['list']],
	use: {
		...devices['Desktop Chrome'],
		trace: 'retain-on-failure',
	},
	projects: [
		{ name: 'api', testMatch: 'api/**/*.spec.ts' },
		{ name: 'web', testMatch: 'web/**/*.spec.ts', use: { baseURL: WEB_URL } },
		{ name: 'e2e', testMatch: 'e2e/**/*.spec.ts', use: { baseURL: CMS_URL } },
	],
	webServer: [
		{
			command: 'node ../scripts/cms.mjs',
			url: `${CMS_URL}/umbraco/delivery/api/v2/content`,
			reuseExistingServer: true,
			timeout: 240_000,
			stdout: 'ignore',
		},
		{
			command: 'npm run web:build --prefix .. && npm run web:start --prefix ..',
			url: WEB_URL,
			reuseExistingServer: true,
			timeout: 180_000,
		},
	],
});
