<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageLayout from "@/layout/PageLayout.vue";
import StoryMap from "@/components/story-map-two/StoryMap.vue";
import type { StoryMapConfig } from "@/types/story-map";

const route = useRoute();
const router = useRouter();

const modules = import.meta.glob<{ default: StoryMapConfig }>(
  "@/content/story-maps/*.json",
  {
    eager: true,
  },
);

const configsById: Record<string, StoryMapConfig> = {};
for (const path in modules) {
  const id = path.split("/").pop()!.replace(".json", "");
  configsById[id] = modules[path].default;
}

const config = ref<StoryMapConfig | null>(null);

watchEffect(() => {
  const id = route.params.id as string;
  const match = configsById[id];

  if (match) {
    config.value = match;
  } else {
    router.replace({ path: "/404" });
  }
});

const pageTitle = computed(
  () => config.value?.storyMap.sidebar.title ?? "Story Map",
);
</script>

<template>
  <PageLayout :title="pageTitle">
    <StoryMap v-if="config" :config="config" />
  </PageLayout>
</template>
