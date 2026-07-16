<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import PageLayout from "@/layout/PageLayout.vue";
import DashboardControlBar from "@/components/dashboard/DashboardControlBar.vue";
import RiskMap from "@/components/dashboard/RiskMap.vue";
import RiskStatistics from "@/components/dashboard/RiskStatistics.vue";
import AboutModal from "@/components/dashboard/modals/AboutModal.vue";
import UploadModal from "@/components/dashboard/modals/UploadModal.vue";
import MetadataModal from "@/components/dashboard/modals/MetadataModal.vue";
import FloatingLogo from "@/components/FloatingLogo.vue";
import { useRiskLogic } from "@/composables/useRiskLogic";
import { useIndicatorColumns } from "@/composables/useIndicatorColumns";
import CustomDataInfo from "@/components/dashboard/modals/CustomDataInfo.vue";

const router = useRouter();

const {
  selectedCountry,
  selectedDisaster,
  disasters,
  pmtilesUrl,
  pcodeField,
  matchArray,
  isLoading,
  error,
  lastLoadedData,
  highlightedPcode,
  indicatorWeights,
  viewMode,
  showAnalysis,
  showAboutModal,
  showUploadModal,
  showCustomDataInfo,
  riskViewMode,
  riskViewLabel,
  dimensionColumns,
  uploadError,
  countries,
  selectedCountryName,
  existingPcodes,
  mergeCustomIndicators,
  keepCustomData,
  discardCustomData,
  goHome,
} = useRiskLogic();

const { customDimensionKeys } = useIndicatorColumns(
  reactive({
    data: lastLoadedData,
    selectedDisaster,
    pcodeField,
  }),
);

const mapRef = ref<InstanceType<typeof RiskMap> | null>(null);
const showMetadataModal = ref(false);

function handleGoHome() {
  goHome();
  if (mapRef.value) {
    (mapRef.value as any).resetView();
  }
}

function handleUpload(payload: Parameters<typeof mergeCustomIndicators>[0]) {
  mergeCustomIndicators(payload);
}
</script>

<template>
  <PageLayout full-height>
    <template #header-actions>
      <div class="flex items-center gap-2">
        <button
          @click="showAboutModal = true"
          class="px-5 py-2 rounded-full bg-slate-50 border border-slate-100 text-[12px] font-bold text-slate-500 hover:text-heigit-red hover:border-heigit-red transition-all cursor-pointer"
        >
          About
        </button>

        <button
          @click="router.push('/story-map/flood-exposure')"
          class="px-5 py-2 rounded-full bg-slate-50 border border-slate-100 text-[12px] font-bold text-slate-500 hover:text-heigit-red hover:border-heigit-red transition-all disabled:cursor-not-allowed disabled:opacity-50"
        >
          See Story Map
        </button>
      </div>
    </template>

    <DashboardControlBar
      v-model:selectedCountry="selectedCountry"
      v-model:selectedDisaster="selectedDisaster"
      :disasters="disasters"
      :view-mode="viewMode"
      :is-analysis-visible="showAnalysis"
      @go-home="handleGoHome"
      @toggle-analysis="showAnalysis = !showAnalysis"
    />

    <div class="flex-1 flex flex-row relative min-h-0 w-full">
      <!-- LEFT PANE: MAP -->
      <div
        class="relative h-full flex flex-col transition-[width] duration-700 ease-in-out border-r border-slate-200"
        :class="[
          viewMode === 'HOME'
            ? 'w-full'
            : showAnalysis
              ? 'w-full md:w-1/2'
              : 'w-full',
        ]"
      >
        <main
          id="main-content"
          class="flex-1 relative overflow-hidden bg-slate-50"
        >
          <RiskMap
            ref="mapRef"
            :pmtilesUrl="pmtilesUrl"
            :pcodeField="pcodeField"
            :matchArray="matchArray"
            :highlightedPcode="highlightedPcode"
            :availableCountries="countries.map((c) => c.code)"
            :risk-view-mode="riskViewMode"
            :legend-title="riskViewLabel"
            @country-click="selectedCountry = $event"
            @update:riskViewMode="riskViewMode = $event"
          />

          <!-- Loading Overlay -->
          <transition name="fade">
            <div
              v-if="isLoading"
              class="absolute inset-0 bg-white/60 backdrop-blur-sm z-40 flex items-center justify-center"
            >
              <div
                class="flex flex-col items-center gap-4 px-8 py-6 bg-white border border-slate-200 rounded-2xl shadow-2xl"
              >
                <div
                  class="w-12 h-12 border-4 border-heigit-red border-t-transparent rounded-full animate-spin"
                ></div>
                <div
                  class="text-slate-900 font-bold tracking-widest uppercase text-xs"
                >
                  Analyzing Data...
                </div>
              </div>
            </div>
          </transition>

          <!-- Error Message -->
          <transition name="slide-up">
            <div
              v-if="error"
              class="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 w-max max-w-lg"
            >
              <div
                class="bg-red-50 border border-red-200 text-red-900 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md"
              >
                <span class="text-red-600">⚠️</span>
                <span class="text-sm font-medium">{{ error }}</span>
                <button
                  @click="error = null"
                  class="ml-2 hover:text-red-600 text-red-400"
                >
                  ✕
                </button>
              </div>
            </div>
          </transition>

          <FloatingLogo />
        </main>
      </div>

      <!-- RIGHT PANE: ANALYSIS -->
      <div
        class="relative h-full flex flex-col bg-white overflow-hidden transition-[width] duration-700 ease-in-out"
        :class="[
          viewMode === 'HOME'
            ? 'w-0'
            : showAnalysis
              ? 'w-full md:w-1/2'
              : 'w-0 pointer-events-none',
        ]"
      >
        <div
          class="flex-1 flex flex-col overflow-hidden p-8 h-full min-w-[320px]"
        >
          <div class="max-w-3xl w-full mx-auto flex flex-col h-full space-y-4">
            <header class="shrink-0">
              <h2
                class="text-3xl font-extrabold text-slate-900 tracking-tight mb-2"
              >
                Analysis
              </h2>
              <div class="flex items-center gap-2">
                <span
                  class="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-bold text-heigit-red uppercase tracking-wider"
                >
                  {{
                    selectedDisaster
                      ? selectedDisaster.replace("risk_", "").toUpperCase()
                      : "NO RISK SELECTED"
                  }}
                </span>
                <span class="text-slate-500 text-sm font-medium"
                  >| {{ selectedCountryName || "Distribution" }}</span
                >
              </div>
            </header>

            <div
              class="flex-1 min-h-0 border border-slate-200 rounded-xl overflow-hidden shadow-sm"
            >
              <RiskStatistics
                v-if="lastLoadedData.length > 0 && selectedDisaster"
                :data="lastLoadedData"
                :selected-disaster="selectedDisaster"
                :selected-country="selectedCountry"
                :indicator-weights="indicatorWeights"
                :pcode-field="pcodeField"
                @update:indicatorWeights="indicatorWeights = $event"
                @region-hover="highlightedPcode = $event"
              />
              <div
                v-else
                class="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50 border-dashed border-2 border-slate-200"
              >
                <div
                  class="w-16 h-16 bg-white border border-slate-100 shadow-sm rounded-2xl flex items-center justify-center mb-4 text-2xl"
                >
                  📊
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-2 italic">
                  No Data Available
                </h3>
                <p class="text-sm text-slate-500">
                  Select a country and a risk category to view statistics.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AboutModal v-if="showAboutModal" @close="showAboutModal = false" />
    <UploadModal
      v-if="showUploadModal"
      :pcode-field="pcodeField"
      :existing-pcodes="existingPcodes"
      :hazard-prefix="dimensionColumns.hazardPrefix"
      :known-dimensions="customDimensionKeys"
      @close="
        showUploadModal = false;
        uploadError = null;
      "
      @upload="handleUpload"
    />
    <MetadataModal
      v-if="showMetadataModal"
      @toggle="showMetadataModal = false"
    />
    <CustomDataInfo
      v-if="showCustomDataInfo"
      @close="keepCustomData"
      @use-custom="keepCustomData"
      @use-default="discardCustomData"
    />
  </PageLayout>
</template>

<style>
@import "@/assets/styles/main.css";

/* Custom Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translate(-50%, 40px);
  opacity: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #0f172a;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #ca2333;
  /* HeiGIT Red */
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #a81d2a;
}
</style>
