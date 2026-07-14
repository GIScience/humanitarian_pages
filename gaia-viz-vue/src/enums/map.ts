export const ControlsPosition = {
  TOP_RIGHT: "top-right",
  TOP_LEFT: "top-left",
} as const;

export type ControlsPosition =
  (typeof ControlsPosition)[keyof typeof ControlsPosition];


export const BASEMAPS = {
  OSM: "OSM",
  GOOGLE_SATELLITE: "Google Satellite",
} as const;

export type BASEMAPS = (typeof BASEMAPS)[keyof typeof BASEMAPS];