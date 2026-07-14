import { Map } from "maplibre-gl";
import { setupMaplibreMap } from "@/components/map/setups/setup-maplibre";
import { ref, shallowRef, onMounted, onBeforeUnmount } from "vue";

/**
 * useMapInstance - Initializes and manages a MapLibre map instance.
 *
 * @param pmtiles - Optional flag to enable PMTiles support.
 * @param hash - Optional flag to enable URL hash sync.
 * @returns map instance, drawing mode, and the container ref.
 */
export default function useMapInstance(
  pmtiles = true,
  hash = false,
  attributionControl = true,
  scrollZoom = true,
  interactive = true,
) {
  const mapContainerRef = ref<HTMLDivElement | null>(null);
  const map = shallowRef<Map | null>(null);
  const isLoaded = ref(false);

  let resizeObserver: ResizeObserver | null = null;

  // const mapStore = useMapStore();

  const updateZoom = () => {
    if (!map.value) return;
    // mapStore.setZoom(Math.round(map.value.getZoom()));
  };

  // Initialize the map instance when the component is mounted
  onMounted(() => {
    if (!mapContainerRef.value) return;

    const instance = setupMaplibreMap(
      mapContainerRef,
      pmtiles,
      hash,
      scrollZoom,
      interactive,
      attributionControl
    );

    instance.on("load", () => {
      map.value = instance;
      isLoaded.value = true;
      //   mapStore.setZoom(Math.round(instance.getZoom()) + 1);
    });

    resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(mapContainerRef.value);

    instance.on("zoomend", updateZoom);
  });

  // Clean up the map instance and observers when the component is unmounted
  function destroyMap() {
    if (map.value) {
      map.value.off("zoomend", updateZoom);
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    map.value?.remove();
    map.value = null;
    isLoaded.value = false;
  }

  onBeforeUnmount(destroyMap);

  return {
    mapContainerRef,
    map,
    isLoaded,
  };
}
