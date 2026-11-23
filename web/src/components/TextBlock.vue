<script setup lang="ts">
import { useEdit, type EditDescriptor } from '../edit/attrs';

const props = defineProps<{ heading: string; text: string; edit?: EditDescriptor }>();
const e = useEdit(() => props.edit);
</script>

<template>
	<section class="text-block" v-bind="e.root()">
		<h2 v-bind="e.field('heading')">{{ heading }}</h2>
		<p v-bind="e.field('text')">{{ text }}</p>
	</section>
</template>

<style scoped>
.text-block { margin: 0 0 2rem; }
.text-block h2 { font-size: 1.5rem; margin: 0 0 0.5rem; }
.text-block p { margin: 0; line-height: 1.7; }
</style>
