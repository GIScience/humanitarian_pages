<script setup lang="ts">
import type { EquationTerm } from "@/types/story-map";
defineProps<{ terms: EquationTerm[] }>();
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
    <template v-for="(term, i) in terms" :key="i">
      <div v-if="term.kind === 'operator'" class="text-2xl font-light text-gray-400">
        {{ term.symbol }}
      </div>
      <figure v-else class="flex w-40 flex-col items-center text-center">
        <img :src="term.image" :alt="term.alt" class="h-14 w-auto object-contain" />
        <figcaption class="mt-2 text-sm font-semibold text-gray-800">{{ term.label }}</figcaption>
        <span v-if="term.sublabel" class="text-xs text-gray-500">{{ term.sublabel }}</span>
      </figure>
    </template>
  </div>
</template>