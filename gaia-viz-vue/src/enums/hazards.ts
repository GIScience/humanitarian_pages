/**
 * Short column-name prefixes the dashboard recognizes for hazard-specific exposure sub-indicators
 * (e.g. "exp_flo_river_depth"). Add new hazards here so upload validation and dimension discovery
 * pick them up automatically - the rest of the app treats this list as the source of truth.
 */
export const HazardPrefix = {
  FLOOD: "flo",
  CYCLONE: "cyc"
} as const;

export type HazardPrefix = (typeof HazardPrefix)[keyof typeof HazardPrefix];

export interface HazardConfig {
  prefix: HazardPrefix;
  label: string;
  keyword: string;
}

export const HAZARDS: HazardConfig[] = [
  { prefix: HazardPrefix.CYCLONE, label: "Cyclone", keyword: "cyclone" },
  { prefix: HazardPrefix.FLOOD, label: "Flood", keyword: "flood" }
];


export function resolveHazardPrefix(disasterKey: string): string {
  const lower = disasterKey.toLowerCase();
  const hazard = HAZARDS.find((h) => lower.includes(h.keyword));
  return hazard ? hazard.prefix : lower;
}
