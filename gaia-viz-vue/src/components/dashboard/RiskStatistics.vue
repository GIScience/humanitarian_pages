<script setup lang="ts">
import { ref } from "vue";
import { useIndicatorColumns } from "@/composables/useIndicatorColumns";
import { useIndicatorWeights } from "@/composables/useIndicatorWeights";
import RankingTab from "@/components/dashboard/statistics/RankingTab.vue";
import ComponentsTab from "@/components/dashboard/statistics/ComponentsTab.vue";
import DemographicsTab from "@/components/dashboard/statistics/DemographicsTab.vue";
import IndicatorsTab from "@/components/dashboard/statistics/IndicatorsTab.vue";
import WeightsTab from "@/components/dashboard/statistics/WeightsTab.vue";
import TableTab from "@/components/dashboard/statistics/TableTab.vue";

const props = defineProps<{
  data: any[];
  selectedDisaster: string;
  selectedCountry: string;
  pcodeField: string;
  indicatorWeights: Record<string, number>;
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  (e: "region-hover", pcode: string | null): void;
  (e: "region-click", pcode: string): void;
  (e: "update:indicatorWeights", val: Record<string, number>): void;
}>();

const activeTab = ref<
  "ranking" | "components" | "demographics" | "indicators" | "weights" | "table"
>("ranking");

const {
  disasterLabel,
  formatColName,
  indicatorCols,
  indicatorDimensionGroups,
  dimensionSummaryText,
} = useIndicatorColumns(props);

const {
  getWeight,
  setWeight,
  isSubIndicatorActive,
  toggleSubIndicator,
  isGroupActive,
  toggleGroup,
  resetDimensionWeights,
  downloadWeightsCSV,
  uploadWeightsCSV,
} = useIndicatorWeights(props, emit, indicatorDimensionGroups);


</script>

<template>
  <div class="risk-statistics h-full flex flex-col bg-white">
    <!-- Tabs Header -->
    <div class="flex gap-2 p-4 border-b border-slate-200">
      <button
        v-for="tab in isMobile
          ? ['ranking', 'table', 'indicators', 'weights']
          : [
              'ranking',
              'components',
              'demographics',
              'table',
              'indicators',
              'weights',
            ]"
        :key="tab"
        @click="activeTab = tab as any"
        class="px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors"
        :class="
          activeTab === tab
            ? 'bg-heigit-red text-white'
            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
        "
      >
        {{ tab }}
      </button>
    </div>

    <!-- Content section -->
    <div
      class="flex-1 p-4 flex flex-col min-h-0"
      :class="activeTab !== 'table' ? 'overflow-y-auto custom-scrollbar' : ''"
    >
      <RankingTab
        v-if="activeTab === 'ranking'"
        :data="data"
        :selected-disaster="selectedDisaster"
        :pcode-field="pcodeField"
        @region-hover="emit('region-hover', $event)"
      />

      <ComponentsTab
        v-else-if="activeTab === 'components'"
        :data="data"
        :selected-disaster="selectedDisaster"
        :pcode-field="pcodeField"
        @region-hover="emit('region-hover', $event)"
      />

      <DemographicsTab v-else-if="activeTab === 'demographics'" :data="data" />

      <IndicatorsTab
        v-else-if="activeTab === 'indicators'"
        :dimension-groups="indicatorDimensionGroups"
        :get-weight="getWeight"
        :set-weight="setWeight"
        :is-sub-indicator-active="isSubIndicatorActive"
        :toggle-sub-indicator="toggleSubIndicator"
        :is-group-active="isGroupActive"
        :toggle-group="toggleGroup"
        :format-col-name="formatColName"
      />

      <WeightsTab
        v-else-if="activeTab === 'weights'"
        :is-mobile="isMobile"
        :dimension-groups="indicatorDimensionGroups"
        :disaster-label="disasterLabel"
        :dimension-summary-text="dimensionSummaryText"
        :get-weight="getWeight"
        :set-weight="setWeight"
        :format-col-name="formatColName"
        :reset-dimension-weights="resetDimensionWeights"
        :download-weights-c-s-v="downloadWeightsCSV"
        :upload-weights-c-s-v="uploadWeightsCSV"
      />

      <TableTab
        v-else-if="activeTab === 'table'"
        :data="data"
        :selected-disaster="selectedDisaster"
        :pcode-field="pcodeField"
        :disaster-label="disasterLabel"
        :indicator-cols="indicatorCols"
        :format-col-name="formatColName"
        @region-hover="emit('region-hover', $event)"
      />
    </div>
  </div>
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
