<script setup lang="ts">
defineProps<{ homeHref: string; preview: boolean }>();
</script>

<template>
	<div class="site-header">
		<a class="brand" :href="homeHref">Visual Editing PoC</a>
		<span v-if="preview" class="badge">Preview</span>
	</div>
</template>

<style scoped>
.site-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; border-bottom: 1px solid var(--border); }
.brand { font-weight: 700; color: inherit; text-decoration: none; }
.badge { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; padding: 0.2rem 0.6rem; border-radius: 999px; background: var(--accent); color: #fff; }
</style>
