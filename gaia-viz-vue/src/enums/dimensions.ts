export interface DimensionColumns {
  exp: string;
  vul: string;
  cop: string;
}

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
}

export const RISK_DIMENSIONS = [
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
] as const satisfies readonly RiskDimensionConfig[];

export type RiskViewMode = (typeof RISK_DIMENSIONS)[number]["value"];

export function isRiskViewMode(value: unknown): value is RiskViewMode {
  return RISK_DIMENSIONS.some((d) => d.value === value);
}

export function getRiskDimension(value: RiskViewMode) {
  return RISK_DIMENSIONS.find((d) => d.value === value)!;
}
