<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { colorful } from "@versatiles/style";
import type { StyleSpecification } from "maplibre-gl";
import { indicatorLabel } from '../utils/helpers';
import { formatNumber, formatPercent } from '../i18n';

// Same basemap as HeiGIT's Hazard-Risk-Composer and Climate Action Navigator
// (climate-action.heigit.org): a VersaTiles-hosted OSM vector style, tiles/
// glyphs/sprites all served from tiles.versatiles.org. Generated in-process
// by the @versatiles/style package rather than fetched as a style JSON.
// Replaces the previous OpenFreeMap style (tiles.openfreemap.org) - this
// app has no other third-party tile dependency left after this change.
const BASEMAP_STYLE = colorful({ baseUrl: "https://tiles.versatiles.org" }) as StyleSpecification;

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
  // Some indicators (currently mapping-saturation) color the map from a
  // rescaled/discretized value (see the parent's mapLookup special case)
  // that isn't the indicator's real value - e.g. quality class 3 rescaled
  // to 0.5 for coloring purposes, when the actual saturation ratio might be
  // 0.92. Without this, the hover popup read that same rescaled number
  // (showing "50.00%" instead of the real "92.00%"). Optional and defaults
  // to `lookup` so every other indicator (where lookup already is the real
  // value) is unaffected.
  valueLookup?: Record<string, number>;
  // Which region (by the same id used for lookup/feature-state) should be
  // drawn with the "selected" outline - the parent owns this (it's what
  // decides which polygon's plot to show), this component only visualizes it.
  selectedGeomId?: string | null;
  // Credit for whoever the boundary polygons in pmtilesUrl actually come
  // from (geoBoundaries for most countries, Germany's own BKG - see
  // getCountryLayers() in helpers.ts) - the parent decides which, since it
  // already knows the selected country; this component just displays
  // whatever it's given via the map's attribution control.
  boundariesAttribution?: string;
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
  // parent. regionName is the clicked feature's name (see getRegionName), or
  // null if it has none.
  (e: 'regionClick', geomId: string | null, regionName: string | null): void;
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

// The pmtiles source (one file, covering every grid layer) only actually
// needs to change on a real country switch - tracked so updateMapData()
// can tell that apart from a topic/indicator/layer change, which reuses it.
let currentSourceUrl: string | null = null;
// Which region ids currently carry a "value"/"displayValue" feature-state,
// and under which source-layer - so a lookup update can clear exactly the
// ids that dropped out of it (e.g. this indicator has no data for a region
// the previous one did) without clobbering unrelated feature-state keys
// like "selected", and without needing a full source rebuild to reset
// everything. Reset whenever the source-layer itself changes, since ids
// from a previous grid layer (adm1 vs h3) aren't meaningful there anyway.
let lastFeatureStateLayerName: string | null = null;
let lastAppliedLookupKeys = new Set<string>();

function applyLookupFeatureStates(
  sourceName: string,
  layerName: string,
  lookup: Record<string, number>,
  displayLookup: Record<string, number>
) {
  if (!mapInstance) return;

  if (lastFeatureStateLayerName !== layerName) {
    lastAppliedLookupKeys = new Set();
    lastFeatureStateLayerName = layerName;
  }

  const newKeys = new Set(Object.keys(lookup));

  // Clear ids that had a value before but don't anymore - otherwise they'd
  // keep showing the previous indicator's/topic's color and value forever,
  // since a lookup update alone never removes stale feature-state.
  lastAppliedLookupKeys.forEach((id) => {
    if (!newKeys.has(id)) {
      mapInstance!.removeFeatureState({ source: sourceName, sourceLayer: layerName, id }, 'value');
      mapInstance!.removeFeatureState({ source: sourceName, sourceLayer: layerName, id }, 'displayValue');
    }
  });

  Object.entries(lookup).forEach(([id, val]) => {
    mapInstance!.setFeatureState(
      { source: sourceName, sourceLayer: layerName, id },
      { value: val, displayValue: displayLookup[id] ?? val }
    );
  });

  lastAppliedLookupKeys = newKeys;
}

// With a region selected, every region's base fill fades back - including
// the selected one's, since a lifted copy of it is drawn on top (see the
// "-selected-fill" layer). Swapped via setPaintProperty on selection change.
function fillOpacityExpression(hasSelection: boolean): number {
  return hasSelection ? 0.2 : 0.6;
}

function initMap() {
  console.log('[MetricMap] initMap called, container:', !!mapContainer.value, 'pmtilesUrl:', !!props.pmtilesUrl, 'existing map:', !!mapInstance);

  if (!mapContainer.value || !props.pmtilesUrl || mapInstance) return;

  const handleMapClick = (e: any) => {
    if (!mapInstance || !currentLayerId) return;
    const hits = mapInstance.queryRenderedFeatures(e.point, { layers: [currentLayerId] });
    const clickedId = hits.length > 0 && hits[0].id != null ? String(hits[0].id) : null;
    const deselect = clickedId === null || clickedId === props.selectedGeomId;
    emit('regionClick', deselect ? null : clickedId, deselect ? null : getRegionName(hits[0]));
  };

  // Register PMTiles protocol
  try {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
  } catch (e) {
    // Protocol already registered
  }

  // Create map instance
  //
  // The basemap style (@versatiles/style's colorful(), see BASEMAP_STYLE
  // above) already carries its own OpenStreetMap attribution on its vector
  // source, so simply leaving the default attribution control enabled
  // (rather than the attributionControl: false this used to set) is enough
  // to surface it - required by OSM's license (ODbL) wherever OSM-derived
  // data is shown, not just a nicety. The boundaries source added in
  // updateMapData() below carries its own separate `attribution` (passed in
  // via the boundariesAttribution prop), which the same control picks up
  // and merges in automatically. customAttribution credits the library
  // itself - not a license requirement (MapLibre GL JS is BSD-3-Clause, no
  // on-screen credit obligation), just goodwill toward the project - and is
  // prepended before every source-derived attribution the control collects,
  // so it reads "MapLibre | © OpenStreetMap contributors [| ...]".
  mapInstance = new maplibregl.Map({
    container: mapContainer.value,
    style: BASEMAP_STYLE,
    attributionControl: {
      compact: true,
      customAttribution: '<a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>'
    }
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
      // Colorblind-safe triple (see main.css --good/--warn/--bad) instead
      // of a red/yellow/green traffic light - kept in sync with those
      // tokens' hex values by hand, since MapLibre paint expressions can't
      // read CSS custom properties.
      0, "#D55E00",
      0.25, "#F0E442",
      0.75, "#009E73"
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

  // The pmtiles source is one file covering every grid layer (adm0/adm1/h3),
  // so only a genuine country switch actually needs a new source - a topic,
  // indicator or grid-layer change reuses it. Removing and re-adding the
  // source unconditionally (as this used to do on every one of those
  // switches) forced MapLibre to re-fetch and re-parse every visible tile
  // from scratch each time; because that re-parse is async, it could race
  // with the feature-state update below - a topic switch's new lookup
  // sometimes finished applying before the freshly re-added source had
  // finished reloading its tiles, leaving some regions stuck on the default
  // grey ("no data") until a later switch's timing happened to land the
  // other way. Confirmed this matches the reported symptom (some adm1
  // regions greyed out after a topic switch, fixed by switching away and
  // back). Keeping the same source instance whenever the URL hasn't changed
  // removes that race, on top of being cheaper.
  const sourceUrl = `pmtiles://${props.pmtilesUrl}`;
  if (currentSourceUrl !== sourceUrl || !mapInstance.getSource(sourceName)) {
    if (mapInstance.getSource(sourceName)) {
      mapInstance.removeSource(sourceName);
    }
    mapInstance.addSource(sourceName, {
      type: "vector",
      url: sourceUrl,
      promoteId: "id",
      attribution: props.boundariesAttribution
    });
    currentSourceUrl = sourceUrl;
  }

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
      "fill-opacity": fillOpacityExpression(!!props.selectedGeomId),
      "fill-opacity-transition": { duration: 250 },
      "fill-outline-color": "#555"
    }
  });

  // The click-selected region reads as "lifted" above the map, like a
  // hovered card: its base polygon fades back with every other region (see
  // fillOpacityExpression), and a solid copy of it is drawn a few pixels up
  // (fill-translate), with a soft shadow shifted down underneath and a crisp
  // white edge on top. Translate isn't data-driven, but these layers only
  // ever show the selected feature anyway - their opacity (not their
  // presence) is driven by the "selected" feature-state, since MapLibre
  // filter expressions can't read feature-state, only paint expressions can.
  // The lift scales with zoom: zoomed out, regions are small and dense and
  // a big offset/shadow reads as a dark smudge rather than depth.
  const isSelected = ["boolean", ["feature-state", "selected"], false];
  const lift = ["interpolate", ["linear"], ["zoom"], 5, ["literal", [0, -1]], 10, ["literal", [0, -3]]];
  const drop = ["interpolate", ["linear"], ["zoom"], 5, ["literal", [0, 1]], 10, ["literal", [0, 4]]];
  const glowLayerId = `${layerId}-selected-glow`;
  const liftedLayerId = `${layerId}-selected-fill`;
  const selectedLayerId = `${layerId}-selected`;
  for (const id of [glowLayerId, liftedLayerId, selectedLayerId]) {
    if (mapInstance.getLayer(id)) mapInstance.removeLayer(id);
  }
  mapInstance.addLayer({
    id: glowLayerId,
    type: "line",
    source: sourceName,
    "source-layer": layerName,
    layout: { "line-join": "round" },
    paint: {
      "line-color": "#1a1a1a",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 4, 10, 10] as any,
      "line-blur": ["interpolate", ["linear"], ["zoom"], 7, 3, 10, 8] as any,
      "line-translate": drop as any,
      "line-opacity": ["interpolate", ["linear"], ["zoom"],
        7, 0,
        10, ["case", isSelected, 0.3, 0]
      ] as any
    }
  });
  mapInstance.addLayer({
    id: liftedLayerId,
    type: "fill",
    source: sourceName,
    "source-layer": layerName,
    paint: {
      "fill-color": buildFillColorExpression(),
      "fill-translate": lift as any,
      "fill-opacity": ["case", isSelected, 0.9, 0] as any
    }
  });
  mapInstance.addLayer({
    id: selectedLayerId,
    type: "line",
    source: sourceName,
    "source-layer": layerName,
    layout: { "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 10, 2.5] as any,
      "line-translate": lift as any,
      "line-opacity": ["case", isSelected, 1, 0] as any
    }
  });

  // Set feature states. "value" drives the fill color (see
  // buildFillColorExpression) and may be a rescaled/discretized stand-in
  // for indicators like mapping-saturation - "displayValue" is always the
  // real, un-rescaled value and is what the hover popup shows. Also clears
  // stale entries from whichever indicator/topic was active before (see
  // applyLookupFeatureStates) - necessary now that the source itself isn't
  // unconditionally rebuilt above.
  const displayLookup = props.valueLookup ?? props.lookup;
  applyLookupFeatureStates(sourceName, layerName, props.lookup, displayLookup);

  // A genuinely new source, or a grid-layer switch (see
  // applyLookupFeatureStates' per-layerName reset), starts with no
  // feature-state at all, so re-apply whichever region the parent
  // currently has selected.
  if (props.selectedGeomId) {
    mapInstance.setFeatureState(
      { source: sourceName, sourceLayer: layerName, id: props.selectedGeomId },
      { selected: true }
    );
  }

  // Setup hover handlers
  setupHoverHandlers(sourceName, layerName, indicatorName);
}

// Region name straight from the pmtiles feature properties - prefer the
// English name, fall back to the local one.
function getRegionName(feature: any): string | null {
  const name = feature?.properties?.name_en || feature?.properties?.name;
  return name ? String(name) : null;
}

// Names come from the boundary data, not from us - escape before they go
// into the popup's innerHTML.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
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

    // "value" (used for the fill color itself, see buildFillColorExpression)
    // can be a rescaled stand-in rather than the indicator's real value -
    // "displayValue" is always the real one, so the popup text and the map
    // color are allowed to legitimately disagree (see valueLookup prop).
    const val = state.displayValue ?? state.value;
    if (val !== undefined && val !== null) {
      mapInstance!.getCanvas().style.cursor = 'pointer';
      const displayValue = props.isCountIndicator && !props.showAsPercent
        ? formatNumber(Number(val))
        : formatPercent(Number(val), 2);
      // Features with no name (e.g. grid cells) just show the value.
      const regionName = getRegionName(feature);
      const nameHtml = regionName ? `<div>${escapeHtml(String(regionName))}</div>` : '';
      popupInstance!.setLngLat(e.lngLat)
        .setHTML(`${nameHtml}<strong>${indicatorLabel(indicatorName)}:</strong> ${displayValue}`)
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

      // Zoom out first, then fly in to the new country's bounds. Kept as a
      // deliberate flourish (a straight fitBounds reads as a jarring jump
      // for a country switch), but shortened from the original 600+650+1200
      // (~2.45s, fixed regardless of how fast the data itself loaded) since
      // that fixed duration was adding to how slow a country switch felt
      // even when the underlying data was already ready.
      mapInstance.easeTo({
        center: [0, 20],
        zoom: 1,
        duration: 350,
        easing: (t) => t * (2 - t)
      });

      // Then zoom in to new bounds after zoom out completes
      setTimeout(() => {
        if (mapInstance && props.bounds) {
          mapInstance.fitBounds(
            [[props.bounds.minLon, props.bounds.minLat], [props.bounds.maxLon, props.bounds.maxLat]],
            { padding: 10, duration: 700 }
          );
        }
      }, 380);
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

    const displayLookup = props.valueLookup ?? newLookup;
    applyLookupFeatureStates(props.sourceName, props.layerName, newLookup, displayLookup);
  },
    // lookup ref is replaced entirely on data load, so identity check is sufficient
);

// valueLookup can change independently of lookup (e.g. switching indicators
// where both the color-lookup and the real-value-lookup are replaced
// together, or a future indicator where they diverge without a color
// change) - patch displayValue on its own so the popup never shows a value
// from the indicator that was active before the switch.
watch(
  () => props.valueLookup,
  (newValueLookup) => {
    if (!isMapInitialized || !mapInstance) return;
    const sourceName = props.sourceName;
    const layerName = props.layerName;
    const displayLookup = newValueLookup ?? props.lookup;

    Object.entries(displayLookup).forEach(([id, val]) => {
      mapInstance!.setFeatureState(
        { source: sourceName, sourceLayer: layerName, id },
        { displayValue: val }
      );
    });
  },
);

// The boundaries credit can change without the source URL changing (e.g. a
// language switch translates its "Boundaries:" label), and the source is
// deliberately not rebuilt for that (see updateMapData). Patch the existing
// source's attribution instead; the attribution control only re-reads
// sources on style/metadata events, so nudge it with a styledata event.
watch(
  () => props.boundariesAttribution,
  (newAttribution) => {
    if (!mapInstance || !isMapInitialized) return;
    const source = mapInstance.getSource(props.sourceName) as { attribution?: string } | undefined;
    if (!source) return;
    source.attribution = newAttribution;
    mapInstance.fire('styledata', { dataType: 'style' });
  }
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
    if (currentLayerId && mapInstance.getLayer(currentLayerId)) {
      mapInstance.setPaintProperty(currentLayerId, "fill-opacity", fillOpacityExpression(!!newId));
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
    currentSourceUrl = null;
    lastFeatureStateLayerName = null;
    lastAppliedLookupKeys = new Set();
  }
});
</script>

<template>
  <div :id="containerId" ref="mapContainer" style="width: 100%; height: 100%;"></div>
</template>

<style scoped>
</style>
