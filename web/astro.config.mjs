// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import node from '@astrojs/node';

// SSR is vereist voor preview: concept-content wordt per request opgehaald.
export default defineConfig({
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	integrations: [vue()],
	server: { port: 4321, host: true },
	devToolbar: { enabled: false },
});
