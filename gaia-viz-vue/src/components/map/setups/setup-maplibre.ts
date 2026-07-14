import maplibregl, { Map } from "maplibre-gl";
import type { Ref } from "vue";
import { BASEMAPS } from "@/enums";
import { MAP_STYLES, MAX_ZOOM_LEVEL } from "@/config";
import { Protocol } from "pmtiles";
import { cogProtocol } from "@geomatico/maplibre-cog-protocol";

export const setupMaplibreMap = (
  containerRef: Ref<HTMLElement | null>,
  pmtiles: boolean,
  hash: boolean = false,
  scrollZoom: boolean = true,
  interactive: boolean = true,
  attributionControl: boolean = true,
  onLoad?: (map: maplibregl.Map) => void,
): Map => {
  
  // Set the RTL plugin if it hasn't been set yet
  if (maplibregl.getRTLTextPluginStatus() === "unavailable") {
    maplibregl.setRTLTextPlugin(
      "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js",
      true,
    );
  }


  const map = new maplibregl.Map({
    container: containerRef.value!,
    style: MAP_STYLES[BASEMAPS.OSM],
    center: [0, 20],
    zoom: 8,
    minZoom: 1,
    maxZoom: MAX_ZOOM_LEVEL,
    interactive: interactive,
    scrollZoom: scrollZoom,
    attributionControl: attributionControl === false ? false : undefined,
    dragRotate: false,
    touchZoomRotate: false,
    pitchWithRotate: false,
  });

  try {
    maplibregl.addProtocol("cog", cogProtocol);
  } catch (e: any) {
    if (!e.message?.includes("already exists")) {
      console.error("Failed to register COG protocol:", e);
    }
  }

  if (pmtiles) {
    try {
      const protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
    } catch (e: any) {
      if (!e.message?.includes("already exists")) {
        console.error("Failed to register PMTiles protocol:", e);
      }
    }
  }

  map.keyboard.disableRotation();

  if (onLoad) {
    map.on("load", () => onLoad(map));
  }

  if (hash) {
    map.on("moveend", () => {
      const center = map.getCenter();
      const zoom = map.getZoom().toFixed(2);
      const lat = center.lat.toFixed(4);
      const lng = center.lng.toFixed(4);
      const newHash = `#${zoom}/${lat}/${lng}`;
      history.replaceState(null, "", newHash);
    });
  }

  return map;
};