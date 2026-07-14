import { computed } from "vue";
import {
  getDimensionColumns,
  discoverCustomDimensionPrefixes,
} from "@/utils/riskCalculation";
import { DimensionPrefix, DIMENSION_PREFIX_VALUES } from "@/enums/dimensions";

interface IndicatorColumnsProps {
  data: any[];
  selectedDisaster: string;
  pcodeField: string;
}

export interface IndicatorSubGroup {
  key: string;
  label: string;
  columns: string[];
}

export interface DimensionGroup {
  key: string;
  label: string;
  cols: string[];
  color: string;
  borderColor: string;
  tintColor: string;
  groups: IndicatorSubGroup[];
}

const GROUP_DEFS = [
  { key: "RP10", label: "RP10" },
  { key: "RP50", label: "RP50" },
  { key: "RP100", label: "RP100" },
  { key: "RP500", label: "RP500" },
  { key: "education", label: "Education" },
  { key: "hospitals", label: "Hospitals" },
  { key: "primary_healthcare", label: "Primary Healthcare" },
  { key: "rural", label: "Rural" },
];

const DIMENSION_COLORS: Record<string, string> = {
  [DimensionPrefix.EXPOSURE]: "#ca2333",
  [DimensionPrefix.VULNERABILITY]: "#E77480",
  [DimensionPrefix.COPING_CAPACITY]: "#2C3E50",
};
const EXTRA_DIMENSION_PALETTE = [
  "#7c3aed",
  "#0891b2",
  "#b45309",
  "#15803d",
  "#be185d",
  "#4338ca",
];

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darkenHex(hex: string, amount = 0.3) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  const r = Math.round(((value >> 16) & 255) * (1 - amount));
  const g = Math.round(((value >> 8) & 255) * (1 - amount));
  const b = Math.round((value & 255) * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function categorizeColumns(cols: string[]) {
  const grouped: Record<string, string[]> = {};
  const rest: string[] = [];

  for (const col of cols) {
    const lower = col.toLowerCase();
    let matched = false;
    for (const { key } of GROUP_DEFS) {
      if (lower.includes(key)) {
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(col);
        matched = true;
        break;
      }
    }
    if (!matched) rest.push(col);
  }

  const result: { key: string; label: string; columns: string[] }[] = [];
  for (const g of GROUP_DEFS) {
    if (grouped[g.key]?.length) {
      result.push({ ...g, columns: grouped[g.key] });
    }
  }
  if (rest.length) {
    result.push({ key: "__rest__", label: "Rest", columns: rest });
  }
  return result;
}

function formatDimensionList(labels: string[]) {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * Derives the exposure/vulnerability/coping-capacity (+ custom) dimension columns for the
 * currently loaded dataset/disaster. Shared by the Indicators, Weights and Table tabs so the
 * column discovery and naming rules stay in one place.
 */
export function useIndicatorColumns(props: IndicatorColumnsProps) {
  const disasterLabel = computed(() => {
    if (!props.selectedDisaster) return "Risk";
    return props.selectedDisaster
      .replace("risk_", "")
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  });

  const componentCols = computed(() =>
    getDimensionColumns(props.data, props.selectedDisaster),
  );
  const hazardPrefix = computed(() => componentCols.value.hazardPrefix);

  const formatColName = (col: string) => {
    if (col === componentCols.value.cop && col !== "")
      return "Lack of Coping Capacity";
    if (col === componentCols.value.vul && col !== "") return "Vulnerability";
    if (col === componentCols.value.exp && col !== "")
      return `${disasterLabel.value} Exposure`;
    if (col.includes("_custom_")) {
      const parts = col.split("_custom_");
      const raw = parts[1] || col;
      return `Custom: ${raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`;
    }

    return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Extract all indicator columns dynamically for the table
  const indicatorCols = computed(() => {
    if (!props.data || props.data.length === 0) return [];

    const excluded = new Set([props.pcodeField, props.selectedDisaster]);

    const orderPriority = (k: string) => {
      if (k === componentCols.value.exp && k !== "") return 1;
      if (k === componentCols.value.vul && k !== "") return 2;
      if (k === componentCols.value.cop && k !== "") return 3;
      if (k.startsWith("exp_")) return 4;
      if (k.startsWith("vul_")) return 5;
      if (k.startsWith("cop_")) return 6;
      return 7;
    };

    return Object.keys(props.data[0])
      .filter((k) => {
        if (excluded.has(k) || k.startsWith("risk_")) return false;

        if (k === componentCols.value.exp) return true;

        // Hide sub-indicators that do not match the short selected hazard (cyc, flo, dr, etc.)
        if (k.startsWith("exp_") && !k.startsWith(`exp_${hazardPrefix.value}`)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const diff = orderPriority(a) - orderPriority(b);
        return diff !== 0 ? diff : a.localeCompare(b);
      });
  });

  const expCols = computed(() =>
    indicatorCols.value.filter(
      (c) => c !== componentCols.value.exp && c.startsWith("exp") && c !== "exp",
    ),
  );
  const vulCols = computed(() =>
    indicatorCols.value.filter(
      (c) => c !== componentCols.value.vul && c.startsWith("vul") && c !== "vul",
    ),
  );
  const copCols = computed(() =>
    indicatorCols.value.filter(
      (c) => c !== componentCols.value.cop && c.startsWith("cop") && c !== "cop",
    ),
  );

  // Custom dimensions detected beyond exp/vul/cop (e.g. "edu" from an uploaded "edu_literacy_rate" column).
  const customDimensionKeys = computed(() =>
    discoverCustomDimensionPrefixes(props.data).filter(
      (k) => !DIMENSION_PREFIX_VALUES.includes(k),
    ),
  );

  function colsForDimension(key: string) {
    const composite = componentCols.value[key];
    return indicatorCols.value.filter(
      (c) => c !== composite && c.startsWith(`${key}_`),
    );
  }

  // Every dimension shown in the "Indicators" and "Weights" tabs, so uploaded custom indicators get
  // their own weighted category alongside Exposure/Vulnerability/Coping Capacity instead of being hidden.
  const indicatorDimensionGroups = computed<DimensionGroup[]>(() => {
    const base = [
      { key: DimensionPrefix.EXPOSURE, label: "Exposure", cols: expCols.value },
      { key: DimensionPrefix.VULNERABILITY, label: "Vulnerability", cols: vulCols.value },
      { key: DimensionPrefix.COPING_CAPACITY, label: "Lack of Coping Capacity", cols: copCols.value },
    ];
    const custom = customDimensionKeys.value.map((key) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      cols: colsForDimension(key),
    }));
    return [...base, ...custom].map((dim, index) => {
      const color =
        DIMENSION_COLORS[dim.key] ??
        EXTRA_DIMENSION_PALETTE[index % EXTRA_DIMENSION_PALETTE.length];
      return {
        ...dim,
        color,
        borderColor: darkenHex(color, 0.3),
        tintColor: hexToRgba(color, 0.05),
        groups: categorizeColumns(dim.cols),
      };
    });
  });

  const dimensionSummaryText = computed(() =>
    formatDimensionList(indicatorDimensionGroups.value.map((d) => d.label)),
  );

  return {
    disasterLabel,
    componentCols,
    hazardPrefix,
    formatColName,
    indicatorCols,
    expCols,
    vulCols,
    copCols,
    customDimensionKeys,
    colsForDimension,
    indicatorDimensionGroups,
    dimensionSummaryText,
  };
}
