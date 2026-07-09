<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type maplibregl from "maplibre-gl";
import type { RasterSourceSpecification } from "maplibre-gl";
import {
  getCogMetadata,
  setColorFunction,
} from "@geomatico/maplibre-cog-protocol";
import { useRasterMapLayer } from "@/composables/use-raster-map-layer";
import { toRgba } from "@/utils/geo/color-ramp";
import type { RgbaColor, CategoryStyle } from "@/utils/geo/color-ramp";

const props = withDefaults(
  defineProps<{
    map: maplibregl.Map | null;
    sourceUrl: string;
    layerId?: string;
    opacity?: number;
    /**
     * How the raster is colored:
     * - "rgb": 3/4-band imagery (e.g. satellite), rendered directly. No color scheme.
     * - "ramp": single-band continuous data (elevation, NDVI, temperature) with a color ramp.
     * - "categorical": single-band classified data (e.g. land cover / LCC), one color per class.
     */
    mode?: "rgb" | "ramp" | "categorical";
    // --- ramp mode ---
    colorScheme?: string;
    min?: number;
    max?: number;
    continuous?: boolean;
    reverse?: boolean;
    // --- categorical mode ---
    /**
     * Maps a pixel class value to a color. Each entry may be a hex string,
     * an RGBA tuple, or a { color, label } object, e.g.
     * { 4: "#1f78b4" } or { 4: { color: "#1f78b4", label: "Water" } }
     */
    categoryColors?: Record<number, CategoryStyle>;
    belowLayerId?: string;
  }>(),
  {
    layerId: "cog-layer",
    opacity: 1,
    mode: "rgb",
  },
);

const bareCogUrl = computed(() =>
  props.sourceUrl ? props.sourceUrl.replace(/^cog:\/\//, "") : "",
);

const cogUrl = computed(() => {
  if (!bareCogUrl.value) return "";

  const base = `cog://${bareCogUrl.value}`;

  if (
    props.mode === "ramp" &&
    props.colorScheme &&
    props.min !== undefined &&
    props.max !== undefined
  ) {
    const modifiers = `${props.continuous ? "c" : ""}${props.reverse ? "-" : ""}`;
    return `${base}#color:${props.colorScheme},${props.min},${props.max},${modifiers}`;
  }

  return base;
});

const transparent: RgbaColor = [0, 0, 0, 0];

const categoryRgba = computed<Record<number, RgbaColor>>(() => {
  const out: Record<number, RgbaColor> = {};
  if (!props.categoryColors) return out;
  for (const [value, style] of Object.entries(props.categoryColors)) {
    out[Number(value)] = toRgba(style);
  }
  return out;
});

watch(
  [bareCogUrl, () => props.mode, categoryRgba],
  ([url, mode, colors]) => {
    if (!url || mode !== "categorical") return;

    // Runs for every pixel, so keep it allocation-free.
    setColorFunction(url, (pixel, color, metadata) => {
      const value = pixel[0];
      if (value === metadata.noData || Number.isNaN(value)) {
        color.set(transparent);
        return;
      }
      color.set(colors[value] ?? transparent);
    });
  },
  { immediate: true },
);

const minZoom = ref<number | null>(null);
const maxZoom = ref<number | null>(null);
const cogBounds = ref<[number, number, number, number] | null>(null);

watch(
  bareCogUrl,
  async (url) => {
    minZoom.value = null;
    maxZoom.value = null;
    cogBounds.value = null;
    if (!url) return;

    try {
      const metadata = await getCogMetadata(url);
      const zooms = metadata.images
        .filter((image) => !image.isMask)
        .map((image) => image.zoom);
      minZoom.value = zooms.length
        ? Math.max(0, Math.floor(Math.min(...zooms)))
        : 0;
      // Native full-resolution level. Capping below this is what makes the
      // imagery blurry when zoomed in, so serve native tiles up to here.
      maxZoom.value = zooms.length ? Math.ceil(Math.max(...zooms)) : 22;
      cogBounds.value = metadata.bbox ?? null;
    } catch {
      minZoom.value = 0;
      maxZoom.value = 22;
    }
  },
  { immediate: true },
);

const sourceSpec = computed<RasterSourceSpecification | null>(() => {
  if (!cogUrl.value || minZoom.value === null || maxZoom.value === null)
    return null;

  return {
    type: "raster",
    url: cogUrl.value,
    tileSize: 256,
    volatile: true,
    minzoom: minZoom.value,
    maxzoom: maxZoom.value,
  };
});

useRasterMapLayer({
  map: () => props.map,
  layerId: () => props.layerId,
  opacity: () => props.opacity,
  sourceSpec,
  bounds: () => cogBounds.value,
  belowLayerId: () => props.belowLayerId,
});
</script>

<template />
