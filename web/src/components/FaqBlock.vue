<script setup lang="ts">
import { useEdit, type EditDescriptor } from '../edit/attrs';
import type { RenderMode } from '../lib/render-mode';

/**
 * Uitklapblok ("Veelgestelde vraag"). Live en in preview een gewoon <details>-element: dicht tot de bezoeker klikt.
 * In edit-modus altijd open en zonder <summary>: een dichtgeklapt antwoord kun je niet aanklikken, en een klik op een
 * <summary> zou het blok in- en uitklappen in plaats van het veld te openen.
 */
const props = defineProps<{ question: string; answer: string; mode: RenderMode; edit?: EditDescriptor }>();
const e = useEdit(() => props.edit);
</script>

<template>
	<div v-if="mode === 'edit'" class="faq-block is-open" v-bind="e.root()">
		<h3 class="question" v-bind="e.field('question')">{{ question }}</h3>
		<p class="answer" v-bind="e.field('answer')">{{ answer }}</p>
	</div>
	<details v-else class="faq-block">
		<summary class="question">{{ question }}</summary>
		<p class="answer">{{ answer }}</p>
	</details>
</template>

<style scoped>
.faq-block { margin: 0 0 2rem; padding: 1rem 1.25rem; border: 1px solid var(--border); border-radius: 12px; }
.question { font-size: 1.1rem; font-weight: 600; margin: 0; cursor: pointer; }
.is-open .question { cursor: default; }
.answer { margin: 0.75rem 0 0; line-height: 1.6; }
</style>
