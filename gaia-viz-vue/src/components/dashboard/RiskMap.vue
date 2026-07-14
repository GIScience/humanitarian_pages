<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import { storeToRefs } from "pinia";
import Map from "@/components/map/map.vue";
import RiskLegend from "@/components/dashboard/RiskLegend.vue";
import { useRiskMapStore } from "@/store/riskMapStore";
import { cn } from "@/utils/cn";
import type { RiskViewMode } from "@/composables/useRiskLogic";

const { dimensions } = storeToRefs(useRiskMapStore());

const props = defineProps<{
  pmtilesUrl: string;
  pcodeField: string;
  matchArray: [string, string, number][];
  highlightedPcode?: string | null;
  isAnalysisVisible?: boolean;
  availableCountries?: string[];
  isMobile?: boolean;
  riskViewMode?: RiskViewMode;
  legendTitle?: string;
}>();

const emit = defineEmits<{
  (e: "country-click", code: string): void;
  (e: "toggle-analysis"): void;
  (e: "update:riskViewMode", value: RiskViewMode): void;
  (e: "click:info"): void;
}>();

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1.5;

const activeDimension = computed(() =>
  dimensions.value.find((d) => d.value === props.riskViewMode),
);
const isViewingCustomData = computed(() => !!activeDimension.value?.isCustom);

const mapViewRef = ref<InstanceType<typeof Map> | null>(null);
const map = computed<maplibregl.Map | null>(
  () => mapViewRef.value?.map ?? null,
);

const floodLayerId = "risk-layer";
const interactLayerId = "world-fills";

const layerOpacity = ref(0.7);
const isLayersCollapsed = ref(false);

const countryBounds = ref<maplibregl.LngLatBoundsLike | null>(null);

const styleUrl = "https://tiles.openfreemap.org/styles/positron";

const resizeHandler = () => {
  map.value?.resize();
};

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeHandler);
});

function fitToCountryBounds(duration = 1200) {
  const mapInstance = map.value;
  if (!mapInstance || !countryBounds.value) return;
  mapInstance.fitBounds(countryBounds.value, { padding: 40, duration });
}

function selectDimension(value: RiskViewMode) {
  emit("update:riskViewMode", value);
  fitToCountryBounds();
}

function handleMapLoad(mapInstance: maplibregl.Map) {
  // Add World Boundaries for Click Interaction
  mapInstance.addSource("world", {
    type: "geojson",
    data: `${import.meta.env.BASE_URL}data/world.json`,
    promoteId: "iso_a3",
  });

  const isLoaded =
    props.availableCountries && props.availableCountries.length > 0;
  const validCountries = isLoaded ? props.availableCountries : ["NONE"];

  // Unavailable Countries Layer
  mapInstance.addLayer({
    id: "unavailable-countries",
    type: "fill",
    source: "world",
    paint: {
      "fill-color": "#cbd5e1", // Slate 300
      "fill-opacity": 0.6,
    },
    filter: isLoaded
      ? ["!", ["in", ["get", "iso_a3"], ["literal", validCountries]]]
      : ["==", "iso_a3", "DOES_NOT_EXIST"],
  });

  mapInstance.addLayer({
    id: interactLayerId,
    type: "fill",
    source: "world",
    paint: {
      "fill-color": "#ca2333",
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.1,
        0,
      ],
    },
    filter: isLoaded
      ? ["in", ["get", "iso_a3"], ["literal", validCountries]]
      : ["==", "iso_a3", "DOES_NOT_EXIST"],
  });

  mapInstance.addLayer({
    id: interactLayerId + "-outline",
    type: "line",
    source: "world",
    paint: {
      "line-color": "#ca2333",
      "line-width": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        2, // hover -> thicker
        1, // default -> subtle
      ],
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        1, // hover -> full
        0.4, // default -> visible but subdued
      ],
    },
    filter: isLoaded
      ? ["in", ["get", "iso_a3"], ["literal", validCountries]]
      : ["==", "iso_a3", "DOES_NOT_EXIST"],
  });

  updateLayer();

  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: "risk-tooltip",
  });

  mapInstance.on("mousemove", floodLayerId, (e) => {
    if (!e.features || e.features.length === 0) return;
    mapInstance.getCanvas().style.cursor = "pointer";

    const feature = e.features[0];
    const pcode = feature.properties[props.pcodeField];
    const match = props.matchArray.find((m) => m[0] === pcode);

    if (match) {
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `
          <div class="p-3 bg-white text-slate-900 rounded-xl border border-slate-200 shadow-2xl min-w-[120px]">
            <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">${pcode}</div>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center gap-2">
                <div class="w-2.5 h-2.5 rounded-full ring-2 ring-slate-100" style="background-color: ${match[1]}"></div>
                <div class="text-[11px] font-extrabold text-slate-600 uppercase tracking-tight">Risk Score</div>
              </div>
              <div class="text-2xl font-black text-slate-900 tabular-nums">
                ${Number(match[2]).toFixed(2)}
              </div>
            </div>
          </div>
        `,
        )
        .addTo(mapInstance);
    }
  });

  mapInstance.on("mouseleave", floodLayerId, () => {
    mapInstance.getCanvas().style.cursor = "";
    popup.remove();
  });

  // Country Click & Hover Interaction
  let hoveredCountryId: string | number | null = null;

  mapInstance.on("mousemove", interactLayerId, (e) => {
    if (e.features && e.features.length > 0) {
      if (hoveredCountryId !== null) {
        mapInstance.setFeatureState(
          { source: "world", id: hoveredCountryId },
          { hover: false },
        );
      }
      hoveredCountryId = e.features[0].id || e.features[0].properties.iso_a3;
      mapInstance.setFeatureState(
        { source: "world", id: hoveredCountryId! },
        { hover: true },
      );
      mapInstance.getCanvas().style.cursor = "pointer";
    }
  });

  mapInstance.on("mouseleave", interactLayerId, () => {
    if (hoveredCountryId !== null) {
      mapInstance.setFeatureState(
        { source: "world", id: hoveredCountryId },
        { hover: false },
      );
    }
    hoveredCountryId = null;
    mapInstance.getCanvas().style.cursor = "";
  });

  mapInstance.on("click", interactLayerId, (e) => {
    if (e.features && e.features.length > 0) {
      const isoCode = e.features[0].properties.iso_a3;
      if (isoCode) {
        emit("country-click", isoCode);
      }
    }
  });

  mapInstance.on("style.load", onStyleLoad);
  window.addEventListener("resize", resizeHandler);
}

async function updateLayer() {
  const mapInstance = map.value;
  if (!mapInstance || !mapInstance.isStyleLoaded()) return;

  if (!props.pmtilesUrl) {
    if (mapInstance.getLayer("risk-layer-highlight"))
      mapInstance.removeLayer("risk-layer-highlight");
    if (mapInstance.getLayer(floodLayerId))
      mapInstance.removeLayer(floodLayerId);
    if (mapInstance.getSource(floodLayerId))
      mapInstance.removeSource(floodLayerId);

    countryBounds.value = null;
    mapViewRef.value?.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, 3000);
    return;
  }

  if (!props.pcodeField) return;

  const currentSource = mapInstance.getSource(floodLayerId);
  const sourceUrl = `pmtiles://${props.pmtilesUrl}`;

  if (!currentSource || (currentSource as any).url !== sourceUrl) {
    if (mapInstance.getLayer("risk-layer-highlight"))
      mapInstance.removeLayer("risk-layer-highlight");
    if (mapInstance.getLayer(floodLayerId))
      mapInstance.removeLayer(floodLayerId);
    if (mapInstance.getSource(floodLayerId))
      mapInstance.removeSource(floodLayerId);

    mapInstance.addSource(floodLayerId, {
      type: "vector",
      url: sourceUrl,
      promoteId: props.pcodeField,
    });

    mapInstance.addLayer({
      id: floodLayerId,
      type: "fill",
      source: floodLayerId,
      "source-layer": "boundary",
      paint: {
        "fill-color": "#AAAAAA",
        "fill-opacity": Number(layerOpacity.value),
        "fill-outline-color": "#94a3b8", // Grey for subnational boundaries
      },
    });

    mapInstance.addLayer({
      id: "risk-layer-highlight",
      type: "line",
      source: floodLayerId,
      "source-layer": "boundary",
      paint: {
        "line-color": "#ca2333", // HeiGIT red
        "line-width": 2,
        "line-opacity": 0.9,
      },
      filter: ["==", props.pcodeField, props.highlightedPcode || ""],
    });

    // Fit bounds
    const pmtilesFile = new pmtiles.PMTiles(props.pmtilesUrl);
    try {
      const metadata = (await pmtilesFile.getMetadata()) as any;
      if (metadata?.antimeridian_adjusted_bounds) {
        const bounds = (metadata.antimeridian_adjusted_bounds as string)
          .split(",")
          .map(Number);
        if (bounds.length === 4 && bounds.every((v) => !isNaN(v))) {
          const [minLon, minLat, maxLon, maxLat] = bounds;
          countryBounds.value = [
            [minLon, minLat],
            [maxLon, maxLat],
          ];
          fitToCountryBounds(2000);
        }
      }
    } catch (err) {
      console.log("Could not read PMTiles bounds");
    }
  }

  // Update paint properties
  // Extract only [pcode, color] pairs for the match expression
  const mapMatches = props.matchArray.flatMap((m) => [m[0], m[1]]);
  let fillColor: any = "#AAAAAA";

  if (mapMatches.length >= 2) {
    fillColor = ["match", ["get", props.pcodeField], ...mapMatches, "#AAAAAA"];
  }

  mapInstance.setPaintProperty(floodLayerId, "fill-color", fillColor);
}

const onStyleLoad = () => {
  const mapInstance = map.value;
  if (!mapInstance) return;

  // Apply distinct colors: Red for National, Grey for Subnational
  const nationalLayers = ["boundary_2", "boundary_disputed"];
  const subnationalLayers = [
    "boundary_3",
    "boundary_4",
    "boundary_5",
    "boundary_6",
  ];

  nationalLayers.forEach((layerId) => {
    if (mapInstance.getLayer(layerId)) {
      mapInstance.setPaintProperty(layerId, "line-color", "#ca2333");
      mapInstance.setPaintProperty(layerId, "line-opacity", 0.8);
    }
  });

  subnationalLayers.forEach((layerId) => {
    if (mapInstance.getLayer(layerId)) {
      mapInstance.setPaintProperty(layerId, "line-color", "#94a3b8");
      mapInstance.setPaintProperty(layerId, "line-opacity", 0.4);
    }
  });

  if (mapInstance.isStyleLoaded()) updateLayer();
};

watch(
  () => props.highlightedPcode,
  (newVal) => {
    const mapInstance = map.value;
    if (mapInstance && mapInstance.getLayer("risk-layer-highlight")) {
      if (newVal) {
        mapInstance.setFilter("risk-layer-highlight", [
          "==",
          props.pcodeField,
          newVal,
        ]);
      } else {
        mapInstance.setFilter("risk-layer-highlight", [
          "==",
          props.pcodeField,
          "",
        ]);
      }
    }
  },
);

watch(layerOpacity, (newVal) => {
  const mapInstance = map.value;
  if (mapInstance && mapInstance.getLayer(floodLayerId)) {
    mapInstance.setPaintProperty(floodLayerId, "fill-opacity", Number(newVal));
  }
});

watch(() => props.pmtilesUrl, updateLayer);
watch(() => props.matchArray, updateLayer);

watch(
  () => props.availableCountries,
  (newVal) => {
    const mapInstance = map.value;
    if (
      mapInstance &&
      mapInstance.getLayer("unavailable-countries") &&
      mapInstance.getLayer(interactLayerId)
    ) {
      const isLoaded = newVal && newVal.length > 0;
      const validCountries = isLoaded ? newVal : ["NONE"];
      const availableFilter: maplibregl.FilterSpecification = isLoaded
        ? ["in", ["get", "iso_a3"], ["literal", validCountries]]
        : ["==", "iso_a3", "DOES_NOT_EXIST"];
      mapInstance.setFilter(
        "unavailable-countries",
        isLoaded
          ? ["!", ["in", ["get", "iso_a3"], ["literal", validCountries]]]
          : ["==", "iso_a3", "DOES_NOT_EXIST"],
      );
      mapInstance.setFilter(interactLayerId, availableFilter);
      if (mapInstance.getLayer(interactLayerId + "-outline")) {
        mapInstance.setFilter(interactLayerId + "-outline", availableFilter);
      }
    }
  },
  { deep: true },
);

defineExpose({
  resetView: () => {
    mapViewRef.value?.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, 3000);
  },
});
</script>

<template>
  <div class="relative w-full h-full">
    <transition name="fade">
      <div
        v-if="pmtilesUrl"
        :class="
          cn(
            'absolute z-[60] left-4 flex flex-col gap-2 rounded-lg bg-white/90 shadow-sm backdrop-blur-md',
            props.isMobile
              ? ' bottom-36 w-45 px-2 py-1.5'
              : 'top-8 w-60 rounded-2xl px-3 py-2',
          )
        "
      >
        <div v-if="riskViewMode" class="flex flex-col">
          <div class="flex flex-col gap-1">
            <button
              class="flex items-center justify-between gap-2"
              @click="isLayersCollapsed = !isLayersCollapsed"
            >
              <label
                :class="
                  cn(
                    'block font-bold uppercase tracking-widest whitespace-nowrap text-slate-500',
                    props.isMobile ? 'text-[8px]' : 'text-[11px]',
                  )
                "
              >
                Layers:
              </label>
              <div class="flex items-center gap-1">
                <span
                  v-if="isViewingCustomData"
                  :class="
                    cn(
                      'rounded-full bg-heigit-red/10 font-extrabold uppercase tracking-wider whitespace-nowrap text-heigit-red',
                      props.isMobile
                        ? 'px-1.5 py-0.5 text-[7px]'
                        : 'px-2 py-0.5 text-[8px]',
                    )
                  "
                  title="This layer is built from your uploaded custom data"
                >
                  Viewing Custom Data
                </span>
                <button
                  type="button"
                  class="text-slate-500 transition-colors hover:text-heigit-red"
                  :title="
                    isLayersCollapsed ? 'Expand layers' : 'Minimize layers'
                  "
                >
                  <v-icon
                    :icon="
                      isLayersCollapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'
                    "
                    size="18"
                  />
                </button>
              </div>
            </button>

            <div v-if="!isLayersCollapsed" class="flex flex-col gap-1">
              <button
                v-for="dimension in dimensions"
                :key="dimension.value"
                @click="selectDimension(dimension.value)"
                :class="
                  cn(
                    'flex items-center justify-between rounded text-left font-bold transition-colors whitespace-nowrap',
                    props.isMobile
                      ? 'px-1.5 py-0.5 text-[9px]'
                      : 'px-2 py-2 text-xs',
                    riskViewMode === dimension.value
                      ? 'bg-heigit-red text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )
                "
              >
                <div class="flex items-center gap-2">
                  <v-icon :icon="dimension.icon" size="18" />
                  <span>{{ dimension.label }}</span>
                </div>
                <v-icon
                  @click.stop="emit('click:info')"
                  icon="mdi-information-slab-circle-outline"
                  size="15"
                  :class="
                    cn(
                      'ml-1 text-heigit-red',
                      riskViewMode === dimension.value && 'text-white',
                    )
                  "
                />
              </button>

              <v-divider class="my-2 bg-slate-200/70" />

              <div class="flex flex-col gap-1.5 mb-2">
                <label
                  :class="
                    cn(
                      'block font-bold uppercase tracking-widest whitespace-nowrap text-slate-500',
                      props.isMobile ? 'text-[8px]' : 'text-[9px]',
                    )
                  "
                >
                  Opacity:
                  <span class="font-extrabold text-slate-700">
                    {{ Math.round(layerOpacity * 100) }}%
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  v-model.number="layerOpacity"
                  :class="
                    cn(
                      'w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-heigit-red',
                      props.isMobile ? 'h-1' : 'h-1.5',
                    )
                  "
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <Map
      ref="mapViewRef"
      :map-style="styleUrl"
      :scroll-zoom="true"
      @load="handleMapLoad"
      interactive
      zoomControls
    />

    <RiskLegend
      v-if="matchArray && matchArray.length > 0"
      :is-mobile="props.isMobile"
      :title="legendTitle"
    />
  </div>
</template>

<style scoped>
:deep(.risk-tooltip .maplibregl-popup-content) {
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

/* Premium Zoom Controls */
:deep(.maplibregl-ctrl-group) {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(8px);
  margin-top: 40px !important;
  margin-right: 17px !important;
}

:deep(.maplibregl-ctrl-group button) {
  width: 36px;
  height: 36px;
  background-color: transparent;
  transition: background-color 0.2s;
}

:deep(.maplibregl-ctrl-group button:hover) {
  background-color: #f1f5f9;
}

:deep(.maplibregl-ctrl-icon) {
  filter: grayscale(1) brightness(0.5);
}
</style>
