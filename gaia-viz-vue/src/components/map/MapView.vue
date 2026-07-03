<script setup lang="ts">
import { onMounted } from 'vue';
import type maplibregl from 'maplibre-gl';
import { useMap } from '@/composables/useMap';

const props = withDefaults(defineProps<{
  mapStyle?: string;
  center?: [number, number];
  zoom?: number;
  interactive?: boolean;
  scrollZoom?: boolean;
  attributionControl?: boolean;
  /** Set to false to defer map creation until initMap() is called manually (e.g. lazy-loaded maps). */
  autoInit?: boolean;
}>(), {
  mapStyle: 'https://tiles.openfreemap.org/styles/positron',
  center: () => [0, 20],
  zoom: 1.5,
  interactive: true,
  scrollZoom: true,
  attributionControl: true,
  autoInit: true,
});

const emit = defineEmits<{
  (e: 'load', map: maplibregl.Map): void;
}>();

const { mapContainer, map, isLoaded, initMap, flyTo } = useMap({
  style: props.mapStyle,
  center: props.center,
  zoom: props.zoom,
  interactive: props.interactive,
  scrollZoom: props.scrollZoom,
  attributionControl: props.attributionControl,
  onLoad: (m) => emit('load', m),
});

onMounted(() => {
  if (props.autoInit) initMap();
});

defineExpose({ map, isLoaded, initMap, flyTo, mapContainer });
</script>

<template>
  <div class="relative w-full h-full">
    <div ref="mapContainer" class="w-full h-full" />
    <slot :map="map" :is-loaded="isLoaded" />
  </div>
</template>
