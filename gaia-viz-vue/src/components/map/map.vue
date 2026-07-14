<script setup lang="ts">
import { watch } from "vue";
import type maplibregl from "maplibre-gl";
import useMapInstance from "@/composables/use-map-instance";
import MapZoomControl from "@/components/map/zoom-control.vue";
import "maplibre-gl/dist/maplibre-gl.css";

const props = withDefaults(
  defineProps<{
    mapStyle?: string;
    center?: [number, number];
    zoom?: number;
    interactive?: boolean;
    scrollZoom?: boolean;
    zoomControls?: boolean;
    basemapControls?: boolean;
    attributionControls?: boolean;
  }>(),
  {
    mapStyle: "https://tiles.openfreemap.org/styles/positron",
    center: () => [0, 20],
    zoom: 1.5,
    interactive: true,
    scrollZoom: true,
    zoomControls: true,
    basemapControls: true,
    attributionControls: true,
  },
);

const emit = defineEmits<{
  (e: "load", map: maplibregl.Map): void;
}>();

const { mapContainerRef, map, isLoaded } = useMapInstance();

function flyTo(center: [number, number], zoom: number, duration = 3000) {
  map.value?.flyTo({ center, zoom, duration, essential: true });
}

// Watch for changes in center and zoom props to update the map view
watch(
  isLoaded,
  (loaded) => {
    if (!loaded || !map.value) return;

    map.value.jumpTo({ center: props.center, zoom: props.zoom });

    if (!props.scrollZoom) map.value.scrollZoom.disable();

    emit("load", map.value);
  },
  { immediate: true },
);

defineExpose({ map, isLoaded, flyTo, mapContainer: mapContainerRef });
</script>

<template>
  <div class="relative w-full h-full">
    <div ref="mapContainerRef" class="w-full h-full" />
    <!-- Zoom Controls -->
    <MapZoomControl
      v-if="zoomControls"
      :map="map"
      class="absolute top-4 right-4 z-10"
    />
    <!-- BaseMap Controls -->
    <!-- 
    <BaseMapControl
      v-if="basemapControls"
      :map="map"
      class="absolute top-4 left-4 z-10"
    /> -->
    <slot :map="map" :is-loaded="isLoaded" />
  </div>
</template>
