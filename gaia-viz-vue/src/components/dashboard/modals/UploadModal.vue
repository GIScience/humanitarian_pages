<script setup lang="ts">
import { ref, computed } from "vue";
import { loadCSVData } from "@/utils/duckdb";
import {
  sanitizeIndicatorName,
  type CustomIndicatorDimension,
} from "@/composables/useRiskLogic";
import {
  BASE_DIMENSION_PREFIXES,
  DIMENSION_PREFIX_VALUES,
} from "@/enums/dimensions";
import { HAZARDS } from "@/enums/hazards";
import { isRankingColumn } from "@/utils/riskCalculation";
import { storeToRefs } from "pinia";
import { useRiskMapStore } from "@/store/riskMapStore";
import { downloadIndicatorCSVTemplate } from "@/utils/template";

const store = useRiskMapStore();

const { selectedCountryPcodeFieldMap, selectedCountry } = storeToRefs(store);

const MATCH_THRESHOLD = 0.9;

const props = defineProps<{
  pcodeField: string;
  existingPcodes: string[];
  hazardPrefix: string;
  /** Dimension keys already known to the app (e.g. "exp", "vul", "cop", plus any previously detected custom ones). */
  knownDimensions?: string[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (
    e: "upload",
    payload: {
      pcodeColumn: string;
      rows: Record<string, any>[];
      assignments: Record<string, CustomIndicatorDimension | "skip">;
    },
  ): void;
}>();

const BASE_DIMENSION_OPTIONS = BASE_DIMENSION_PREFIXES.map(
  ({ prefix, label }) => ({
    value: prefix,
    label,
  }),
);

// Bare dimension names ("exp"/"vul"/"cop") and dimension+hazard combos ("exp_flood",
// "cop_flo", "exp_cyclone", ...) are reserved for the app's own computed composite columns
// (e.g. exp_flo is the exposure score for flood) - they are never real sub-indicators, so a
// CSV column with one of these exact names is ignored rather than offered for assignment.
// Built from the dimensions/hazards this app currently recognizes (dimensions.ts, hazards.ts).
const RESERVED_UPLOAD_COLUMN_NAMES = new Set<string>([
  ...DIMENSION_PREFIX_VALUES,
  ...DIMENSION_PREFIX_VALUES.flatMap((dim) =>
    HAZARDS.flatMap((hazard) => [
      `${dim}_${hazard.prefix}`,
      `${dim}_${hazard.keyword}`,
    ]),
  ),
]);

function isReservedColumn(column: string): boolean {
  return RESERVED_UPLOAD_COLUMN_NAMES.has(column.trim().toLowerCase());
}

const dimensionOptions = computed(() => {
  const extra = (props.knownDimensions ?? [])
    .filter(
      (d) =>
        d !== "total" && !BASE_DIMENSION_OPTIONS.some((o) => o.value === d),
    )
    .map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) }));
  return [...BASE_DIMENSION_OPTIONS, ...extra];
});

type Step = "select" | "configure";

const step = ref<Step>("select");
const selectedFile = ref<File | null>(null);
const isDragging = ref(false);
const isParsing = ref(false);
const parseError = ref<string | null>(null);

const parsedRows = ref<Record<string, any>[]>([]);
const parsedColumns = ref<string[]>([]);
const pcodeColumn = ref<string | null>(null);
const assignments = ref<Record<string, CustomIndicatorDimension | "skip">>({});

const existingPcodeSet = computed(
  () => new Set(props.existingPcodes.map(String)),
);

const matchCount = computed(() => {
  if (!pcodeColumn.value) return 0;
  return parsedRows.value.filter((r) =>
    existingPcodeSet.value.has(String(r[pcodeColumn.value!])),
  ).length;
});

const matchRate = computed(() =>
  parsedRows.value.length > 0 ? matchCount.value / parsedRows.value.length : 0,
);
const matchIsSufficient = computed(
  () => pcodeColumn.value !== null && matchRate.value >= MATCH_THRESHOLD,
);

const assignableColumns = computed(() =>
  parsedColumns.value.filter((c) => c !== pcodeColumn.value),
);

const missingRequiredDimensions = computed(() => {
  const assignedDims = new Set(
    Object.values(assignments.value).filter((v) => v !== "skip"),
  );
  return BASE_DIMENSION_OPTIONS.filter((opt) => !assignedDims.has(opt.value));
});

const hasAllRequiredDimensions = computed(
  () => missingRequiredDimensions.value.length === 0,
);

function detectPcodeColumn(columns: string[]): string | null {
  const lowerTarget = props.pcodeField.toLowerCase();
  const exact = columns.find((c) => c.toLowerCase() === lowerTarget);
  if (exact) return exact;
  const generic = columns.find((c) => c.toLowerCase() === "pcode");
  if (generic) return generic;
  return null;
}

// "Skip" is just the pre-selected default for columns whose dimension can't be inferred - it
// isn't a hard exclusion. If a column's name already carries a known dimension prefix (e.g.
// "vul_female_pop", matching the same "vul_"/"cop_"/"exp_" convention used by the sample data),
// pre-select that dimension automatically so the user doesn't have to map it by hand.
function detectDimensionForColumn(
  column: string,
): CustomIndicatorDimension | "skip" {
  const sanitized = sanitizeIndicatorName(column);
  const match = dimensionOptions.value.find((opt) => {
    const prefix = opt.value.toLowerCase();
    return sanitized === prefix || sanitized.startsWith(`${prefix}_`);
  });
  return match?.value ?? "skip";
}

async function parseFile(file: File) {
  isParsing.value = true;
  parseError.value = null;
  try {
    const rows = await loadCSVData(file);
    if (!rows.length) {
      parseError.value = "The CSV file appears to be empty.";
      return;
    }
    const columns = Object.keys(rows[0]);
    const detected = detectPcodeColumn(columns);
    if (!detected) {
      parseError.value = `No PCODE column found. Expecting a column named "${props.pcodeField}" or "PCODE".`;
      return;
    }

    const selectableColumns = columns.filter(
      (c) => !isRankingColumn(c) && !isReservedColumn(c),
    );
    const dataColumns = selectableColumns.filter((c) => c !== detected);
    if (dataColumns.length === 0) {
      parseError.value =
        "This CSV only contains the PCODE column. Please add at least one data column to upload.";
      return;
    }

    parsedRows.value = rows;
    parsedColumns.value = selectableColumns;
    pcodeColumn.value = detected;
    assignments.value = Object.fromEntries(
      selectableColumns
        .filter((c) => c !== detected)
        .map((c) => [c, detectDimensionForColumn(c)]),
    );
    step.value = "configure";
  } catch (err) {
    console.error("Failed to parse CSV", err);
    parseError.value = "Could not read this file. Make sure it is a valid CSV.";
  } finally {
    isParsing.value = false;
  }
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    selectedFile.value = file;
    parseFile(file);
  }
}

function handleFileInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    selectedFile.value = file;
    parseFile(file);
  }
}

function backToSelect() {
  step.value = "select";
  selectedFile.value = null;
  parsedRows.value = [];
  parsedColumns.value = [];
  pcodeColumn.value = null;
  assignments.value = {};
  parseError.value = null;
}

function handleUpload() {
  if (
    !pcodeColumn.value ||
    !matchIsSufficient.value ||
    !hasAllRequiredDimensions.value
  )
    return;
  emit("upload", {
    pcodeColumn: pcodeColumn.value,
    rows: parsedRows.value,
    assignments: assignments.value,
  });
  emit("close");
}

function handleDownloadTemplate() {
  downloadIndicatorCSVTemplate(
    [],
    selectedCountryPcodeFieldMap.value,
    "ADM2_PCODE",
    `${selectedCountry.value ?? "country"}_custom_Indicator_template.csv`,
  );
}

function handleClearFile() {
  backToSelect();
}
</script>

<template>
  <v-dialog
    :model-value="true"
    max-width="40rem"
    @update:model-value="$emit('close')"
  >
    <v-card rounded="xl" class="overflow-hidden">
      <v-card-title class="flex align-center justify-space-between px-6 py-4">
        <span class="text-xl font-weight-bold">Upload Custom Data</span>
        <v-btn
          icon="mdi-close"
          variant="text"
          density="comfortable"
          @click="$emit('close')"
        />
      </v-card-title>
      <v-card-text class="px-6 py-6">
        <div class="d-flex align-start mb-1">
          <v-icon size="20" color="heigit-red" class="mr-2 mt-1">
            mdi-file-table-outline
          </v-icon>
          <div>
            <div class="text-subtitle-1 font-weight-semibold mb-1">
              Use {{ selectedCountry }} CSV template
            </div>
            <div class="text-body-2 text-sm">
              Start from a template so your data is formatted correctly. It
              includes a PCODE column. You can add your own columns for custom
              dimensions.
            </div>
          </div>
        </div>

        <div class="mt-5">
          <v-btn
            color="heigit-red"
            variant="flat"
            class="text-white font-weight-semibold px-2"
            prepend-icon="mdi-download"
            @click="handleDownloadTemplate()"
          >
            Download
          </v-btn>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-text class="px-6 py-6">
        <transition v-if="step === 'select'" name="fade" mode="out-in">
          <div class="flex flex-col gap-5">
            <v-alert
              v-if="parseError"
              type="error"
              variant="tonal"
              density="compact"
              class="mt-4 text-sm p-2 rounded-xl"
            >
              {{ parseError }}
            </v-alert>
            <div
              class="upload-dropzone"
              :class="{ 'upload-dropzone--active': isDragging }"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <v-icon
                icon="mdi-tray-arrow-up"
                size="40"
                class="mb-3 text-heigit-red"
              />
              <p class="text-body-2 font-weight-medium mb-1">
                Drag and drop a CSV here, or
                <label
                  class="text-heigit-red font-weight-bold"
                  style="cursor: pointer"
                >
                  browse
                  <input
                    type="file"
                    accept=".csv"
                    class="d-none"
                    @change="handleFileInput"
                  />
                </label>
              </p>
              <p class="text-caption text-medium-emphasis">
                Must include a PCODE column matching "{{ pcodeField }}"
              </p>

              <div
                v-if="isParsing"
                class="mt-4 text-caption text-medium-emphasis"
              >
                Parsing file...
              </div>

              <div
                v-if="selectedFile && !isParsing"
                class="mt-4 d-flex align-center justify-center"
              >
                <v-chip
                  closable
                  class="p-2 space-x-2"
                  @click:close="handleClearFile()"
                >
                  <v-icon icon="mdi-file-document-outline" start />
                  {{ selectedFile.name }}
                </v-chip>
              </div>
            </div>
          </div>
        </transition>

        <div v-else>
          <v-alert
            :type="matchIsSufficient ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            <span v-if="matchIsSufficient">
              {{ matchCount }}/{{ parsedRows.length }} PCODEs matched this
              country's boundaries (using column "{{ pcodeColumn }}").
            </span>
            <span v-else>
              Only {{ matchCount }}/{{ parsedRows.length }} PCODEs matched
              (using column "{{ pcodeColumn }}"). At least
              {{ Math.round(MATCH_THRESHOLD * 100) }}% must match to continue.
            </span>
          </v-alert>

          <v-alert
            v-if="matchIsSufficient && !hasAllRequiredDimensions"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            Assign at least one column to each required dimension - missing:
            {{ missingRequiredDimensions.map((d) => d.label).join(", ") }}.
          </v-alert>

          <p class="text-caption text-medium-emphasis mb-3">
            Assign each column to a risk dimension so it can be weighted in the
            model. Columns left as "Skip" are ignored.
          </p>

          <div
            class="d-flex flex-column"
            style="gap: 12px; max-height: 20rem; overflow-y: auto"
          >
            <div
              v-for="col in assignableColumns"
              :key="col"
              class="d-flex align-center justify-space-between"
              style="gap: 12px"
            >
              <span class="text-body-2 font-weight-medium text-truncate">{{
                col
              }}</span>
              <div class="d-flex align-center" style="gap: 8px">
                <select v-model="assignments[col]" class="dimension-select">
                  <option value="skip">Skip</option>
                  <option
                    v-for="opt in dimensionOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            <div
              v-if="assignableColumns.length === 0"
              class="text-caption text-medium-emphasis text-center py-2"
            >
              No additional columns found besides the PCODE column.
            </div>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-6 py-4">
        <v-btn v-if="step === 'configure'" variant="text" @click="backToSelect"
          >Back</v-btn
        >
        <v-spacer />
        <v-btn variant="text" @click="$emit('close')">Cancel</v-btn>
        <v-btn
          v-if="step === 'configure'"
          color="primary"
          :disabled="!matchIsSufficient || !hasAllRequiredDimensions"
          @click="handleUpload"
        >
          Upload
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.upload-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2.5rem 1.5rem;
  border: 2px dashed rgb(var(--v-theme-surface-variant, 226 232 240));
  border-color: #e2e8f0;
  border-radius: 12px;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.upload-dropzone--active {
  border-color: #ca2333;
  background-color: #fdf2f3;
}

.dimension-select {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
  background: #f8fafc;
  cursor: pointer;
}
</style>
