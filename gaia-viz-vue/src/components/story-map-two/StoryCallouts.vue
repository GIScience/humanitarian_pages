<script setup lang="ts">
import type { Callout } from "@/types/story-map";
import Icon from "./Icon.vue";

defineProps<{ callouts: Callout[] }>();
</script>

<template>
  <div class="grid grid-cols-1 gap-6 rounded-xl border border-gray-200 bg-gray-50 p-6 md:grid-cols-2">
    <div v-for="c in callouts" :key="c.title">
      <div class="flex items-center gap-2">
        <Icon
          :name="c.icon"
          class="h-5 w-5"
          :class="c.variant === 'positive' ? 'text-emerald-600' : 'text-amber-500'"
        />
        <h4
          class="text-sm font-bold"
          :class="c.variant === 'positive' ? 'text-emerald-700' : 'text-amber-700'"
        >
          {{ c.title }}
        </h4>
      </div>
      <p v-if="c.body" class="mt-2 text-sm leading-relaxed text-gray-600">{{ c.body }}</p>
      <ul v-if="c.items" class="mt-2 space-y-1.5">
        <li
          v-for="(item, i) in c.items"
          :key="i"
          class="flex gap-2 text-sm leading-relaxed text-gray-600"
        >
          <span class="mt-2 h-1 w-1 flex-none rounded-full bg-gray-400" />
          {{ item }}
        </li>
      </ul>
    </div>
  </div>
</template>