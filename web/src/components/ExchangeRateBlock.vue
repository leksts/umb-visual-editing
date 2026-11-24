<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useEdit, type EditDescriptor } from '../edit/attrs';
import type { Behavior } from '../lib/render-mode';

/**
 * Voorbeeld van een component dat een externe API aanroept (wisselkoers, in de browser opgehaald).
 * Wat het doet hangt af van `behavior` (lib/render-mode.ts):
 * - live / readonly: koers ophalen bij de API (alleen lezen, dus in preview ook toegestaan);
 * - static:          geen verzoek; een vaste voorbeeldwaarde (edit-modus: elke save herlaadt de preview);
 * - placeholder:     alleen een kader.
 */
const props = defineProps<{
	title: string;
	currency: string;
	apiUrl: string;
	behavior: Behavior;
	edit?: EditDescriptor;
}>();
const e = useEdit(() => props.edit);

const SAMPLE_RATE = 1.08;
const rate = ref<number | null>(props.behavior === 'static' ? SAMPLE_RATE : null);
const status = ref<'idle' | 'loading' | 'ok' | 'error' | 'sample'>(props.behavior === 'static' ? 'sample' : 'idle');

onMounted(async () => {
	if (props.behavior !== 'live' && props.behavior !== 'readonly') return;
	status.value = 'loading';
	try {
		const url = new URL(props.apiUrl);
		url.searchParams.set('from', 'EUR');
		url.searchParams.set('to', props.currency);
		const res = await fetch(url, { method: 'GET', credentials: 'omit' });
		const data = (await res.json()) as { rates?: Record<string, number> };
		const value = data.rates?.[props.currency];
		if (typeof value !== 'number') throw new Error('geen koers');
		rate.value = value;
		status.value = 'ok';
	} catch {
		status.value = 'error';
	}
});

const format = (n: number) => n.toLocaleString('nl-NL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
</script>

<template>
	<section class="rate-block" v-bind="e.root()" :data-status="status" :data-behavior="behavior">
		<h3 v-bind="e.field('title')">{{ title }}</h3>
		<p v-if="behavior === 'placeholder'" class="placeholder">Live wisselkoers ({{ currency }}): niet actief in deze modus.</p>
		<p v-else class="rate">
			1 EUR =
			<strong>{{ rate === null ? (status === 'error' ? '–' : '…') : format(rate) }}</strong>
			<span v-bind="e.field('currency')">{{ currency }}</span>
			<small v-if="status === 'sample'" class="note">voorbeeldwaarde (geen live koers in edit-modus)</small>
			<small v-else-if="status === 'error'" class="note">koers niet beschikbaar</small>
		</p>
	</section>
</template>

<style scoped>
.rate-block { margin: 0 0 2rem; padding: 1rem 1.25rem; background: var(--soft); border-radius: 12px; }
h3 { margin: 0 0 0.5rem; font-size: 1.1rem; }
.rate { margin: 0; font-size: 1.25rem; }
.note { display: block; color: var(--muted); font-size: 0.8rem; margin-top: 0.25rem; }
.placeholder { margin: 0; color: var(--muted); }
</style>
