<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Section } from "@/types/story-map";
import { useReveal } from "@/composables/useReveal";
import StoryControl from "./StoryControl.vue";
import StoryMapPanel from "./StoryMapPanel.vue";
import Icon from "./Icon.vue";
import type { layerConfigType } from "@/types/story-map";

const props = defineProps<{ section: Section }>();
const el = ref<HTMLElement | null>(null);
const { revealed } = useReveal(el);

const defaultLayerConfig = computed(() =>
  props.section.control?.type === "segmented"
    ? props.section.control.options.find((c) => c.selected)?.layerConfig
    : undefined,
);

const layerConfig = ref<layerConfigType | undefined>(defaultLayerConfig.value);

watch(defaultLayerConfig, (config) => {
  layerConfig.value = config;
});


</script>

<template>
  <section
    :id="section.id"
    ref="el"
    class="story-section scroll-mt-24 border-t h-[calc(100vh-40rem)] border-gray-200 first:border-t-0"
    :class="{ 'is-revealed': revealed }"
  >
    <div
      class="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] h-full"
    >
      <div class="border-b border-gray-200 p-6 lg:border-b-0 lg:border-r">
        <h3 class="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <span class="text-gray-400">{{ section.number }}.</span>
          {{ section.title }}
          <Icon
            v-if="section.hasInfoIcon"
            name="info"
            class="h-3.5 w-3.5 text-gray-300"
          />
        </h3>

        <StoryControl
          v-if="section.control"
          class="mt-4"
          :control="section.control"
          @change-layer="(config) => (layerConfig = config)"
        />

        <div
          v-if="section.dataset"
          class="mt-3 flex items-center gap-2 text-sm"
        >
          <Icon :name="section.dataset.icon" class="h-4 w-4 text-emerald-500" />
          <div>
            <div class="font-medium text-gray-700">
              {{ section.dataset.title }}
            </div>
            <div class="text-xs text-gray-400">
              {{ section.dataset.source }}
            </div>
          </div>
        </div>

        <div
          v-if="section.note"
          class="mt-4 flex gap-2 rounded-lg bg-blue-50 p-3 text-xs leading-relaxed text-gray-600"
        >
          <Icon
            name="info"
            class="mt-0.5 h-3.5 w-3.5 flex-none text-blue-500"
          />
          <p>{{ section.note.body }}</p>
        </div>
      </div>

      <StoryMapPanel :layer="layerConfig" v-if="layerConfig">
        <template v-if="$slots.map" #default="{ layerId }">
          <slot name="map" :layer-id="layerId" />
        </template>
      </StoryMapPanel>
    </div>
  </section>
</template>

<style scoped>
.story-section {
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
}
.story-section.is-revealed {
  opacity: 1;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  .story-section {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
