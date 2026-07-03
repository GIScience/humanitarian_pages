<!-- StoryMapCanvas.vue -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import MapView from '@/components/map/MapView.vue';
import MapZoomControl from '@/components/map/MapZoomControl.vue';

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
const isVisible = ref(false);
const mapViewRef = ref<InstanceType<typeof MapView> | null>(null);
const map = computed(() => mapViewRef.value?.map ?? null);

let markerInstances: maplibregl.Marker[] = [];
let intersectionObserver: IntersectionObserver | null = null;

function renderMarkers() {
    markerInstances.forEach((m) => m.remove());
    markerInstances = [];
    if (!map.value) return;

    props.markers.forEach((marker) => {
        const markerEl = document.createElement('div');
        markerEl.className = 'relative flex h-4 w-4 items-center justify-center';
        markerEl.innerHTML = `
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style="background-color: ${marker.color || '#ca2333'}"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-white shadow-md" style="background-color: ${marker.color || '#ca2333'}"></span>
        `;

        const instance = new maplibregl.Marker({ element: markerEl }).setLngLat([marker.lng, marker.lat]).addTo(map.value!);

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
    if (!map.value || !props.pmtilesUrl || !props.pcodeField) return;

    const sourceId = 'story-map-risk-source';
    const layerId = 'story-map-risk-layer';

    if (map.value.getLayer(layerId)) map.value.removeLayer(layerId);
    if (map.value.getSource(sourceId)) map.value.removeSource(sourceId);

    map.value.addSource(sourceId, {
        type: 'vector',
        url: `pmtiles://${props.pmtilesUrl}`,
        promoteId: props.pcodeField,
    });

    const flatMatches = props.matchArray.flatMap((m) => [m[0], m[1]]);
    const fillColor: any = flatMatches.length >= 2
        ? ['match', ['get', props.pcodeField], ...flatMatches, '#AAAAAA']
        : '#AAAAAA';

    map.value.addLayer({
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

function handleMapLoad(mapInstance: maplibregl.Map) {
    mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }));
    renderMarkers();
    renderRiskLayer();
}

function activateMap() {
    requestAnimationFrame(() => mapViewRef.value?.initMap());
}

onMounted(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        isVisible.value = true;
        activateMap();
        return;
    }

    intersectionObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    isVisible.value = true;
                    activateMap();
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
    markerInstances.forEach((m) => m.remove());
});

watch(() => props.center, (val) => {
    if (val) mapViewRef.value?.flyTo(val, props.zoom, 1500);
});

watch(() => props.markers, () => {
    if (map.value?.isStyleLoaded()) renderMarkers();
}, { deep: true });

watch(() => [props.pmtilesUrl, props.matchArray], () => {
    if (map.value?.isStyleLoaded()) renderRiskLayer();
}, { deep: true });
</script>

<template>
    <figure ref="el" data-no-reveal class="my-10">
        <div class="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm transition-all duration-700 ease-out"
            :class="isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'" :style="{ height }">
            <MapView v-if="isVisible" ref="mapViewRef" :map-style="mapStyle" :center="center" :zoom="zoom"
                :interactive="interactive" :scroll-zoom="false" :attribution-control="false" :auto-init="false"
                @load="handleMapLoad" />
            <MapZoomControl v-if="interactive" :map="map" />
            <div v-if="!isVisible" class="absolute inset-0 flex items-center justify-center">
                <div class="h-8 w-8 animate-spin rounded-full border-4 border-heigit-red border-t-transparent" />
            </div>
        </div>
        <figcaption v-if="caption" class="mt-3 text-center text-xs italic text-slate-500">
            {{ caption }}
        </figcaption>
    </figure>
</template>
