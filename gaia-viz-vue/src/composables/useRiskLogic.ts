import { ref, watch, shallowRef, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { loadParquetData } from "../utils/duckdb";
import {
  checkFileExists,
  fetchCountries,
  type Country,
} from "../services/dataService";
import {
  calculateDynamicRisk,
  getDimensionColumns,
} from "../utils/riskCalculation";
import {
  isRiskViewMode,
  getRiskDimension,
  type RiskViewMode,
} from "../enums/dimensions";

export type { RiskViewMode };

function parseRiskViewMode(value: unknown): RiskViewMode | null {
  return isRiskViewMode(value) ? value : null;
}

export type CustomIndicatorDimension = "exp" | "vul" | "cop";

export interface CustomUploadPayload {
  pcodeColumn: string;
  rows: Record<string, any>[];
  assignments: Record<string, CustomIndicatorDimension | "skip">;
}

const CUSTOM_UPLOAD_MATCH_THRESHOLD = 0.9;
const customUploadStorageKey = (countryCode: string) =>
  `gaia-custom-upload:${countryCode}`;

function sanitizeIndicatorName(name: string) {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "indicator";
}

export function useRiskLogic() {
  const route = useRoute();
  const router = useRouter();

  const selectedCountry = ref((route.query.country as string) || "");
  const selectedDisaster = ref((route.query.disaster as string) || "");

  const disasters = ref<string[]>([]);
  const pmtilesUrl = ref("");
  const pcodeField = ref("");
  const matchArray = ref<[string, string, number][]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastLoadedData = shallowRef<any[]>([]);
  const lastLoadedCountry = ref("");
  const highlightedPcode = ref<string | null>(null);

  const indicatorWeights = ref<Record<string, number>>({});
  const rawOriginalData = shallowRef<any[]>([]);

  const viewMode = ref<"HOME" | "DASHBOARD">("HOME");
  const showAnalysis = ref(false);
  const showAboutModal = ref(false);
  const showUploadModal = ref(false);
  const riskViewMode = ref<RiskViewMode>(
    parseRiskViewMode(route.query.indicator) ?? "total",
  );
  const uploadError = ref<string | null>(null);

  const countries = ref<Country[]>([]);

  onMounted(async () => {
    countries.value = await fetchCountries();
    if (selectedCountry.value) {
      updateCountryData(selectedCountry.value);
    }
  });

  const selectedCountryName = computed(() => {
    return (
      countries.value.find((c) => c.code === selectedCountry.value)?.name || ""
    );
  });

  const dimensionColumns = computed(() =>
    getDimensionColumns(lastLoadedData.value, selectedDisaster.value),
  );

  const activeValueColumn = computed(() =>
    getRiskDimension(riskViewMode.value).resolveColumn({
      disaster: selectedDisaster.value,
      dimensionColumns: dimensionColumns.value,
    }),
  );

  const riskViewLabel = computed(
    () => getRiskDimension(riskViewMode.value).legendLabel,
  );

  function updateRiskLayer(riskColumn: string, data: any[], level: string) {
    const field = `${level}_PCODE`;

    const values = data
      .map((d) => Number(d[riskColumn]))
      .filter((v) => !isNaN(v))
      .sort((a, b) => a - b);

    if (values.length === 0) {
      matchArray.value = [];
      return;
    }

    const q1 = values[Math.floor(values.length * 0.25)];
    const q2 = values[Math.floor(values.length * 0.5)];
    const q3 = values[Math.floor(values.length * 0.75)];

    const matches: [string, string, number][] = [];
    data.forEach((d) => {
      const val = Number(d[riskColumn]);
      if (isNaN(val)) return;
      let color = "#FFFFFF";
      if (val > q3) color = "#8B4C4C";
      else if (val > q2) color = "#F28C82";
      else if (val > q1) color = "#F9D6C1";
      matches.push([d[field], color, val]);
    });

    matchArray.value = matches;
  }

  function refreshMapLayer() {
    if (
      !lastLoadedData.value.length ||
      !pcodeField.value ||
      !activeValueColumn.value
    ) {
      matchArray.value = [];
      return;
    }
    const level = pcodeField.value.split("_")[0];
    updateRiskLayer(activeValueColumn.value, lastLoadedData.value, level);
  }

  async function updateCountryData(countryCode: string) {
    if (!countryCode) {
      viewMode.value = "HOME";
      lastLoadedCountry.value = "";
      pmtilesUrl.value = "";
      matchArray.value = [];
      lastLoadedData.value = [];
      selectedDisaster.value = "";
      showAnalysis.value = true;
      return;
    }

    if (countryCode === lastLoadedCountry.value) return;

    const isSwitchingCountry = !!lastLoadedCountry.value;

    isLoading.value = true;
    error.value = null;
    viewMode.value = "DASHBOARD";

    try {
      const folder = countryCode.toLowerCase();
      let level = "ADM2";
      let pmtUrl = `https://hot.storage.heigit.org/heigit-hdx-public/risk_assessment_inputs/${folder}/${countryCode}_ADM2.pmtiles`;
      let parquetUrl = `https://hot.storage.heigit.org/heigit-hdx-public/risk_assessment_inputs/${folder}/${countryCode}_ADM2_risk.parquet`;

      const exists = await checkFileExists(pmtUrl);

      if (!exists) {
        level = "ADM1";
        pmtUrl = `https://hot.storage.heigit.org/heigit-hdx-public/risk_assessment_inputs/${folder}/${countryCode}_ADM1.pmtiles`;
        parquetUrl = `https://hot.storage.heigit.org/heigit-hdx-public/risk_assessment_inputs/${folder}/${countryCode}_ADM1_risk.parquet`;
      }

      const data = await loadParquetData(parquetUrl);


      const rawJSON = JSON.parse(
        JSON.stringify(data, (_, value) =>
          typeof value === "bigint" ? Number(value) : value,
        ),
      );
      
      console.log("Raw JSON data loaded:", rawJSON);
      
      rawOriginalData.value = JSON.parse(JSON.stringify(rawJSON));

      console.log(rawOriginalData.value);

      const currentLevel = level;
      pcodeField.value = `${currentLevel}_PCODE`;
      lastLoadedData.value = rawJSON;
      lastLoadedCountry.value = countryCode;
      indicatorWeights.value = {};
      if (isSwitchingCountry) {
        riskViewMode.value = "total";
      }

      const riskCols = Object.keys(data[0] || {}).filter((c) =>
        c.startsWith("risk_"),
      );
      disasters.value = riskCols;

      if (
        !selectedDisaster.value ||
        !riskCols.includes(selectedDisaster.value)
      ) {
        selectedDisaster.value = riskCols[0] || "";
      }

      refreshMapLayer();
      pmtilesUrl.value = pmtUrl;

      reapplySavedCustomUpload(countryCode);
    } catch (err: any) {
      console.error("Failed to load country data:", err);
      error.value = `No Risk Assessment available for ${countryCode}`;
      pmtilesUrl.value = "";
      matchArray.value = [];
      lastLoadedData.value = [];
      viewMode.value = "HOME";
    } finally {
      isLoading.value = false;
    }
  }

  function goHome() {
    selectedCountry.value = "";
  }

  const syncRoute = () => {
    const query: Record<string, string> = {};
    if (selectedCountry.value) query.country = selectedCountry.value;
    if (selectedCountry.value && selectedDisaster.value)
      query.disaster = selectedDisaster.value;
    if(selectedCountry.value && selectedDisaster.value && riskViewMode.value) 
      query.indicator = riskViewMode.value;
    router.replace({ query }).catch(() => {});
  };

  function loadAndCalculateWithWeights(weights: Record<string, number>) {
    if (!lastLoadedData.value.length || !selectedDisaster.value) return;

    const rawJSON = JSON.parse(JSON.stringify(rawOriginalData.value));
    const recalculated = calculateDynamicRisk(rawJSON, weights);

    lastLoadedData.value = recalculated;
    refreshMapLayer();
  }

  // --- Custom Data Upload ---

  function buildCustomColumnName(
    rawColumn: string,
    dimension: CustomIndicatorDimension,
    hazardPrefix: string,
    usedNames: Set<string>,
  ) {
    const base = sanitizeIndicatorName(rawColumn);
    const prefix =
      dimension === "vul"
        ? "vul_custom_"
        : dimension === "cop"
          ? "cop_custom_"
          : `exp_${hazardPrefix}_custom_`;

    let candidate = `${prefix}${base}`;
    let suffix = 1;
    while (usedNames.has(candidate)) {
      candidate = `${prefix}${base}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(candidate);
    return candidate;
  }

  function mergeCustomIndicators(
    payload: CustomUploadPayload,
    options: { persist?: boolean } = {},
  ): { success: boolean; error?: string } {
    uploadError.value = null;

    if (!lastLoadedData.value.length || !pcodeField.value) {
      const message = "Select a country before uploading custom data.";
      uploadError.value = message;
      return { success: false, error: message };
    }

    const existingPcodes = new Set(
      lastLoadedData.value.map((d) => String(d[pcodeField.value])),
    );
    const uploadedRowsByPcode = new Map<string, Record<string, any>>();
    let matchedCount = 0;

    for (const row of payload.rows) {
      const pcode = String(row[payload.pcodeColumn]);
      if (existingPcodes.has(pcode)) {
        matchedCount += 1;
        uploadedRowsByPcode.set(pcode, row);
      }
    }

    const matchRate =
      payload.rows.length > 0 ? matchedCount / payload.rows.length : 0;
    if (matchRate < CUSTOM_UPLOAD_MATCH_THRESHOLD) {
      const message = `Only ${matchedCount}/${payload.rows.length} PCODEs matched this dataset (need at least ${Math.round(CUSTOM_UPLOAD_MATCH_THRESHOLD * 100)}%).`;
      uploadError.value = message;
      return { success: false, error: message };
    }

    const { hazardPrefix } = getDimensionColumns(
      lastLoadedData.value,
      selectedDisaster.value,
    );
    const usedNames = new Set(Object.keys(rawOriginalData.value[0] || {}));
    const columnAssignments = Object.entries(payload.assignments).filter(
      ([, dim]) => dim !== "skip",
    ) as [string, CustomIndicatorDimension][];

    if (columnAssignments.length === 0) {
      const message =
        "Assign at least one column to a risk dimension before uploading.";
      uploadError.value = message;
      return { success: false, error: message };
    }

    const columnNameMap = new Map<string, string>();
    for (const [rawColumn, dimension] of columnAssignments) {
      columnNameMap.set(
        rawColumn,
        buildCustomColumnName(rawColumn, dimension, hazardPrefix, usedNames),
      );
    }

    const mergedRawData = JSON.parse(JSON.stringify(rawOriginalData.value));
    for (const row of mergedRawData) {
      const uploadedRow = uploadedRowsByPcode.get(
        String(row[pcodeField.value]),
      );
      for (const [rawColumn, newColumn] of columnNameMap.entries()) {
        row[newColumn] = uploadedRow ? Number(uploadedRow[rawColumn]) : NaN;
      }
    }
    rawOriginalData.value = mergedRawData;

    const newWeights = { ...indicatorWeights.value };
    for (const newColumn of columnNameMap.values()) {
      newWeights[newColumn] = 1.0;
    }
    indicatorWeights.value = newWeights;
    loadAndCalculateWithWeights(newWeights);

    if (options.persist !== false && lastLoadedCountry.value) {
      try {
        localStorage.setItem(
          customUploadStorageKey(lastLoadedCountry.value),
          JSON.stringify(payload),
        );
      } catch (err) {
        console.warn("Could not persist custom upload to localStorage", err);
      }
    }

    return { success: true };
  }

  function reapplySavedCustomUpload(countryCode: string) {
    try {
      const saved = localStorage.getItem(customUploadStorageKey(countryCode));
      if (!saved) return;
      const payload = JSON.parse(saved) as CustomUploadPayload;
      mergeCustomIndicators(payload, { persist: false });
    } catch (err) {
      console.warn("Could not reapply saved custom upload", err);
    }
  }

  let calcTimeout: any;
  watch(
    indicatorWeights,
    (newWeights) => {
      if (!lastLoadedCountry.value) return;
      clearTimeout(calcTimeout);
      calcTimeout = setTimeout(() => {
        loadAndCalculateWithWeights(newWeights);
      }, 300);
    },
    { deep: true },
  );

  watch(selectedCountry, (newVal) => {
    syncRoute();
    updateCountryData(newVal);
  });

  watch(selectedDisaster, (newVal) => {
    syncRoute();
    if (!newVal || !lastLoadedData.value.length) return;
    refreshMapLayer();
  });

  watch(riskViewMode, () => {
    syncRoute();
    refreshMapLayer();
  });

  // Watch for route query changes to keep state in sync
  watch(
    () => route.query,
    (newQuery) => {
      const qCountry = (newQuery.country as string) || "";
      const qDisaster = (newQuery.disaster as string) || "";
      const qIndicator = parseRiskViewMode(newQuery.indicator);
      if (qCountry !== selectedCountry.value) {
        selectedCountry.value = qCountry;
      }
      if (qDisaster !== selectedDisaster.value) {
        selectedDisaster.value = qDisaster;
      }
      if (qIndicator && qIndicator !== riskViewMode.value) {
        riskViewMode.value = qIndicator;
      }
    },
  );

  return {
    // State
    selectedCountry,
    selectedDisaster,
    disasters,
    pmtilesUrl,
    pcodeField,
    matchArray,
    isLoading,
    error,
    lastLoadedData,
    rawOriginalData,
    lastLoadedCountry,
    highlightedPcode,
    indicatorWeights,
    viewMode,
    showAnalysis,
    showAboutModal,
    showUploadModal,
    riskViewMode,
    uploadError,
    countries,

    // Getters
    riskViewLabel,
    dimensionColumns,
    selectedCountryName,

    // Actions
    updateCountryData,
    updateRiskLayer,
    loadAndCalculateWithWeights,
    mergeCustomIndicators,
    goHome,
  };
}
