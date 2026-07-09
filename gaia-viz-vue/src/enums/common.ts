export const BASEMAPS = {
  OSM: "OSM",
  GOOGLE_SATELLITE: "Google Satellite",
} as const;

export type BASEMAPS = (typeof BASEMAPS)[keyof typeof BASEMAPS];