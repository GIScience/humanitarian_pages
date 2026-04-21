<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import maplibregl from "maplibre-gl";
import { prettifyIndicator } from '../utils/helpers';

declare const pmtiles: any;

const props = defineProps<{
  containerId: string;
  pmtilesUrl: String;
  indicatorName: String;
  layerName: String;
  lookup: Record<string, number>;
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
  sourceName: String;
  topicId?: Number;
}>();

const mapContainer = ref<HTMLElement | null>(null);
let mapInstance: maplibregl.Map | null = null;
let popupInstance: maplibregl.Popup | null = null;
let isMapInitialized = false;
let wasUpdatedViaTopicId = false;

function initMap() {
  console.log('[MetricMap] initMap called, container:', !!mapContainer.value, 'pmtilesUrl:', !!props.pmtilesUrl, 'existing map:', !!mapInstance);
  
  if (!mapContainer.value || !props.pmtilesUrl || mapInstance) return;

  // Register PMTiles protocol
  try {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
  } catch (e) {
    // Protocol already registered
  }

  // Create map instance
  mapInstance = new maplibregl.Map({
    container: mapContainer.value,
    style: "https://tiles.openfreemap.org/styles/liberty",
    attributionControl: false
  });

  console.log('[MetricMap] Map instance created');

  // Create popup
  popupInstance = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  mapInstance.on("load", () => {
    console.log('[MetricMap] Map loaded');
    isMapInitialized = true;
    updateMapData();
  });

  mapInstance.on("error", (e) => {
    console.error('[MetricMap] Map error:', e);
  });
}

function updateMapData() {
  if (!mapInstance || !isMapInitialized || !props.pmtilesUrl) return;

  const sourceName = props.sourceName as string;
  const layerName = props.layerName as string;
  const indicatorName = props.indicatorName as string;

  // Remove existing layers from this source
  const layers = mapInstance.getStyle().layers || [];
  layers.forEach((l: any) => {
    if (l.source === sourceName) {
      if (mapInstance!.getLayer(l.id)) {
        mapInstance!.removeLayer(l.id);
      }
    }
  });

  // Remove and re-add source
  if (mapInstance.getSource(sourceName)) {
    mapInstance.removeSource(sourceName);
  }

  mapInstance.addSource(sourceName, {
    type: "vector",
    url: `pmtiles://${props.pmtilesUrl}`,
    promoteId: "id"
  });

  // Fit bounds
  if (props.bounds) {
    mapInstance.fitBounds(
      [[props.bounds.minLon, props.bounds.minLat], [props.bounds.maxLon, props.bounds.maxLat]],
      { padding: 10, duration: 1500 }
    );
  }

  // Add colored layer
  const layerId = `${sourceName}-${indicatorName}`;

  if (mapInstance.getLayer(layerId)) {
    mapInstance.removeLayer(layerId);
  }

  mapInstance.addLayer({
    id: layerId,
    type: "fill",
    source: sourceName,
    "source-layer": layerName,
    paint: {
      "fill-color": [
        "step",
        ["coalesce", ["feature-state", "value"], -1],
        "#888888",
        0, "#F44336",
        0.25, "#FFEB3B",
        0.75, "#4CAF50"
      ],
      "fill-opacity": 0.6,
      "fill-outline-color": "#555"
    }
  });

  // Set feature states
  Object.entries(props.lookup).forEach(([id, val]) => {
    mapInstance!.setFeatureState(
      { source: sourceName, sourceLayer: layerName, id },
      { value: val }
    );
  });

  // Setup hover handlers
  setupHoverHandlers(sourceName, layerName, indicatorName);
}

function setupHoverHandlers(sourceName: string, layerName: string, indicatorName: string) {
  if (!mapInstance || !popupInstance) return;

  const layerId = `${sourceName}-${indicatorName}`;
  const map = mapInstance as any;

  // Remove old handlers
  map.off('mousemove', layerId);
  map.off('mouseleave', layerId);

  map.on('mousemove', layerId, (e: any) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    if (!feature.id) return;

    const state = mapInstance!.getFeatureState({
      source: sourceName,
      sourceLayer: layerName,
      id: feature.id
    });

    const val = state.value;
    if (val !== undefined && val !== null) {
      mapInstance!.getCanvas().style.cursor = 'pointer';
      const displayValue = (Number(val) * 100).toFixed(2) + '%';
      popupInstance!.setLngLat(e.lngLat)
        .setHTML(`<strong>${prettifyIndicator(indicatorName)}:</strong> ${displayValue}`)
        .addTo(mapInstance!);
    } else {
      mapInstance!.getCanvas().style.cursor = '';
      popupInstance!.remove();
    }
  });

  map.on('mouseleave', layerId, () => {
    if (!mapInstance) return;
    mapInstance.getCanvas().style.cursor = '';
    popupInstance?.remove();
  });
}

// Initialize map when component mounts
onMounted(() => {
  console.log('[MetricMap] Component mounted, containerId:', props.containerId);
  nextTick(() => {
    initMap();
  });
});

// Watch for prop changes (but not deep watch on lookup to avoid excessive updates)
watch(
  () => props.pmtilesUrl,
  (newUrl) => {
    console.log('[MetricMap] pmtilesUrl changed:', !!newUrl, newUrl);
    if (newUrl && !mapInstance) {
      initMap();
    } else if (newUrl && isMapInitialized) {
      updateMapData();
    }
  }
);

watch(
  () => props.indicatorName,
  () => {
    if (isMapInitialized) {
      updateMapData();
    }
  }
);

watch(
  () => props.layerName,
  () => {
    if (isMapInitialized) {
      updateMapData();
    }
  }
);

let lastTopicId: Number = 0;
watch(
  () => props.topicId,
  (newId) => {
    if (isMapInitialized && newId && newId !== lastTopicId) {
      lastTopicId = newId as number;
      wasUpdatedViaTopicId = true;
      updateMapData();
      setTimeout(() => { wasUpdatedViaTopicId = false; }, 100);
    }
  }
);

watch(
  () => props.bounds,
  () => {
    if (isMapInitialized && mapInstance && props.bounds) {
      if (wasUpdatedViaTopicId) {
        mapInstance.fitBounds(
          [[props.bounds.minLon, props.bounds.minLat], [props.bounds.maxLon, props.bounds.maxLat]],
          { padding: 10, duration: 300 }
        );
        return;
      }

      // Zoom out first
      mapInstance.easeTo({
        center: [0, 20],
        zoom: 1,
        duration: 600,
        easing: (t) => t * (2 - t)
      });

      // Then zoom in to new bounds after zoom out completes
      setTimeout(() => {
        if (mapInstance && props.bounds) {
          mapInstance.fitBounds(
            [[props.bounds.minLon, props.bounds.minLat], [props.bounds.maxLon, props.bounds.maxLat]],
            { padding: 10, duration: 1200 }
          );
        }
      }, 650);
    }
  }
);

// Update feature states when lookup changes (without full re-render)
watch(
  () => props.lookup,
  (newLookup) => {
    if (!isMapInitialized || !mapInstance) return;

    const sourceName = props.sourceName as string;
    const layerName = props.layerName as string;

    Object.entries(newLookup).forEach(([id, val]) => {
      mapInstance!.setFeatureState(
        { source: sourceName, sourceLayer: layerName, id },
        { value: val }
      );
    });
  },
  { deep: true }
);

onUnmounted(() => {
  console.log('[MetricMap] Component unmounting, containerId:', props.containerId);
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
    popupInstance = null;
    isMapInitialized = false;
  }
});
</script>

<template>
  <div :id="containerId" ref="mapContainer" style="width: 100%; height: 100%;"></div>
</template>

<style scoped>
</style>
