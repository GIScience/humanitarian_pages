<!-- StoryMapCanvas.vue -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import { registerMapProtocol } from '@/utils/mapProtocol';

interface StoryMapMarker {
    lng: number;
    lat: number;
    label?: string;
    color?: string;
}

const props = withDefaults(defineProps<{
    center?: [number, number];
    zoom?: number;
    height?: string;
    caption?: string;
    mapStyle?: string;
    interactive?: boolean;
    markers?: StoryMapMarker[];
    pmtilesUrl?: string;
    pcodeField?: string;
    matchArray?: [string, string, number][];
}>(), {
    center: () => [20, 10],
    zoom: 1.8,
    height: '440px',
    mapStyle: 'https://tiles.openfreemap.org/styles/positron',
    interactive: true,
    markers: () => [],
    matchArray: () => [],
});

const el = ref<HTMLElement | null>(null);
const mapContainer = ref<HTMLDivElement | null>(null);
const isVisible = ref(false);

let map: maplibregl.Map | null = null;
let markerInstances: maplibregl.Marker[] = [];
let intersectionObserver: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let mapInitialized = false;

function renderMarkers() {
    markerInstances.forEach((m) => m.remove());
    markerInstances = [];
    if (!map) return;

    props.markers.forEach((marker) => {
        const markerEl = document.createElement('div');
        markerEl.className = 'relative flex h-4 w-4 items-center justify-center';
        markerEl.innerHTML = `
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style="background-color: ${marker.color || '#ca2333'}"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-white shadow-md" style="background-color: ${marker.color || '#ca2333'}"></span>
        `;

        const instance = new maplibregl.Marker({ element: markerEl }).setLngLat([marker.lng, marker.lat]).addTo(map!);

        if (marker.label) {
            instance.setPopup(
                new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
                    `<div class="text-xs font-bold text-slate-800">${marker.label}</div>`
                )
            );
        }

        markerInstances.push(instance);
    });
}

function renderRiskLayer() {
    if (!map || !props.pmtilesUrl || !props.pcodeField) return;

    const sourceId = 'story-map-risk-source';
    const layerId = 'story-map-risk-layer';

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    map.addSource(sourceId, {
        type: 'vector',
        url: `pmtiles://${props.pmtilesUrl}`,
        promoteId: props.pcodeField,
    });

    const flatMatches = props.matchArray.flatMap((m) => [m[0], m[1]]);
    const fillColor: any = flatMatches.length >= 2
        ? ['match', ['get', props.pcodeField], ...flatMatches, '#AAAAAA']
        : '#AAAAAA';

    map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        'source-layer': 'boundary',
        paint: {
            'fill-color': fillColor,
            'fill-opacity': 0.75,
            'fill-outline-color': '#94a3b8',
        },
    });
}

function initMap() {
    if (mapInitialized || !mapContainer.value) return;
    mapInitialized = true;

    registerMapProtocol();

    map = new maplibregl.Map({
        container: mapContainer.value,
        style: props.mapStyle,
        center: props.center,
        zoom: props.zoom,
        interactive: props.interactive,
        scrollZoom: false,
        attributionControl: false,
    });

    if (props.interactive) {
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    }
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    map.on('load', () => {
        renderMarkers();
        renderRiskLayer();
    });

    resizeObserver = new ResizeObserver(() => map?.resize());
    resizeObserver.observe(mapContainer.value);
}

onMounted(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        isVisible.value = true;
        requestAnimationFrame(initMap);
        return;
    }

    intersectionObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    isVisible.value = true;
                    requestAnimationFrame(initMap);
                    intersectionObserver?.disconnect();
                }
            });
        },
        { threshold: 0.15, rootMargin: '120px' }
    );

    if (el.value) intersectionObserver.observe(el.value);
});

onBeforeUnmount(() => {
    intersectionObserver?.disconnect();
    resizeObserver?.disconnect();
    markerInstances.forEach((m) => m.remove());
    map?.remove();
});

watch(() => props.center, (val) => {
    if (map && val) map.flyTo({ center: val, zoom: props.zoom, duration: 1500, essential: true });
});

watch(() => props.markers, () => {
    if (map?.isStyleLoaded()) renderMarkers();
}, { deep: true });

watch(() => [props.pmtilesUrl, props.matchArray], () => {
    if (map?.isStyleLoaded()) renderRiskLayer();
}, { deep: true });
</script>

<template>
    <figure ref="el" data-no-reveal class="my-10">
        <div class="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm transition-all duration-700 ease-out"
            :class="isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'" :style="{ height }">
            <div ref="mapContainer" class="h-full w-full" />
            <div v-if="!isVisible" class="absolute inset-0 flex items-center justify-center">
                <div class="h-8 w-8 animate-spin rounded-full border-4 border-heigit-red border-t-transparent" />
            </div>
        </div>
        <figcaption v-if="caption" class="mt-3 text-center text-xs italic text-slate-500">
            {{ caption }}
        </figcaption>
    </figure>
</template>
