<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { prettifyIndicator } from '../utils/helpers';

const props = defineProps<{
  containerId: string;
  pmtilesUrl: string;
  indicatorName: string;
  layerName: string;
  lookup: Record<string, number>;
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
  sourceName: string;
  topicId?: number;
  // A handful of indicators (e.g. user-activity) are raw counts, not 0-1
  // quality ratios - coloring/labeling them with the quality scale below
  // renders every real value as "high quality" green (any count > 0.75)
  // and formats e.g. 4077 as "407700%". Default false preserves the exact
  // prior behavior for every other indicator.
  isCountIndicator?: boolean;
  // Some isCountIndicator indicators (e.g. roads-thematic-accuracy) still
  // store a genuine 0-1 ratio - they're colored/badged like a count by
  // product decision (it's a match rate, not a quality verdict), but the
  // hover value itself should still read as a percentage, not a bare
  // fraction ("0.95" instead of "95%").
  showAsPercent?: boolean;
  // For isCountIndicator indicators whose value is a known, comparable
  // scale (e.g. roads-thematic-accuracy's 0-1 match rate) rather than an
  // open-ended count - fixes the color gradient's min/max instead of
  // stretching it to whatever this specific country/layer's own values
  // happen to span, so e.g. a 90% match rate always reads as "fairly
  // saturated", not "the single darkest color" just because no region in
  // the current view happens to score higher.
  fixedColorRange?: [number, number];
  // Which region (by the same id used for lookup/feature-state) should be
  // drawn with the "selected" outline - the parent owns this (it's what
  // decides which polygon's plot to show), this component only visualizes it.
  selectedGeomId?: string | null;
}>();

// For Split View's "mirror the other map's zoom/pan" feature: emits only on
// genuine user-driven camera moves (drag/scroll/pinch - checked via
// e.originalEvent being set), not on our own or MapLibre's programmatic
// moves (fitBounds, easeTo, or another map's view being applied here via
// setView) - otherwise the two maps' initial fitBounds animations would
// fight each other, and setView's own jumpTo would re-trigger itself.
const emit = defineEmits<{
  (e: 'move'): void;
  // Fired on every click: the clicked region's id, or null when the click
  // missed every polygon (empty map area) or landed back on the already-
  // selected one - both read as "go back to the whole-country view" to the
  // parent.
  (e: 'regionClick', geomId: string | null): void;
}>();

let resizeHandler: (() => void) | null = null;

const mapContainer = ref<HTMLElement | null>(null);
let mapInstance: maplibregl.Map | null = null;
let popupInstance: maplibregl.Popup | null = null;
let isMapInitialized = false;
let wasUpdatedViaTopicId = false;
let isSyncingView = false;
let isUserGesture = false;
// Kept in sync with whichever colored layer is currently on the map, so the
// single click handler registered once in initMap() always queries the
// right layer even after a topic/indicator switch rebuilds it.
let currentLayerId = '';
// Tracks whichever bounds updateMapData() last actually flew to, so it can
// tell "the country changed" (a real new bbox) apart from "the topic,
// indicator or layer changed" (updateMapData() runs for those too, but the
// bbox is identical) - without this, every one of those non-country
// changes re-triggered the same fly-to-country animation.
let lastFittedBoundsKey: string | null = null;
function boundsKey(b: typeof props.bounds): string | null {
  return b ? `${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}` : null;
}

function initMap() {
  console.log('[MetricMap] initMap called, container:', !!mapContainer.value, 'pmtilesUrl:', !!props.pmtilesUrl, 'existing map:', !!mapInstance);

  if (!mapContainer.value || !props.pmtilesUrl || mapInstance) return;

  const handleMapClick = (e: any) => {
    if (!mapInstance || !currentLayerId) return;
    const hits = mapInstance.queryRenderedFeatures(e.point, { layers: [currentLayerId] });
    const clickedId = hits.length > 0 && hits[0].id != null ? String(hits[0].id) : null;
    emit('regionClick', clickedId !== null && clickedId === props.selectedGeomId ? null : clickedId);
  };

  // Register PMTiles protocol
  try {
    const protocol = new Protocol();
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

  // Scroll-wheel zoom animates via inertia/easing: only the "movestart" event
  // reliably carries originalEvent for the whole gesture - later "move"
  // frames during that same easing don't. So the gesture is latched at
  // movestart and held until moveend, rather than checked per-move-event.
  mapInstance.on("movestart", (e: any) => {
    isUserGesture = !isSyncingView && !!e.originalEvent;
  });
  mapInstance.on("move", () => {
    if (isUserGesture) emit('move');
  });
  mapInstance.on("moveend", () => {
    isUserGesture = false;
  });

  mapInstance.on("error", (e) => {
    console.error('[MetricMap] Map error:', e);
  });

  mapInstance.on("click", handleMapClick);
}

// Quality indicators are 0-1 ratios, colored on a fixed low/medium/high
// scale. Count indicators have no such fixed range - a "high" user-activity
// count in one country might be low in another - so they get a scale
// stretched to the actual min/max of whatever's currently loaded, in a
// distinct blue palette (a magnitude gradient, not a good/bad judgment).
function buildFillColorExpression(): any {
  if (!props.isCountIndicator) {
    return [
      "step",
      ["coalesce", ["feature-state", "value"], -1],
      "#bab8b8",
      0, "#F44336",
      0.25, "#FFEB3B",
      0.75, "#4CAF50"
    ];
  }

  let min: number, max: number;
  if (props.fixedColorRange) {
    [min, max] = props.fixedColorRange;
  } else {
    const values = Object.values(props.lookup).filter((v) => typeof v === "number" && !isNaN(v));
    min = values.length ? Math.min(...values) : 0;
    max = values.length ? Math.max(...values) : 1;
  }
  const hasValues = Object.values(props.lookup).some((v) => typeof v === "number" && !isNaN(v));

  if ((!props.fixedColorRange && !hasValues) || min === max) {
    return [
      "case",
      ["==", ["coalesce", ["feature-state", "value"], -1], -1], "#bab8b8",
      "#5DADE2"
    ];
  }

  const mid = (min + max) / 2;
  return [
    "case",
    ["==", ["coalesce", ["feature-state", "value"], -1], -1], "#bab8b8",
    ["interpolate", ["linear"], ["feature-state", "value"], min, "#EAF2F8", mid, "#5DADE2", max, "#154360"]
  ];
}

function updateMapData() {
  if (!mapInstance || !isMapInitialized || !props.pmtilesUrl) return;

  const sourceName = props.sourceName;
  const layerName = props.layerName;
  const indicatorName = props.indicatorName;

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

  // Fit bounds - only when they've actually changed (a genuinely new
  // country), not on every indicator/layer/topic switch within the same
  // country, which otherwise re-ran this same fly-to animation on every
  // topic click even though the view didn't need to move at all.
  const newBoundsKey = boundsKey(props.bounds);
  if (props.bounds && newBoundsKey !== lastFittedBoundsKey) {
    lastFittedBoundsKey = newBoundsKey;
    mapInstance.fitBounds(
      [[props.bounds.minLon, props.bounds.minLat], [props.bounds.maxLon, props.bounds.maxLat]],
      { padding: 10, duration: 1500 }
    );
  }

  // Add colored layer
  const layerId = `${sourceName}-${indicatorName}`;
  currentLayerId = layerId;

  if (mapInstance.getLayer(layerId)) {
    mapInstance.removeLayer(layerId);
  }

  mapInstance.addLayer({
    id: layerId,
    type: "fill",
    source: sourceName,
    "source-layer": layerName,
    paint: {
      "fill-color": buildFillColorExpression(),
      "fill-opacity": 0.6,
      "fill-outline-color": "#555"
    }
  });

  // A thin, high-contrast outline for whichever region is currently
  // click-selected. Opacity (not the layer's presence) is driven by the
  // "selected" feature-state, since MapLibre filter expressions can't read
  // feature-state - only paint expressions can.
  const selectedLayerId = `${layerId}-selected`;
  if (mapInstance.getLayer(selectedLayerId)) {
    mapInstance.removeLayer(selectedLayerId);
  }
  mapInstance.addLayer({
    id: selectedLayerId,
    type: "line",
    source: sourceName,
    "source-layer": layerName,
    paint: {
      "line-color": "#0B7285",
      "line-width": 3,
      "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0]
    }
  });

  // Set feature states
  Object.entries(props.lookup).forEach(([id, val]) => {
    mapInstance!.setFeatureState(
      { source: sourceName, sourceLayer: layerName, id },
      { value: val }
    );
  });

  // A fresh addSource/addLayer above wipes any previous feature-state, so
  // re-apply whichever region the parent currently has selected.
  if (props.selectedGeomId) {
    mapInstance.setFeatureState(
      { source: sourceName, sourceLayer: layerName, id: props.selectedGeomId },
      { selected: true }
    );
  }

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
      const displayValue = props.isCountIndicator && !props.showAsPercent
        ? Number(val).toLocaleString('en-US')
        : (Number(val) * 100).toFixed(2) + '%';
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
  
  // Handle resize events for embed mode
  resizeHandler = () => {
    if (mapInstance) {
      mapInstance.resize();
    }
  };
  window.addEventListener('resize', resizeHandler);
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

// Update feature states when lookup changes (without full re-render).
// Count-indicator coloring is an exception: its color scale is stretched to
// the min/max of the current lookup (there's no fixed quality threshold to
// fall back on), and that scale is baked into the paint expression at
// updateMapData() time - a lookup update alone would leave it stale (e.g.
// freshly-loaded values colored against the *previous* indicator's range),
// so it needs the full rebuild, not just a feature-state patch.
watch(
  () => props.lookup,
  (newLookup) => {
    if (!isMapInitialized || !mapInstance) return;

    if (props.isCountIndicator) {
      updateMapData();
      return;
    }

    const sourceName = props.sourceName;
    const layerName = props.layerName;

    Object.entries(newLookup).forEach(([id, val]) => {
      mapInstance!.setFeatureState(
        { source: sourceName, sourceLayer: layerName, id },
        { value: val }
      );
    });
  },
    // lookup ref is replaced entirely on data load, so identity check is sufficient
);

watch(
  () => props.selectedGeomId,
  (newId, oldId) => {
    if (!mapInstance || !isMapInitialized) return;
    const sourceName = props.sourceName;
    const layerName = props.layerName;
    if (oldId) {
      mapInstance.setFeatureState({ source: sourceName, sourceLayer: layerName, id: oldId }, { selected: false });
    }
    if (newId) {
      mapInstance.setFeatureState({ source: sourceName, sourceLayer: layerName, id: newId }, { selected: true });
    }
  }
);

interface MapView {
  lng: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

function getView(): MapView | null {
  if (!mapInstance) return null;
  const center = mapInstance.getCenter();
  return {
    lng: center.lng,
    lat: center.lat,
    zoom: mapInstance.getZoom(),
    bearing: mapInstance.getBearing(),
    pitch: mapInstance.getPitch()
  };
}

// jumpTo is instantaneous (no animation) and fires "move" synchronously
// within this same call, so the isSyncingView guard only needs to bracket
// this one call, not wait for an animation to finish.
function setView(view: MapView) {
  if (!mapInstance) return;
  isSyncingView = true;
  mapInstance.jumpTo({ center: [view.lng, view.lat], zoom: view.zoom, bearing: view.bearing, pitch: view.pitch });
  isSyncingView = false;
}

defineExpose({ getView, setView });

onUnmounted(() => {
  console.log('[MetricMap] Component unmounting, containerId:', props.containerId);
  
  // Remove resize handler
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  
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
