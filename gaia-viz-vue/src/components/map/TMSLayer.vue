<script setup lang="ts">
import { computed } from "vue";
import type maplibregl from "maplibre-gl";
import type { RasterSourceSpecification } from "maplibre-gl";
import { useRasterMapLayer } from "@/composables/use-raster-map-layer";

const props = withDefaults(
  defineProps<{
    map: maplibregl.Map | null;
    url: string;
    layerId?: string;
    opacity?: number;
    scheme?: "tms" | "xyz";
    tileSize?: number;
    minZoom?: number;
    maxZoom?: number;
    bounds?: [number, number, number, number];
    attribution?: string;
    belowLayerId?: string;
  }>(),
  {
    layerId: "tms-layer",
    opacity: 1,
    scheme: "tms",
    tileSize: 256,
    minZoom: 0,
    maxZoom: 22,
  },
);

const sourceSpec = computed<RasterSourceSpecification | null>(() => {
  if (!props.url) return null;

  return {
    type: "raster",
    tiles: [props.url],
    scheme: props.scheme,
    tileSize: props.tileSize,
    minzoom: props.minZoom,
    maxzoom: props.maxZoom,
    ...(props.bounds ? { bounds: props.bounds } : {}),
    ...(props.attribution ? { attribution: props.attribution } : {}),
  };
});

useRasterMapLayer({
  map: () => props.map,
  layerId: () => props.layerId,
  opacity: () => props.opacity,
  sourceSpec,
  bounds: () => props.bounds ?? null,
  belowLayerId: () => props.belowLayerId,
});
</script>

<template />
