<script setup lang="ts">
import type { DimensionGroup } from "@/composables/useIndicatorColumns";
import { useRiskMapStore } from "@/store/riskMapStore";

const riskMapStore = useRiskMapStore();

defineProps<{
  dimensionGroups: DimensionGroup[];
  getWeight: (col: string) => number;
  setWeight: (col: string, val: number) => void;
  isSubIndicatorActive: (col: string) => boolean;
  toggleSubIndicator: (col: string) => void;
  isGroupActive: (columns: string[]) => boolean;
  toggleGroup: (columns: string[]) => void;
  formatColName: (col: string) => string;
}>();
</script>

<template>
  <section
    class="w-full h-full flex flex-col p-4 min-h-0 overflow-y-auto custom-scrollbar"
  >
    <div
      class="flex flex-wrap lg:flex-nowrap items-start justify-between gap-3 mb-4"
    >
      <p class="text-xs text-slate-500 leading-relaxed">
        Toggle groups or individual indicators on/off. Disabled indicators are
        excluded from the risk calculation.
      </p>
      <v-btn
        @click="riskMapStore.setShowUploadModal(true)"
        variant="tonal"
        color="slate-700"
        size="small"
        aria-label="upload custom data"
        prepend-icon="mdi-upload"
        title="Upload a CSV of custom indicators for this country"
        class="shrink-0 text-none gap-1.5 px-2 font-weight-bold"
      >
        Upload Custom Data
      </v-btn>
    </div>
    <div class="flex flex-col gap-4">
      <div
        v-for="dim in dimensionGroups"
        :key="dim.key"
        class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-slate-100"
          :style="{ backgroundColor: dim.tintColor }"
        >
          <span class="text-sm font-bold text-slate-800">{{ dim.label }}</span>
          <span class="text-[10px] text-slate-400 font-medium"
            >{{ dim.cols.filter((c) => isSubIndicatorActive(c)).length }}/{{
              dim.cols.length
            }}
            active</span
          >
        </div>
        <div class="p-2 flex flex-col gap-3">
          <div
            v-for="group in dim.groups"
            :key="group.key"
            class="flex flex-col gap-0.5"
          >
            <div
              class="flex items-center gap-1.5 px-2 py-1 border-b border-slate-100"
              :class="
                group.key === '__rest__'
                  ? 'border-t border-slate-100 mt-1 pt-2'
                  : ''
              "
            >
              <button
                @click="toggleGroup(group.columns)"
                class="relative inline-flex items-center cursor-pointer flex-shrink-0 w-6 h-3.5 rounded-full transition-colors duration-200"
                :class="{ 'bg-slate-300': !isGroupActive(group.columns) }"
                :style="
                  isGroupActive(group.columns)
                    ? { backgroundColor: dim.color }
                    : {}
                "
                role="switch"
              >
                <span
                  class="inline-block w-2 h-2 bg-white rounded-full shadow-sm transform transition-transform duration-200"
                  :class="
                    isGroupActive(group.columns)
                      ? 'translate-x-[14px]'
                      : 'translate-x-[2px]'
                  "
                ></span>
              </button>
              <span
                class="text-[10px] font-bold uppercase tracking-wider text-slate-500"
                >{{ group.label }}</span
              >
              <span class="text-[9px] text-slate-400 font-medium ml-auto"
                >{{
                  group.columns.filter((c) => isSubIndicatorActive(c)).length
                }}/{{ group.columns.length }}</span
              >
            </div>
            <div
              v-for="col in group.columns"
              :key="col"
              class="px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div class="flex items-center gap-2">
                <button
                  @click="toggleSubIndicator(col)"
                  class="relative inline-flex items-center cursor-pointer flex-shrink-0 w-7 h-4 rounded-full transition-colors duration-200"
                  :class="{ 'bg-slate-300': !isSubIndicatorActive(col) }"
                  :style="
                    isSubIndicatorActive(col)
                      ? { backgroundColor: dim.color }
                      : {}
                  "
                  role="switch"
                >
                  <span
                    class="inline-block w-2.5 h-2.5 bg-white rounded-full shadow-sm transform transition-transform duration-200"
                    :class="
                      isSubIndicatorActive(col)
                        ? 'translate-x-[16px]'
                        : 'translate-x-[2px]'
                    "
                  ></span>
                </button>
                <span
                  class="text-xs flex-1 min-w-0 truncate"
                  :class="
                    isSubIndicatorActive(col)
                      ? 'text-slate-700 font-medium'
                      : 'text-slate-400'
                  "
                  >{{ formatColName(col) }}</span
                >
                <span
                  class="text-[10px] font-bold tabular-nums min-w-[20px] text-right"
                  :class="{ 'text-slate-300': !isSubIndicatorActive(col) }"
                  >{{ getWeight(col).toFixed(1) }}</span
                >
                <input
                  type="range"
                  class="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
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
                  :disabled="!isSubIndicatorActive(col)"
                />
              </div>
            </div>
          </div>
          <div
            v-if="dim.cols.length === 0"
            class="text-xs text-slate-400 italic text-center py-2"
          >
            No {{ dim.label.toLowerCase() }} sub-indicators
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
