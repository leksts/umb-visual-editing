<script setup lang="ts">
import { ref } from 'vue';
import { useEdit, type EditDescriptor } from '../edit/attrs';

/**
 * Het enige interactieve (gehydrateerde) component: kopieert het citaat en kan de auteur in-/uitklappen.
 * Beide acties veroorzaken een re-render; de edit-attributen blijven staan omdat ze bij de vnode-props horen.
 */
const props = defineProps<{ quote: string; author?: string | null; edit?: EditDescriptor }>();
const e = useEdit(() => props.edit);

const status = ref<'idle' | 'copied' | 'failed'>('idle');
const showAuthor = ref(true);

async function copy() {
	try {
		await navigator.clipboard.writeText(props.author ? `"${props.quote}" — ${props.author}` : props.quote);
		status.value = 'copied';
	} catch {
		status.value = 'failed';
	}
}
</script>

<template>
	<figure class="quote-block" v-bind="e.root()" :data-status="status">
		<blockquote v-bind="e.field('quote')">{{ quote }}</blockquote>
		<figcaption v-if="author && showAuthor" v-bind="e.field('author')">— {{ author }}</figcaption>
		<div class="actions">
			<button type="button" class="copy" @click="copy">
				{{ status === 'copied' ? 'Gekopieerd!' : status === 'failed' ? 'Kopiëren mislukt' : 'Kopieer citaat' }}
			</button>
			<button v-if="author" type="button" class="toggle" @click="showAuthor = !showAuthor">
				{{ showAuthor ? 'Verberg auteur' : 'Toon auteur' }}
			</button>
		</div>
	</figure>
</template>

<style scoped>
.quote-block { margin: 0 0 2rem; padding: 1.5rem 1.75rem; border-left: 4px solid var(--accent); background: var(--soft); border-radius: 0 12px 12px 0; }
blockquote { margin: 0 0 0.75rem; font-size: 1.4rem; line-height: 1.4; font-style: italic; }
figcaption { color: var(--muted); margin-bottom: 0.75rem; }
.actions { display: flex; gap: 0.5rem; }
button { font: inherit; font-size: 0.875rem; padding: 0.35rem 0.75rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); color: inherit; cursor: pointer; }
button:hover { border-color: var(--accent); }
</style>
