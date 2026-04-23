<script setup lang="ts">
import { ref, watch, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RiskHeader from '../components/RiskHeader.vue';
import RiskMap from '../components/RiskMap.vue';
import RiskFooter from '../components/RiskFooter.vue';
import FloatingLogo from '../components/FloatingLogo.vue';
import RiskStatistics from '../components/RiskStatistics.vue';
import AboutModal from '../components/AboutModal.vue';
import { loadParquetData } from '../utils/duckdb';
import { checkFileExists, fetchCountries, type Country } from '../services/dataService';
import { calculateDynamicRisk } from '../utils/riskCalculation';
import { onMounted, computed } from 'vue';

const route = useRoute();
const router = useRouter();

const selectedCountry = ref((route.query.country as string) || '');
const selectedDisaster = ref((route.query.disaster as string) || '');

watch(
  () => route.query,
  (newQuery) => {
    const qCountry = (newQuery.country as string) || '';
    const qDisaster = (newQuery.disaster as string) || '';
    if (qCountry !== selectedCountry.value) {
      selectedCountry.value = qCountry;
    }
    if (qDisaster !== selectedDisaster.value) {
      selectedDisaster.value = qDisaster;
    }
  }
);
const disasters = ref<string[]>([]);
const pmtilesUrl = ref('');
const pcodeField = ref('');
const matchArray = ref<[string, string, number][]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const lastLoadedData = shallowRef<any[]>([]);
const lastLoadedCountry = ref('');
const highlightedPcode = ref<string | null>(null);

const indicatorWeights = ref<Record<string, number>>({});
const rawOriginalData = shallowRef<any[]>([]);

const viewMode = ref<'HOME' | 'DASHBOARD'>('HOME');
const showAnalysis = ref(true);
const showAnalysisModal = ref(false);
const showAboutModal = ref(false);
const isHeaderExpanded = ref(true);

const countries = ref<Country[]>([]);
const mapRef = ref<InstanceType<typeof RiskMap> | null>(null);

onMounted(async () => {
  countries.value = await fetchCountries();
});

const selectedCountryName = computed(() => {
  return countries.value.find(c => c.code === selectedCountry.value)?.name || '';
});

async function updateCountryData(countryCode: string) {
  if (!countryCode) {
    viewMode.value = 'HOME';
    lastLoadedCountry.value = '';
    pmtilesUrl.value = '';
    matchArray.value = [];
    lastLoadedData.value = [];
    selectedDisaster.value = '';
    showAnalysis.value = true;
    return;
  }
  
  if (countryCode === lastLoadedCountry.value) return;
  
  isLoading.value = true;
  error.value = null;
  // Start transition to dashboard mode
  viewMode.value = 'DASHBOARD';
  
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
    
    // Parse raw data cleanly so we can mutate it freely. Handled BigInts from DuckDB.
    const rawJSON = JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'bigint' ? Number(value) : value
    ));
    rawOriginalData.value = JSON.parse(JSON.stringify(rawJSON));
    
    const currentLevel = level;
    pcodeField.value = `${currentLevel}_PCODE`;
    lastLoadedData.value = rawJSON;
    lastLoadedCountry.value = countryCode;
    indicatorWeights.value = {}; // Reset weights on country load
    
    // Update disasters
    const riskCols = Object.keys(data[0] || {}).filter(c => c.startsWith("risk_"));
    disasters.value = riskCols;
    
    // Set selected disaster ONLY if not already set or not in new data
    if (!selectedDisaster.value || !riskCols.includes(selectedDisaster.value)) {
      selectedDisaster.value = riskCols[0] || '';
    }

    // Store data for rendering
    updateRiskLayer(selectedDisaster.value, data, currentLevel);
    pmtilesUrl.value = pmtUrl;
  } catch (err: any) {
    console.error("Failed to load country data:", err);
    error.value = `No Risk Assessment available for ${countryCode}`;
    pmtilesUrl.value = '';
    matchArray.value = [];
    lastLoadedData.value = [];
    viewMode.value = 'HOME';
  } finally {
    isLoading.value = false;
  }
}

function goHome() {
  selectedCountry.value = '';
  showAnalysisModal.value = false;
  if (mapRef.value) {
    (mapRef.value as any).resetView();
  }
}

function openAnalysisModal() {
  showAnalysisModal.value = true;
}

function closeAnalysisModal() {
  showAnalysisModal.value = false;
  isHeaderExpanded.value = true;
}

function handleAnalysisToggle() {
  // Mobile uses modal, desktop uses split-pane
  if (window.innerWidth < 768) {
    const opening = !showAnalysisModal.value;
    showAnalysisModal.value = !showAnalysisModal.value;
    isHeaderExpanded.value = !opening;
  } else {
    const opening = !showAnalysis.value;
    showAnalysis.value = !showAnalysis.value;
    isHeaderExpanded.value = !opening;
    // Ensure modal is closed if we're switching back to desktop view or vice versa
    showAnalysisModal.value = false;
  }
}

function updateRiskLayer(riskColumn: string, data: any[], level: string) {
  const field = `${level}_PCODE`;
  
  const values = data
    .map(d => Number(d[riskColumn]))
    .filter(v => !isNaN(v))
    .sort((a, b) => a - b);

  if (values.length === 0) {
    matchArray.value = [];
    return;
  }

  const q1 = values[Math.floor(values.length * 0.25)];
  const q2 = values[Math.floor(values.length * 0.5)];
  const q3 = values[Math.floor(values.length * 0.75)];

  const matches: [string, string, number][] = [];
  data.forEach(d => {
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

const syncRoute = () => {
  const query: Record<string, string> = {};
  if (selectedCountry.value) query.country = selectedCountry.value;
  if (selectedCountry.value && selectedDisaster.value) query.disaster = selectedDisaster.value;
  
  router.replace({ query }).catch(() => {});
};

function loadAndCalculateWithWeights(weights: Record<string, number>) {
    if (!lastLoadedData.value.length || !selectedDisaster.value) return;
    const currentLevel = pcodeField.value.split('_')[0];
    
    const rawJSON = JSON.parse(JSON.stringify(rawOriginalData.value));
    const recalculated = calculateDynamicRisk(rawJSON, weights);
    
    lastLoadedData.value = recalculated;
    updateRiskLayer(selectedDisaster.value, recalculated, currentLevel);
}

let calcTimeout: any;
watch(indicatorWeights, (newWeights) => {
    if (!lastLoadedCountry.value) return;
    clearTimeout(calcTimeout);
    calcTimeout = setTimeout(() => {
        loadAndCalculateWithWeights(newWeights);
    }, 300);
}, { deep: true });

watch(selectedCountry, (newVal) => {
  syncRoute();
  updateCountryData(newVal);
});

watch(selectedDisaster, (newVal) => {
  syncRoute();
  if (!newVal || !lastLoadedData.value.length) return;
  const level = pcodeField.value.split('_')[0];
  updateRiskLayer(newVal, lastLoadedData.value, level);
});
</script>

<template>
  <div class="h-screen w-full overflow-hidden flex flex-col relative bg-white text-slate-900">
    <!-- Header -->
    <RiskHeader 
      v-model:selectedCountry="selectedCountry"
      v-model:selectedDisaster="selectedDisaster"
      v-model:isExpanded="isHeaderExpanded"
      :disasters="disasters"
      :view-mode="viewMode"
      :is-analysis-visible="showAnalysis"
      @go-home="goHome"
      @open-about="showAboutModal = true"
      @toggle-analysis="showAnalysis = !showAnalysis"
    />

    <!-- Main Layout Container -->
    <div class="flex-1 flex flex-row relative min-h-0 w-full">
      
      <!-- LEFT PANE: MAP & CONTROLS -->
      <div 
        id="map-pane"
        class="mobile-map-pane relative h-full flex flex-col transition-all duration-[400ms] ease-in-out border-r border-slate-200"
        :class="[
          viewMode === 'HOME' ? 'w-full' : (showAnalysis ? 'w-full md:w-1/2' : 'w-full')
        ]"
      >
        <!-- Map Canvas Area (Between Header and Footer) -->
        <main id="main-content" class="flex-1 relative overflow-hidden bg-slate-50">
          <RiskMap 
            ref="mapRef"
            :pmtilesUrl="pmtilesUrl"
            :pcodeField="pcodeField"
            :matchArray="matchArray"
            :highlightedPcode="highlightedPcode"
            :availableCountries="countries.map(c => c.code)"
            :isAnalysisVisible="showAnalysisModal"
            @country-click="selectedCountry = $event"
          />

          
          <!-- Loading Overlay -->
          <transition name="fade">
            <div v-if="isLoading" class="absolute inset-0 bg-white/60 backdrop-blur-sm z-40 flex items-center justify-center">
              <div class="flex flex-col items-center gap-4 px-8 py-6 bg-white border border-slate-200 rounded-2xl shadow-2xl">
                <div class="w-12 h-12 border-4 border-heigit-red border-t-transparent rounded-full animate-spin"></div>
                <div class="text-slate-900 font-bold tracking-widest uppercase text-xs">Analyzing Data...</div>
              </div>
            </div>
          </transition>

          <!-- Error Message -->
          <transition name="slide-up">
            <div v-if="error" class="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 w-max max-w-lg">
              <div class="bg-red-50 border border-red-200 text-red-900 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md">
                <span class="text-red-600">⚠️</span>
                <span class="text-sm font-medium">{{ error }}</span>
                <button @click="error = null" class="ml-2 hover:text-red-600 text-red-400">✕</button>
              </div>
            </div>
          </transition>

          <FloatingLogo />

          <!-- Unified Floating Analysis Button -->
          <button
            v-if="viewMode === 'DASHBOARD' && matchArray && matchArray.length > 0"
            @click="handleAnalysisToggle"
            class="absolute top-2 right-2 z-40 w-11 h-11 bg-heigit-red text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-red-700 transition-all active:scale-95"
            :title="(showAnalysis || showAnalysisModal) ? 'Close Analysis' : 'Open Analysis'"
          >
            <svg v-if="showAnalysis || showAnalysisModal" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
            </svg>
          </button>
        </main>
      </div>

      <!-- RIGHT PANE: ANALYSIS PANEL (DESKTOP) -->
      <div 
        class="hidden md:flex relative h-full flex-col bg-white overflow-hidden transition-[width] duration-[400ms] ease-in-out"
        :class="[
          viewMode === 'HOME' ? 'w-0' : (showAnalysis ? 'md:w-1/2' : 'w-0 pointer-events-none')
        ]"
      >
        <div class="flex-1 flex flex-col overflow-hidden p-8 h-full min-w-[320px]">
          <div class="max-w-3xl w-full mx-auto flex flex-col h-full space-y-4">
            <header class="shrink-0">
              <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Analysis</h2>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-bold text-heigit-red uppercase tracking-wider">
                  {{ selectedDisaster ? selectedDisaster.replace('risk_', '').toUpperCase() : 'NO RISK SELECTED' }}
                </span>
                <span class="text-slate-500 text-sm font-medium">| {{ selectedCountryName || 'Distribution' }}</span>
              </div>
            </header>
            
            <div class="flex-1 min-h-0 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <RiskStatistics 
                v-if="lastLoadedData.length > 0 && selectedDisaster"
                :data="lastLoadedData" 
                :selected-disaster="selectedDisaster" 
                :indicator-weights="indicatorWeights"
                :pcode-field="pcodeField" 
                @update:indicatorWeights="indicatorWeights = $event"
                @region-hover="highlightedPcode = $event"
              />
              <div v-else class="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50 border-dashed border-2 border-slate-200">
                <div class="w-16 h-16 bg-white border border-slate-100 shadow-sm rounded-2xl flex items-center justify-center mb-4 text-2xl">📊</div>
                <h3 class="text-lg font-bold text-slate-900 mb-2 italic">No Data Available</h3>
                 <p class="text-sm text-slate-500">Select a country and a risk category to view statistics.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile Analysis Modal (Moved inside central area to be bounded by header/footer) -->
      <transition name="slide-up">
        <div 
          v-if="showAnalysisModal" 
          class="absolute inset-0 z-50 md:hidden flex flex-col bg-white"
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shrink-0">
            <div class="flex items-center gap-2">
              <button 
                @click="closeAnalysisModal"
                class="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                title="Show Map"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
                </svg>
              </button>
              <h2 class="text-lg font-extrabold text-slate-900">Analysis</h2>
            </div>
            <button 
              @click="closeAnalysisModal"
              class="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            <div class="flex items-center gap-2 mb-4">
              <span class="px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-bold text-heigit-red uppercase tracking-wider">
                {{ selectedDisaster ? selectedDisaster.replace('risk_', '').toUpperCase() : 'NO RISK' }}
              </span>
              <span class="text-slate-500 text-sm font-medium">| {{ selectedCountryName || 'Distribution' }}</span>
            </div>
            <RiskStatistics 
              v-if="lastLoadedData.length > 0 && selectedDisaster"
              :data="lastLoadedData" 
              :selected-disaster="selectedDisaster" 
              :indicator-weights="indicatorWeights"
              :pcode-field="pcodeField" 
              @update:indicatorWeights="indicatorWeights = $event"
              @region-hover="highlightedPcode = $event"
            />
            <div v-else class="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-50 border-dashed border-2 border-slate-200 rounded-xl">
              <div class="w-12 h-12 bg-white border border-slate-100 shadow-sm rounded-xl flex items-center justify-center mb-3 text-xl">📊</div>
              <h3 class="text-base font-bold text-slate-900 mb-1 italic">No Data Available</h3>
              <p class="text-sm text-slate-500">Select a country and a risk category.</p>
            </div>
          </div>
        </div>
      </transition>
    </div>
    
    <RiskFooter />
    
    <transition name="fade">
      <AboutModal v-if="showAboutModal" @close="showAboutModal = false" />
    </transition>
  </div>
</template>

<style>
@import '../assets/styles/main.css';

/* Custom Transitions */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
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
  background: #ca2333; /* HeiGIT Red */
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #a81d2a;
}

/* Mobile Responsive Styles - simplified */
@media (max-width: 768px) {
  /* Root should be full viewport height and scrollable */
  .h-screen.w-full.overflow-hidden.flex.flex-col.relative.bg-white {
    height: 100vh !important;
    height: 100dvh !important;
    overflow: hidden;
  }
  
  /* Stack main container vertically */
  .flex-1.flex.flex-row.relative.min-h-0.w-full {
    display: flex !important;
    flex-direction: column !important;
    flex: 1 !important;
    min-height: 0 !important;
    overflow: hidden;
  }
  
  /* Map pane should take all available space */
  #map-pane {
    width: 100% !important;
    flex: 1 !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    height: auto !important;
  }
  
  /* Main content (map canvas area) should fill available space */
  #map-pane > main {
    flex: 1 !important;
    min-height: 0 !important;
    height: auto !important;
  }
}

/* Mobile modal slide up transition */
.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
