import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Bouwt de backoffice-extensie als één ES-module. @umbraco-cms/backoffice/* blijft extern:
// de backoffice levert die modules zelf via zijn import map.
export default defineConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	publicDir: 'public',
	build: {
		lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'visual-editing' },
		outDir: '../cms/VisualEditing.Cms/App_Plugins/VisualEditing',
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: { external: [/^@umbraco/] },
	},
});
