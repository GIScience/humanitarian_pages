<script setup lang="ts">
import type { Legend } from "@/types/story-map";
defineProps<{ legend: Legend; floating?: boolean }>();
</script>

<template>
  <div :class="floating ? 'rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur' : ''">
    <div class="text-xs font-semibold text-gray-700">{{ legend.title }}</div>
    <ul class="mt-2 space-y-1">
      <li
        v-for="item in legend.items"
        :key="item.label"
        class="flex items-center gap-2 text-xs"
        :class="item.excluded ? 'text-gray-400' : 'text-gray-600'"
      >
        <span
          class="h-3 w-3 flex-none rounded-sm"
          :class="item.excluded ? 'ring-1 ring-inset ring-gray-300' : ''"
          :style="{ backgroundColor: item.color }"
        />
        {{ item.label }}
      </li>
    </ul>
  </div>
</template>