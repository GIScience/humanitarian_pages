<script setup lang="ts">
import { ref } from "vue";
import type { DimensionGroup } from "@/composables/useIndicatorColumns";

const props = defineProps<{
  isMobile?: boolean;
  disasterLabel: string;
  dimensionSummaryText: string;
  dimensionGroups: DimensionGroup[];
  getWeight: (col: string) => number;
  setWeight: (col: string, val: number) => void;
  formatColName: (col: string) => string;
  resetDimensionWeights: (cols: string[]) => void;
  downloadWeightsCSV: () => void;
  uploadWeightsCSV: (event: Event) => void;
}>();

const uploadInput = ref<HTMLInputElement | null>(null);
</script>

<template>
  <section
    class="w-full h-full flex flex-col p-4 min-h-0 relative overflow-auto custom-scrollbar bg-slate-50/50"
  >
    <p
      class="text-xs text-slate-500 text-left leading-relaxed"
      :class="isMobile ? 'mb-4' : 'mb-8 max-w-2xl mx-auto'"
    >
      The overall risk score is calculated using
      {{ dimensionGroups.length }} dimensions:
      <strong>{{ dimensionSummaryText }}</strong
      >. Here are the underlying sub-indicators available for this region.
    </p>

    <div
      class="flex-1 flex flex-col items-center justify-start min-h-max pb-12"
    >
      <!-- Final Risk Node Row - desktop only -->
      <div
        v-if="!isMobile"
        class="relative flex items-center justify-center w-full max-w-4xl z-10"
      >
        <!-- Download/Upload Weights -->
        <div
          class="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2"
        >
          <v-btn
            @click="downloadWeightsCSV"
            variant="flat"
            color="heigit-red"
            size="small"
            prepend-icon="mdi-download"
            aria-label="download weights as CSV"
            title="Download current weights as CSV"
            class="shrink-0 text-white text-none gap-1.5 px-2 font-bold"
          >
            Download Weights
          </v-btn>

          <v-btn
            @click="uploadInput?.click()"
            variant="tonal"
            color="slate-700"
            size="small"
            prepend-icon="mdi-upload"
            title="Upload weights from a CSV file"
            class="shrink-0 text-none gap-1.5 px-2 font-bold"
          >
            Upload Weights
          </v-btn>

          <input
            ref="uploadInput"
            type="file"
            accept=".csv"
            @change="uploadWeightsCSV"
            class="hidden"
          />
        </div>

        <!-- Final Risk Node -->
        <div
          class="bg-slate-800 text-white font-black px-6 py-2.5 rounded-xl shadow-lg border-b-4 border-slate-900 text-base tracking-wide uppercase"
        >
          {{ disasterLabel }} Risk
        </div>

        <!-- Methodology Link -->
        <div class="absolute right-4 top-1/2 -translate-y-1/2">
          <a
            href="https://giscience.github.io/gis-training-resource-center/content/GIS_AA/en_qgis_risk_assessment_plugin.html#methodology"
            target="_blank"
            rel="noopener noreferrer"
            class="text-heigit-red hover:text-red-700 text-xs font-semibold underline-offset-2 hover:underline inline-flex items-center gap-1 transition-colors"
          >
            Read more about the methodology<span class="text-[10px]">↗</span>
          </a>
        </div>
      </div>

      <!-- Vertical Line from Risk - desktop only -->
      <div v-if="!isMobile" class="w-[2px] h-6 bg-slate-300"></div>

      <!-- Horizontal connecting line - desktop only -->
      <div
        v-if="!isMobile"
        class="w-2/3 max-w-full border-t-[2px] border-slate-300 relative h-6"
      >
        <div
          v-for="(dim, idx) in dimensionGroups"
          :key="dim.key"
          class="absolute top-0 w-[2px] h-6 bg-slate-300 transform -translate-x-1/2"
          :style="{
            left: `${dimensionGroups.length > 1 ? (idx / (dimensionGroups.length - 1)) * 100 : 50}%`,
          }"
        ></div>
      </div>

      <!-- N Columns/Dimensions - vertical on mobile, horizontal on desktop -->
      <div
        class="w-full max-w-4xl relative z-10"
        :class="isMobile ? 'flex flex-col gap-4 px-0' : 'grid gap-6 px-4'"
        :style="
          !isMobile
            ? {
                gridTemplateColumns: `repeat(${dimensionGroups.length}, minmax(0, 1fr))`,
              }
            : {}
        "
      >
        <div
          v-for="dim in dimensionGroups"
          :key="dim.key"
          class="flex flex-col items-center"
        >
          <div
            class="text-white font-bold px-4 py-2 rounded-lg shadow border-b-4 w-full text-center text-sm mb-2 relative z-10"
            :style="{
              backgroundColor: dim.color,
              borderColor: dim.borderColor,
            }"
          >
            <span class="flex-nowrap">
              {{ dim.label }}
            </span>
          </div>
          <button
            v-if="dim.cols.length > 0"
            @click="resetDimensionWeights(dim.cols)"
            class="mb-4 text-[10px] uppercase font-bold text-slate-500 hover:text-slate-800 transition-colors shrink-0 px-2 py-1 relative z-10 bg-white hover:bg-slate-50 border border-slate-200 rounded shadow-sm flex items-center gap-1"
          >
            <svg
              class="w-2.5 h-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              ></path>
            </svg>
            Reset Weights
          </button>
          <div class="flex flex-col gap-2 w-full relative z-10">
            <div
              v-for="col in dim.cols"
              :key="col"
              class="bg-white border border-slate-200 px-3 py-2.5 rounded shadow-sm text-xs text-slate-700 flex flex-col gap-2"
            >
              <div class="font-semibold text-center">
                {{ formatColName(col) }}
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="range"
                  class="flex-1 w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  :style="{ accentColor: dim.color }"
                  min="0"
                  max="5"
                  step="0.1"
                  :value="getWeight(col)"
                  @input="
                    (e) =>
                      setWeight(
                        col,
                        Number((e.target as HTMLInputElement).value),
                      )
                  "
                />
                <span
                  class="text-[10px] font-bold tabular-nums min-w-[20px] text-right"
                  >{{ getWeight(col).toFixed(1) }}</span
                >
              </div>
            </div>
            <div
              v-if="dim.cols.length === 0"
              class="text-xs text-slate-400 text-center italic py-2"
            >
              No sub-indicators
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #8b4c4c; /* HeiGIT Red */
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #8b4c4c; /* Darker HeiGIT Red */
}
</style>
