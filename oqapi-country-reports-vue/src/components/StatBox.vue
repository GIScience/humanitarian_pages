<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
  centered?: boolean;
}>();
</script>

<template>
  <div
    class="bg-white border border-gray-200 rounded-md shadow-sm"
    :class="{ 'flex flex-col items-center justify-center': centered }"
  >
    <h3 class="text-2xl mt-2 mb-0 min-h-[2.4rem]">{{ title }}</h3>
    <h4 v-if="subtitle" class="my-2 min-h-[1.2rem] text-sm">{{ subtitle }}</h4>
  </div>
</template>
