<script setup lang="ts">
import { computed } from "vue";


const props = defineProps<{ text: string }>();

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string) {
  let h = escapeHtml(s);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return h;
}
const paragraphs = computed(() =>
  props.text.split(/\n{2,}/).map((p) => inline(p).replace(/\n/g, "<br>"))
);
</script>

<template>
  <div class="rich-text">
    <p v-for="(p, i) in paragraphs" :key="i" :class="{ 'mt-2': i > 0 }" v-html="p" />
  </div>
</template>

<style scoped>
.rich-text :deep(strong) {
  color: var(--heigit-red);
  font-weight: 600;
}
.rich-text :deep(a) {
  color: var(--heigit-red);
  text-decoration: underline;
}
</style>