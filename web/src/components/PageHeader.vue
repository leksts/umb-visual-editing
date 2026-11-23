<script setup lang="ts">
import { useEdit, type EditDescriptor } from '../edit/attrs';

const props = defineProps<{ title: string; intro?: string | null; edit?: EditDescriptor }>();
const e = useEdit(() => props.edit);
</script>

<template>
	<header class="page-header">
		<h1 class="page-title" v-bind="e.field('title')">{{ title }}</h1>
		<p v-if="intro" class="page-intro" v-bind="e.field('intro')">{{ intro }}</p>
	</header>
</template>

<style scoped>
.page-header { margin: 2.5rem 0 1.5rem; }
.page-title { font-size: clamp(2rem, 5vw, 3.25rem); line-height: 1.1; margin: 0 0 1rem; letter-spacing: -0.02em; }
.page-intro { font-size: 1.25rem; color: var(--muted); margin: 0; max-width: 60ch; }
</style>
