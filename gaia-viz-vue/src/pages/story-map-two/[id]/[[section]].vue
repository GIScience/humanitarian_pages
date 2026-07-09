<script setup lang="ts">
import { computed } from "vue";
import PageLayout from "@/layout/PageLayout.vue";
import StoryMap from "@/components/story-map-two/StoryMap.vue";
import type { StoryMapConfig } from "@/types/story-map";
import floodExposure from "@/content/story-maps/flood-exposure.json";

// Static import for now. To make this route-driven, swap for a lazy import keyed
// by route.params.id, e.g.:
//   const modules = import.meta.glob("@/content/story-maps/*.json");
//   const config = (await modules[`/src/content/story-maps/${id}.json`]()).default;
const config = floodExposure as StoryMapConfig;

const pageTitle = computed(() => config.storyMap.sidebar.title);
</script>

<template>
  <PageLayout :title="pageTitle">
    <StoryMap :config="config" />
  </PageLayout>
</template>