// Eén commando voor lokaal ontwikkelen: bouwt de backoffice-extensie, start de CMS en Astro (dev-modus).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (existsSync(new URL('../backoffice/vite.config.ts', import.meta.url))) {
	const build = spawnSync(npm, ['run', 'backoffice:build'], { cwd: root, stdio: 'inherit', shell: true });
	if (build.status !== 0) process.exit(build.status ?? 1);
}

const procs = [
	['cms', 'node', ['scripts/cms.mjs']],
	['web', npm, ['run', 'web:dev']],
].map(([name, cmd, args]) => {
	const p = spawn(cmd, args, { cwd: root, shell: true, env: process.env });
	const prefix = (chunk) => chunk.toString().split(/\r?\n/).filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
	p.stdout.on('data', (c) => process.stdout.write(prefix(c)));
	p.stderr.on('data', (c) => process.stderr.write(prefix(c)));
	p.on('exit', (code) => {
		console.log(`[${name}] gestopt (${code})`);
		shutdown();
	});
	return p;
});

console.log('\nCMS:      http://localhost:17575/umbraco  (editor@visualediting.test / VisualEditing!2026)');
console.log('Frontend: http://localhost:4321\n');

let stopping = false;
function shutdown() {
	if (stopping) return;
	stopping = true;
	// Op Windows stopt kill() bij shell: true alleen de shell; taskkill /T stopt de hele procesboom (dotnet, astro).
	for (const p of procs) {
		if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
		else p.kill();
	}
	process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
