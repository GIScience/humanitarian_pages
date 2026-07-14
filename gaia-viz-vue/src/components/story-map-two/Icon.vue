<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ name: string }>();

const paths: Record<string, string> = {
  "arrow-left": "md-icon-arrow-left",
  info: "md-icon-info",
  "check-circle": "md-icon-check-circle",
  "alert-triangle": "md-icon-alert-triangle",
  home: "md-icon-home",
  plus: "md-icon-plus",
  minus: "md-icon-minus",
  "external-link": "md-icon-external-link",
  grid: "md-icon-grid",
  layers: "md-icon-layers",
  user: "md-icon-user",
  "user-round": "md-icon-user-round",
  baby: "md-icon-baby",
  waves: "md-icon-waves",
};

const inner = computed(() => paths[props.name] ?? "");
</script>

<template>
  <v-icon :class="inner" class="bg-gray-300 inline-block w-6 h-6" />
</template>
