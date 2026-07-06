<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import maplibregl from 'maplibre-gl';

const props = withDefaults(defineProps<{
  map: maplibregl.Map | null;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showCompass?: boolean;
  showZoom?: boolean;
}>(), {
  position: 'top-right',
  showCompass: false,
  showZoom: true,
});

let control: maplibregl.NavigationControl | null = null;
let controlMap: maplibregl.Map | null = null;

function removeControl() {
  if (control && controlMap) {
    try {

      controlMap.removeControl(control);
    } catch {
      console.warn('Failed to remove map control. It may have already been removed.');
    }
  }
  control = null;
  controlMap = null;
}

function addControl(map: maplibregl.Map) {
  removeControl();
  control = new maplibregl.NavigationControl({
    showCompass: props.showCompass,
    showZoom: props.showZoom,
  });
  map.addControl(control, props.position);
  controlMap = map;
}

watch(
  () => props.map,
  (map) => {
    if (map) addControl(map);
    else removeControl();
  },
  { immediate: true }
);

onBeforeUnmount(removeControl);
</script>

<template>

</template>

