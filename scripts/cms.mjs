// Start de Umbraco-site (bouwt eerst). Gebruikt door `npm run cms`, `npm run dev` en Playwright (webServer).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const url = process.env.UMBRACO_URL ?? 'http://localhost:17575';

const child = spawn(
	'dotnet',
	['run', '--project', 'cms/VisualEditing.Cms', '--no-launch-profile', '--urls', url],
	{
		cwd: root,
		stdio: 'inherit',
		env: { ASPNETCORE_ENVIRONMENT: 'Development', DOTNET_CLI_TELEMETRY_OPTOUT: '1', ...process.env },
	},
);
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
