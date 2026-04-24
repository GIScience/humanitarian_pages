<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import MainView from './MainView.vue';
import MobileView from './MobileView.vue';

const isMobile = ref(false);

const checkViewport = () => {
  isMobile.value = window.innerWidth < 768; // Standard md breakpoint
};

onMounted(() => {
  checkViewport();
  window.addEventListener('resize', checkViewport);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport);
});
</script>

<template>
  <MobileView v-if="isMobile" />
  <MainView v-else />
</template>
