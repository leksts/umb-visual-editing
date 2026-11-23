// Neemt de baseline op voor de API-integratietests: start de CMS met VisualEditing:Enabled=false (de composer
// registreert dan niets, dus exact standaard-Umbraco), voert de vaste set requests uit en slaat de ruwe responses op.
// Gebruik: node scripts/record-baseline.mjs   (de CMS mag op dat moment niet al draaien)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const CMS_URL = process.env.UMBRACO_URL ?? 'http://localhost:17575';
const out = new URL('../tests/api/.baseline/', import.meta.url);

async function up() {
	try {
		const r = await fetch(`${CMS_URL}/umbraco/delivery/api/v2/content`);
		return r.ok;
	} catch {
		return false;
	}
}

async function waitFor(predicate, timeoutMs, label) {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		if (await predicate()) return;
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error(`Time-out: ${label}`);
}

if (await up()) {
	console.error(`De CMS draait al op ${CMS_URL}. Stop hem eerst; de baseline moet zonder extensie worden opgenomen.`);
	process.exit(2);
}

const { REQUESTS } = await import('../tests/api/requests.mjs');

console.log('Baseline: CMS starten met VisualEditing__Enabled=false …');
const cms = spawn('node', ['scripts/cms.mjs'], {
	cwd: root,
	stdio: 'ignore',
	env: { ...process.env, VisualEditing__Enabled: 'false' },
});

try {
	await waitFor(up, 240_000, 'CMS start');
	mkdirSync(out, { recursive: true });
	for (const req of REQUESTS) {
		const res = await fetch(`${CMS_URL}${req.path}`, { headers: req.headers });
		const body = await res.text();
		writeFileSync(new URL(`${req.name}.json`, out), JSON.stringify({ status: res.status, body }));
		console.log(`  ${res.status} ${req.name}`);
	}
} finally {
	cms.kill();
	if (process.platform === 'win32') spawn('taskkill', ['/pid', String(cms.pid), '/T', '/F'], { stdio: 'ignore' });
	await waitFor(async () => !(await up()), 60_000, 'CMS stop');
}
console.log('Baseline opgeslagen in tests/api/.baseline/');
