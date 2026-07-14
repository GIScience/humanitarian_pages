import type { StyleSpecification } from "maplibre-gl";


/**
 * Helper function to safely parse environment variables as integers.
 */
export const parseIntEnv = (
  value: string | undefined,
  defaultValue: number,
): number =>
  value !== undefined && !isNaN(parseInt(value, 10))
    ? parseInt(value, 10)
    : defaultValue;


/**
 * The maximum zoom level for the map.
 */

export const MAX_ZOOM_LEVEL: number = parseIntEnv(undefined, 21);


export const MAP_STYLES: Record<string, string | StyleSpecification> = {
  OSM: "https://tiles.openfreemap.org/styles/positron",
//   Satellite: "https://api.maptiler.com/maps/hybrid/style.json?key=YOUR_MAPTILER_KEY",
//   Topographic: "https://api.maptiler.com/maps/topo/style.json?key=YOUR_MAPTILER_KEY",
};