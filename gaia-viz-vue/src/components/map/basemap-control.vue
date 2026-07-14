<script setup lang="ts">
import { ref } from "vue";
import type maplibregl from "maplibre-gl";

export interface BasemapOption {
  id: string;
  label: string;
  style: string | maplibregl.StyleSpecification;
}

const props = withDefaults(
  defineProps<{
    map: maplibregl.Map | null;
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    options?: BasemapOption[];
    defaultStyleId?: string;
  }>(),
  {
    position: "top-right",
    options: () => [
      {
        id: "streets",
        label: "Streets",
        style: "https://demotiles.maplibre.org/style.json",
      },
      {
        id: "satellite",
        label: "Satellite",
        style: {
          version: 8,
          sources: {
            "satellite-tiles": {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution:
                "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
            },
          },
          layers: [
            {
              id: "satellite-layer",
              type: "raster",
              source: "satellite-tiles",
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        },
      },
    ],
  },
);

const emit = defineEmits<{
  (e: "change", styleId: string): void;
}>();

const activeStyleId = ref<string>(
  props.defaultStyleId || props.options[0]?.id || "",
);

function switchBasemap(option: BasemapOption) {
  if (!props.map || activeStyleId.value === option.id) return;

  props.map.setStyle(option.style);
  activeStyleId.value = option.id;
  emit("change", option.id);
}
</script>

<template>
  <div
    v-if="map"
    :class="['basemap-control-container', `position-${position}`]"
  >
    <div class="maplibregl-ctrl maplibregl-ctrl-group basemap-control">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        :class="{ active: activeStyleId === option.id }"
        :title="`Switch to ${option.label}`"
        @click="switchBasemap(option)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
