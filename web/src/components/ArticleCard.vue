<script setup lang="ts">
import { useEdit, type EditDescriptor } from '../edit/attrs';

const props = defineProps<{ href: string; title: string; intro?: string | null; image?: string | null; edit?: EditDescriptor }>();
const e = useEdit(() => props.edit);
</script>

<template>
	<article class="card">
		<img v-if="image" :src="image" alt="" width="1200" height="600" v-bind="e.field('image')" />
		<h2><a :href="href" v-bind="e.field('title')">{{ title }}</a></h2>
		<p v-if="intro" v-bind="e.field('intro')">{{ intro }}</p>
	</article>
</template>

<style scoped>
.card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg); }
.card img { display: block; width: 100%; height: auto; aspect-ratio: 2 / 1; object-fit: cover; }
.card h2 { font-size: 1.2rem; margin: 1rem 1rem 0.5rem; }
.card h2 a { color: inherit; text-decoration: none; }
.card h2 a:hover { text-decoration: underline; }
.card p { margin: 0 1rem 1rem; color: var(--muted); }
</style>
