// Testrunner: node scripts/test.mjs [all|api|web|e2e] [extra playwright-argumenten]
// - api/all: neemt eerst de baseline op met de extensie UIT (scripts/record-baseline.mjs), zodat de integratietests
//   kunnen vergelijken met exact de standaard-Umbraco-API. De CMS mag dan nog niet draaien.
// - e2e/all: bouwt eerst de backoffice-extensie.
// Playwright start daarna zelf de CMS (extensie aan) en de gebouwde Astro-server (tests/playwright.config.ts).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [suite = 'all', ...rest] = process.argv.slice(2);
const projects = suite === 'all' ? ['api', 'web', 'e2e'] : [suite];

function run(cmd, args, opts = {}) {
	const r = spawnSync([cmd, ...args].join(' '), { cwd: root, stdio: 'inherit', shell: true, ...opts });
	if (r.status !== 0) process.exit(r.status ?? 1);
}

if (projects.includes('e2e') && existsSync(new URL('../backoffice/vite.config.ts', import.meta.url))) {
	run('npm', ['run', 'backoffice:build']);
}
if (projects.includes('api')) {
	run('node', ['scripts/record-baseline.mjs']);
}
run('npx', ['playwright', 'test', '-c', 'tests/playwright.config.ts', ...projects.flatMap((p) => ['--project', p]), ...rest]);
