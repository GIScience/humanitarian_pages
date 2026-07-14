import { ref, watch, type ComputedRef } from "vue";
import type { DimensionGroup } from "@/composables/useIndicatorColumns";
import { generateFilename } from "@/utils/filenameGenerator";

interface IndicatorWeightsProps {
  indicatorWeights: Record<string, number>;
  selectedDisaster: string;
  selectedCountry: string;
}

interface IndicatorWeightsEmit {
  (e: "update:indicatorWeights", val: Record<string, number>): void;
}

function getRawName(col: string, category: string): string {
  if (category === "exp") {
    const parts = col.split("_");
    if (parts.length > 2) return parts.slice(2).join("_");
    return col.replace(/^exp_/, "");
  }
  return col.replace(new RegExp(`^${category}_`), "");
}

export function useIndicatorWeights(
  props: IndicatorWeightsProps,
  emit: IndicatorWeightsEmit,
  indicatorDimensionGroups: ComputedRef<DimensionGroup[]>,
) {
  const localWeights = ref<Record<string, number>>({
    ...props.indicatorWeights,
  });

  watch(
    () => props.indicatorWeights,
    (newVal) => {
      if (
        Object.keys(newVal).length === 0 &&
        Object.keys(localWeights.value).length > 0
      ) {
        localWeights.value = {};
      }
    },
    { deep: true },
  );

  function getWeight(col: string) {
    return localWeights.value[col] ?? 1.0;
  }

  function setWeight(col: string, val: number) {
    localWeights.value[col] = val;
    emit("update:indicatorWeights", { ...localWeights.value });
  }

  const disabledIndicators = ref<Set<string>>(new Set());
  const savedSliderValues = ref<Record<string, number>>({});

  function isSubIndicatorActive(col: string) {
    return !disabledIndicators.value.has(col);
  }

  function toggleSubIndicator(col: string) {
    if (disabledIndicators.value.has(col)) {
      disabledIndicators.value = new Set(
        [...disabledIndicators.value].filter((c) => c !== col),
      );
      const saved = savedSliderValues.value[col];
      if (saved !== undefined) {
        localWeights.value[col] = saved;
        delete savedSliderValues.value[col];
      } else {
        delete localWeights.value[col];
      }
    } else {
      savedSliderValues.value[col] = getWeight(col);
      localWeights.value[col] = 0;
      disabledIndicators.value = new Set([...disabledIndicators.value, col]);
    }
    emit("update:indicatorWeights", { ...localWeights.value });
  }

  function isGroupActive(columns: string[]) {
    return (
      columns.length === 0 || columns.every((c) => isSubIndicatorActive(c))
    );
  }

  function toggleGroup(columns: string[]) {
    const allActive = isGroupActive(columns);
    for (const col of columns) {
      if (allActive && isSubIndicatorActive(col)) {
        toggleSubIndicator(col);
      } else if (!allActive && !isSubIndicatorActive(col)) {
        toggleSubIndicator(col);
      }
    }
  }

  function resetDimensionWeights(cols: string[]) {
    const newWeights = { ...localWeights.value };
    cols.forEach((c) => delete newWeights[c]);
    localWeights.value = newWeights;
    const newDisabled = new Set(disabledIndicators.value);
    cols.forEach((c) => {
      newDisabled.delete(c);
      delete savedSliderValues.value[c];
    });
    disabledIndicators.value = newDisabled;
    emit("update:indicatorWeights", newWeights);
  }

  function downloadWeightsCSV() {
    let csvContent = "variable_name,category,weight,direction,activated\n";

    const processCols = (
      cols: string[],
      category: string,
      direction: number,
    ) => {
      cols.forEach((col) => {
        const rawName = getRawName(col, category);
        const weight = getWeight(col);
        const activated = isSubIndicatorActive(col) ? "TRUE" : "FALSE";
        csvContent += `${rawName},${category},${weight},${direction},${activated}\n`;
      });
    };

    indicatorDimensionGroups.value.forEach((dim) => {
      if (dim.cols.length > 0)
        processCols(dim.cols, dim.key, dim.key === "cop" ? -1 : 1);
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${generateFilename(`Weights_${props.selectedDisaster}`, props.selectedCountry, "csv")}`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function uploadWeightsCSV(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l);
      if (lines.length < 2) return;

      const headers = lines[0].split(",").map((h) => h.trim());
      const nameIdx = headers.indexOf("variable_name");
      const catIdx = headers.indexOf("category");
      const weightIdx = headers.indexOf("weight");
      const actIdx = headers.indexOf("activated");
      if (nameIdx === -1 || catIdx === -1 || weightIdx === -1) return;

      const csvData: Record<
        string,
        { category: string; weight: number; activated: boolean | null }
      > = {};
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",").map((p) => p.trim());
        if (parts.length <= Math.max(nameIdx, catIdx, weightIdx)) continue;
        const rawName = parts[nameIdx];
        const category = parts[catIdx];
        const weight = parseFloat(parts[weightIdx]);
        const activated =
          actIdx !== -1 && parts.length > actIdx
            ? parts[actIdx].toUpperCase() === "TRUE"
            : null;
        if (rawName && category && !isNaN(weight)) {
          csvData[rawName] = {
            category,
            weight: Math.min(5, Math.max(0, weight)),
            activated,
          };
        }
      }

      const newWeights = { ...localWeights.value };
      const newDisabled = new Set(disabledIndicators.value);

      const matchAndSet = (cols: string[], category: string) => {
        cols.forEach((col) => {
          const rawName = getRawName(col, category);
          const entry = csvData[rawName];
          if (!entry || entry.category !== category) return;

          if (entry.activated === false) {
            savedSliderValues.value[col] = entry.weight;
            newWeights[col] = 0;
            newDisabled.add(col);
          } else {
            newWeights[col] = entry.weight;
            newDisabled.delete(col);
            delete savedSliderValues.value[col];
          }
        });
      };

      indicatorDimensionGroups.value.forEach((dim) =>
        matchAndSet(dim.cols, dim.key),
      );

      localWeights.value = newWeights;
      disabledIndicators.value = newDisabled;
      emit("update:indicatorWeights", { ...newWeights });

      input.value = "";
    };

    reader.readAsText(input.files[0]);
  }

  return {
    getWeight,
    setWeight,
    isSubIndicatorActive,
    toggleSubIndicator,
    isGroupActive,
    toggleGroup,
    resetDimensionWeights,
    downloadWeightsCSV,
    uploadWeightsCSV,
  };
}
