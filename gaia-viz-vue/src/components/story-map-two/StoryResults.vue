<script setup lang="ts">
import type { Results } from "@/types/story-map";
import Icon from "./Icon.vue";

defineProps<{ results: Results }>();
const fmt = (n: number) => n.toLocaleString("en-US");
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
    <div class="text-xs font-semibold text-gray-700">{{ results.title }}</div>
    <ul class="mt-2 space-y-2">
      <li
        v-for="row in results.rows"
        :key="row.name"
        class="flex items-baseline justify-between gap-3"
      >
        <span class="text-xs text-gray-500">{{ row.name }}</span>
        <span class="text-right">
          <span class="text-sm font-bold text-gray-800">{{ fmt(row.value) }}</span>
          <span class="block text-[10px] leading-none text-gray-400">{{ results.unit }}</span>
        </span>
      </li>
    </ul>
    <a
      v-if="results.link"
      :href="results.link.href"
      class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
    >
      {{ results.link.label }}
      <Icon name="external-link" class="h-3 w-3" />
    </a>
  </div>
</template>