<script setup lang="ts">
import { useEdit, type EditDescriptor } from '../edit/attrs';

const props = defineProps<{ src: string; alt: string; edit?: EditDescriptor }>();
const e = useEdit(() => props.edit);
</script>

<template>
	<figure class="article-image" v-bind="e.field('image')">
		<img :src="src" :alt="alt" width="1200" height="600" />
	</figure>
</template>

<style scoped>
.article-image { margin: 0 0 2.5rem; }
.article-image img { display: block; width: 100%; height: auto; border-radius: 12px; }
</style>
