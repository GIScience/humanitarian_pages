import { watch, type Ref } from "vue";
import type { Map } from "maplibre-gl";

type UseInitialHashFitResult = {
  hadHashOnLoad: boolean;
};

/**
 * On the first time the map becomes available:
 * - if there is a hash (#zoom/lat/lng), flyTo() that view
 * - otherwise, leave the map alone (put your fitBounds(aoiBounds) in the else)
 *
 * MapLibre's own `hash: true` stays enabled, so after this point
 * every pan/zoom updates the URL automatically.
 */
export function useInitialHashFit(map: Ref<Map | null>): UseInitialHashFitResult {
  // Captured once, at setup, before the map has had a chance to move.
  const initialHash = window.location.hash;
  let handled = false;

  watch(
    map,
    (m) => {
      if (handled || !m) return;
      handled = true;

      const hash = initialHash.slice(1);
      if (hash) {
        const [zStr, latStr, lngStr] = hash.split("/");
        const z = parseFloat(zStr);
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        if (!isNaN(z) && !isNaN(lat) && !isNaN(lng)) {
          m.flyTo({ center: [lng, lat], zoom: z });
        }
      }
    },
    { immediate: true },
  );

  return { hadHashOnLoad: initialHash.length > 0 };
}