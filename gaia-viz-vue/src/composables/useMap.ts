import { ref, shallowRef, onBeforeUnmount } from "vue";
import maplibregl from "maplibre-gl";
import { registerMapProtocol } from "@/utils/mapProtocol";

export interface UseMapOptions {
  style: string;
  center?: [number, number];
  zoom?: number;
  interactive?: boolean;
  scrollZoom?: boolean;
  attributionControl?: boolean;
  onLoad?: (map: maplibregl.Map) => void;
}


export function useMap(options: UseMapOptions) {
  const mapContainer = ref<HTMLDivElement | null>(null);
  const map = shallowRef<maplibregl.Map | null>(null);
  const isLoaded = ref(false);

  let resizeObserver: ResizeObserver | null = null;

  function initMap(): maplibregl.Map | null {
    if (map.value || !mapContainer.value) return map.value;

    registerMapProtocol();

    const instance = new maplibregl.Map({
      container: mapContainer.value,
      style: options.style,
      center: options.center ?? [0, 20],
      zoom: options.zoom ?? 1.5,
      interactive: options.interactive ?? true,
      scrollZoom: options.scrollZoom ?? true,
      attributionControl: options.attributionControl === false ? false : undefined,
    });

    instance.on("load", () => {
      isLoaded.value = true;
      options.onLoad?.(instance);
    });

    resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(mapContainer.value);

    map.value = instance;
    return instance;
  }

  function flyTo(center: [number, number], zoom: number, duration = 3000) {
    map.value?.flyTo({ center, zoom, duration, essential: true });
  }

  function destroyMap() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    map.value?.remove();
    map.value = null;
    isLoaded.value = false;
  }

  onBeforeUnmount(destroyMap);

  return { mapContainer, map, isLoaded, initMap, destroyMap, flyTo };
}
