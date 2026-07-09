<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import MainView from "@/components/dashboard/MainView.vue";
import MobileView from "@/components/dashboard/MobileView.vue";
import useScreenSize from "@/composables/use-screen-size";

const { isSmallViewport } = useScreenSize();
</script>

<template>
  <MobileView v-if="isSmallViewport" />
  <MainView v-else />
</template>
