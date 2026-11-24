<script setup lang="ts">
import { useEdit, type EditDescriptor } from '../edit/attrs';

/**
 * "Uitgelicht": een kader met een titel en eigen blocks (geneste Block List). De geneste blocks komen via de slot
 * binnen (BlockList.astro rendert ze recursief) en hebben hun eigen edit-attributen.
 */
const props = defineProps<{ title: string; edit?: EditDescriptor }>();
const e = useEdit(() => props.edit);
</script>

<template>
	<aside class="callout-block" v-bind="e.root()">
		<h2 v-bind="e.field('title')">{{ title }}</h2>
		<div class="items"><slot /></div>
	</aside>
</template>

<style scoped>
.callout-block { margin: 0 0 2rem; padding: 1.5rem 1.75rem 0.25rem; border: 1px solid var(--border); border-radius: 12px; }
.callout-block h2 { font-size: 1.25rem; margin: 0 0 1rem; }
</style>
