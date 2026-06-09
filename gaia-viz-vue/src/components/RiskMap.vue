<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import * as pmtiles from 'pmtiles';
import { registerMapProtocol } from '../utils/mapProtocol';
import RiskLegend from './RiskLegend.vue';

const props = defineProps<{
  pmtilesUrl: string;
  pcodeField: string;
  matchArray: [string, string, number][];
  highlightedPcode?: string | null;
  isAnalysisVisible?: boolean;
  availableCountries?: string[];
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  (e: 'country-click', code: string): void;
  (e: 'toggle-analysis'): void;
}>();

const mapContainer = ref<HTMLDivElement | null>(null);
let map: maplibregl.Map | null = null;

const floodLayerId = "risk-layer";
const interactLayerId = "world-fills";

const layerOpacity = ref(0.7);

const styleUrl = "https://tiles.openfreemap.org/styles/positron"; // Light style like open-access-lens

onMounted(() => {
  registerMapProtocol();

  if (!mapContainer.value) return;

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: styleUrl,
    center: [0, 20],
    zoom: 1.5,
    scrollZoom: true // Standard scroll zoom
  });

  // Add navigation controls (zoom +/-) in top right - only on desktop
  if (!props.isMobile) {
    map.addControl(new maplibregl.NavigationControl({
      showCompass: false
    }), 'top-right');
  }

  map.on('load', () => {
    // Add World Boundaries for Click Interaction
    map!.addSource('world', {
      type: 'geojson',
      data: './data/world.json',
      promoteId: 'iso_a3'
    });

    const isLoaded = props.availableCountries && props.availableCountries.length > 0;
    const validCountries = isLoaded ? props.availableCountries : ['NONE'];

    // Unavailable Countries Layer
    map!.addLayer({
      id: 'unavailable-countries',
      type: 'fill',
      source: 'world',
      paint: {
        'fill-color': '#cbd5e1', // Slate 300
        'fill-opacity': 0.6
      },
      filter: isLoaded ? ['!', ['in', ['get', 'iso_a3'], ['literal', validCountries]]] : ['==', 'iso_a3', 'DOES_NOT_EXIST']
    });

    map!.addLayer({
      id: interactLayerId,
      type: 'fill',
      source: 'world',
      paint: {
        'fill-color': '#ca2333',
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.1,
          0
        ]
      },
      filter: isLoaded ? ['in', ['get', 'iso_a3'], ['literal', validCountries]] : ['==', 'iso_a3', 'DOES_NOT_EXIST']
    });

    updateLayer();
    
    // Smooth resizing for layout transitions
    if (mapContainer.value) {
      const resizeObserver = new ResizeObserver(() => {
        map?.resize();
      });
      resizeObserver.observe(mapContainer.value);
    }
  });

  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: 'risk-tooltip'
  });

  map.on('mousemove', floodLayerId, (e) => {
    if (!e.features || e.features.length === 0) return;
    map!.getCanvas().style.cursor = 'pointer';

    const feature = e.features[0];
    const pcode = feature.properties[props.pcodeField];
    const match = props.matchArray.find(m => m[0] === pcode);
    
    if (match) {
      popup.setLngLat(e.lngLat)
        .setHTML(`
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
        `)
        .addTo(map!);
    }
  });

  map.on('mouseleave', floodLayerId, () => {
    map!.getCanvas().style.cursor = '';
    popup.remove();
  });

  // Country Click & Hover Interaction
  let hoveredCountryId: string | number | null = null;

  map.on('mousemove', interactLayerId, (e) => {
    if (e.features && e.features.length > 0) {
      if (hoveredCountryId !== null) {
        map!.setFeatureState(
          { source: 'world', id: hoveredCountryId },
          { hover: false }
        );
      }
      hoveredCountryId = e.features[0].id || e.features[0].properties.iso_a3;
      map!.setFeatureState(
        { source: 'world', id: hoveredCountryId! },
        { hover: true }
      );
      map!.getCanvas().style.cursor = 'pointer';
    }
  });

  map.on('mouseleave', interactLayerId, () => {
    if (hoveredCountryId !== null) {
      map!.setFeatureState(
        { source: 'world', id: hoveredCountryId },
        { hover: false }
      );
    }
    hoveredCountryId = null;
    map!.getCanvas().style.cursor = '';
  });

  map.on('click', interactLayerId, (e) => {
    if (e.features && e.features.length > 0) {
      const isoCode = e.features[0].properties.iso_a3;
      if (isoCode) {
        emit('country-click', isoCode);
      }
    }
  });

  map.on('style.load', onStyleLoad);
  window.addEventListener('resize', () => map?.resize());
});

// Using 'bright' style for faster loading
async function updateLayer() {
  if (!map || !map.isStyleLoaded()) return;

  // HANDLE RESET: If pmtilesUrl is empty, zoom back to world and clear layers
  if (!props.pmtilesUrl) {
    if (map.getLayer("risk-layer-highlight")) map.removeLayer("risk-layer-highlight");
    if (map.getLayer(floodLayerId)) map.removeLayer(floodLayerId);
    if (map.getSource(floodLayerId)) map.removeSource(floodLayerId);
    
    map.flyTo({
      center: [0, 20],
      zoom: 1.5,
      duration: 3000,
      essential: true
    });
    return;
  }

  if (!props.pcodeField) return;

  const currentSource = map.getSource(floodLayerId);
  const sourceUrl = `pmtiles://${props.pmtilesUrl}`;

  // If source URL changed, we need to re-add everything
  if (!currentSource || (currentSource as any).url !== sourceUrl) {
    if (map.getLayer("risk-layer-highlight")) map.removeLayer("risk-layer-highlight");
    if (map.getLayer(floodLayerId)) map.removeLayer(floodLayerId);
    if (map.getSource(floodLayerId)) map.removeSource(floodLayerId);

    map.addSource(floodLayerId, {
      type: "vector",
      url: sourceUrl,
      promoteId: props.pcodeField
    });

    map.addLayer({
      id: floodLayerId,
      type: "fill",
      source: floodLayerId,
      "source-layer": "boundary",
      paint: {
        "fill-color": "#AAAAAA",
        "fill-opacity": Number(layerOpacity.value),
        "fill-outline-color": "#94a3b8" // Grey for subnational boundaries
      }
    });

    map.addLayer({
      id: "risk-layer-highlight",
      type: "line",
      source: floodLayerId,
      "source-layer": "boundary",
      paint: {
        "line-color": "#ca2333", // HeiGIT red
        "line-width": 2,
        "line-opacity": 0.9
      },
      filter: ['==', props.pcodeField, props.highlightedPcode || '']
    });

    // Fit bounds
    const pmtilesFile = new pmtiles.PMTiles(props.pmtilesUrl);
    try {
      const metadata = (await pmtilesFile.getMetadata()) as any;
      if (metadata?.antimeridian_adjusted_bounds) {
        const bounds = (metadata.antimeridian_adjusted_bounds as string).split(",").map(Number);
        if (bounds.length === 4 && bounds.every(v => !isNaN(v))) {
          const [minLon, minLat, maxLon, maxLat] = bounds;
          map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 40, duration: 2000 });
        }
      }
    } catch (err) {
      console.log("Could not read PMTiles bounds");
    }
  }

  // Update paint properties
  // Extract only [pcode, color] pairs for the match expression
  const mapMatches = props.matchArray.flatMap(m => [m[0], m[1]]);
  let fillColor: any = "#AAAAAA";
  
  if (mapMatches.length >= 2) {
    fillColor = ["match", ["get", props.pcodeField], ...mapMatches, "#AAAAAA"];
  }

  map.setPaintProperty(floodLayerId, "fill-color", fillColor);
}

const onStyleLoad = () => {
  if (!map) return;
  
  // Apply distinct colors: Red for National, Grey for Subnational
  const nationalLayers = ['boundary_2', 'boundary_disputed'];
  const subnationalLayers = ['boundary_3', 'boundary_4', 'boundary_5', 'boundary_6'];

  nationalLayers.forEach(layerId => {
    if (map?.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'line-color', '#ca2333');
      map.setPaintProperty(layerId, 'line-opacity', 0.8);
    }
  });

  subnationalLayers.forEach(layerId => {
    if (map?.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'line-color', '#94a3b8');
      map.setPaintProperty(layerId, 'line-opacity', 0.4);
    }
  });

  if (map.isStyleLoaded()) updateLayer();
};

watch(() => props.highlightedPcode, (newVal) => {
  if (map && map.getLayer("risk-layer-highlight")) {
      if (newVal) {
          map.setFilter("risk-layer-highlight", ['==', props.pcodeField, newVal]);
      } else {
          map.setFilter("risk-layer-highlight", ['==', props.pcodeField, '']);
      }
  }
});

watch(layerOpacity, (newVal) => {
  if (map && map.getLayer(floodLayerId)) {
    map.setPaintProperty(floodLayerId, "fill-opacity", Number(newVal));
  }
});

watch(() => props.pmtilesUrl, updateLayer);
watch(() => props.matchArray, updateLayer);

watch(() => props.availableCountries, (newVal) => {
  if (map && map.getLayer('unavailable-countries') && map.getLayer(interactLayerId)) {
    const isLoaded = newVal && newVal.length > 0;
    const validCountries = isLoaded ? newVal : ['NONE'];
    map.setFilter('unavailable-countries', isLoaded ? ['!', ['in', ['get', 'iso_a3'], ['literal', validCountries]]] : ['==', 'iso_a3', 'DOES_NOT_EXIST']);
    map.setFilter(interactLayerId, isLoaded ? ['in', ['get', 'iso_a3'], ['literal', validCountries]] : ['==', 'iso_a3', 'DOES_NOT_EXIST']);
  }
}, { deep: true });

defineExpose({
  resetView: () => {
    if (map) {
      map.flyTo({
        center: [0, 20],
        zoom: 1.5,
        duration: 3000,
        essential: true
      });
    }
  }
});
</script>

<template>
  <div class="relative w-full h-full">
    <!-- Opacity Control -->
    <transition name="fade">
      <div v-if="pmtilesUrl" class="absolute z-[60] bg-white/90 backdrop-blur-md rounded-lg shadow-sm border border-slate-200 flex flex-col gap-1.5"
           :class="props.isMobile ? 'bottom-32 left-4 w-28 px-2 py-1.5' : 'top-4 left-4 w-auto px-3 py-2'">
        <label class="block text-slate-500 font-bold uppercase tracking-widest whitespace-nowrap"
              :class="props.isMobile ? 'text-[8px]' : 'text-[9px]'">
          Opacity: <span class="text-slate-700 font-extrabold">{{ Math.round(layerOpacity * 100) }}%</span>
        </label>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.05" 
          v-model.number="layerOpacity"
          class="bg-slate-200 rounded-lg appearance-none cursor-pointer accent-heigit-red"
          :class="props.isMobile ? 'w-full h-1' : 'w-24 h-1.5'"
        />
      </div>
    </transition>

    <div ref="mapContainer" id="world-map"></div>
    <RiskLegend v-if="matchArray && matchArray.length > 0" :is-mobile="props.isMobile" />
  </div>
</template>

<style scoped>
#world-map {
  width: 100%;
  height: 100%;
}

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
  margin-top: 16px;
  margin-right: 16px;
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

