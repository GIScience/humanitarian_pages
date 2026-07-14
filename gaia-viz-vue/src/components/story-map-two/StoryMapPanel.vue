<script setup lang="ts">
import type { Legend, layerConfigType } from "@/types/story-map";
import StoryMapCanvas from "@/components/story-map/StoryMapCanvas.vue";

defineProps<{ layer?: layerConfigType; legend?: Legend }>();
</script>

<template>
  <div class="relative min-h-[16rem] bg-[#f3f4f2]">
    <slot :layer-id="layer?.layerId">
      <div
        class="absolute inset-0 flex items-center justify-center text-xs text-gray-300"
        :data-layer-id="layer?.layerId"
      >
        Map layer: {{ layer?.layerId }}
      </div>
    </slot>

    <StoryMapCanvas
      v-if="layer"
      :center="[10, 15]"
      :zoom="1.6"
      interactive
      :rasterMin="0"
      :rasterMax="1"
      :rasterUrl="layer.sourceUrl"
      :layer-id="layer.layerId"
      :raster-color-scheme="layer.colorScheme"
      :mode="layer.mode"
    />
  </div>
</template>
