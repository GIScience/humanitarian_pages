export interface DimensionColumns {
  [dimensionKey: string]: string;
}

/**
 * Short column-name prefixes the dashboard recognizes as risk dimensions (e.g. "vul_literacy_rate").
 * Add new dimensions here so upload validation, weighting, and the map's layer selector pick them
 * up automatically - the rest of the app treats this list as the source of truth.
 */
export const DimensionPrefix = {
  EXPOSURE: "exp",
  VULNERABILITY: "vul",
  COPING_CAPACITY: "cop",
} as const;

export type DimensionPrefix = (typeof DimensionPrefix)[keyof typeof DimensionPrefix];

export interface DimensionPrefixConfig {
  prefix: DimensionPrefix;
  label: string;
}

export const BASE_DIMENSION_PREFIXES: DimensionPrefixConfig[] = [
  { prefix: DimensionPrefix.EXPOSURE, label: "Exposure" },
  { prefix: DimensionPrefix.VULNERABILITY, label: "Vulnerability" },
  { prefix: DimensionPrefix.COPING_CAPACITY, label: "Coping Capacity" },
];

export const DIMENSION_PREFIX_VALUES: string[] = BASE_DIMENSION_PREFIXES.map(
  (d) => d.prefix,
);

export interface RiskDimensionColumnContext {
  disaster: string;
  dimensionColumns: DimensionColumns;
}
export interface RiskDimensionConfig {
  value: string;
  label: string;
  legendLabel: string;
  icon: string;
  resolveColumn: (ctx: RiskDimensionColumnContext) => string;
  isCustom?: boolean;
}

export const BASE_RISK_DIMENSIONS: RiskDimensionConfig[] = [
  {
    value: "total",
    label: "Total Risk",
    legendLabel: "Risk Assessment:",
    icon: "mdi-gauge",
    resolveColumn: ({ disaster }) => disaster,
  },
  {
    value: "exposure",
    label: "Exposure",
    legendLabel: "Exposure:",
    icon: "mdi-weather-hurricane",
    resolveColumn: ({ dimensionColumns }) => dimensionColumns.exp,
  },
  {
    value: "vulnerability",
    label: "Vulnerability",
    legendLabel: "Vulnerability:",
    icon: "mdi-account-group-outline",
    resolveColumn: ({ dimensionColumns }) => dimensionColumns.vul,
  },
  {
    value: "coping",
    label: "Lack of Coping Capacity",
    legendLabel: "Lack of Coping Capacity:",
    icon: "mdi-shield-check-outline",
    resolveColumn: ({ dimensionColumns }) => dimensionColumns.cop,
  },
];

// Kept for existing imports; identical to BASE_RISK_DIMENSIONS.
export const RISK_DIMENSIONS = BASE_RISK_DIMENSIONS;

export type RiskViewMode = string;

export function isRiskViewMode(
  value: unknown,
  dimensions: RiskDimensionConfig[] = RISK_DIMENSIONS,
): value is RiskViewMode {
  return typeof value === "string" && dimensions.some((d) => d.value === value);
}

export function getRiskDimension(
  value: RiskViewMode,
  dimensions: RiskDimensionConfig[] = RISK_DIMENSIONS,
) {
  return dimensions.find((d) => d.value === value) ?? dimensions[0];
}
