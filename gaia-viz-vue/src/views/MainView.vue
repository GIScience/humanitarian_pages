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
const showAboutModal = ref(false);

const countries = ref<Country[]>([]);
const mapRef = ref<InstanceType<typeof RiskMap> | null>(null);

onMounted(async () => {
  countries.value = await fetchCountries();
  if (selectedCountry.value) {
    await updateCountryData(selectedCountry.value);
  }
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
  if (mapRef.value) {
    (mapRef.value as any).resetView();
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
    <!-- Maintenance Banner -->
    <div class="bg-amber-50 border-b border-amber-300 px-4 py-3 text-center text-sm text-amber-900 flex items-center justify-center gap-2 shrink-0">
      <span class="text-lg">⚠️</span>
      <span>
        <strong>Service Temporarily Unavailable:</strong> The dashboard is currently unable to load data due to a CORS-related issue with the data source. We are working on a fix.
      </span>
    </div>
    <!-- Main Layout Container -->
    <div class="flex-1 flex flex-row relative min-h-0 w-full">
      
      <!-- LEFT PANE: MAP & CONTROLS -->
      <div 
        class="relative h-full flex flex-col transition-[width] duration-700 ease-in-out border-r border-slate-200"
        :class="[
          viewMode === 'HOME' ? 'w-full' : (showAnalysis ? 'w-full md:w-1/2' : 'w-full')
        ]"
      >
        <!-- Header -->
        <RiskHeader 
          v-model:selectedCountry="selectedCountry"
          v-model:selectedDisaster="selectedDisaster"
          :disasters="disasters"
          :view-mode="viewMode"
          :is-analysis-visible="showAnalysis"
          @go-home="goHome"
          @open-about="showAboutModal = true"
          @toggle-analysis="showAnalysis = !showAnalysis"
        />
        
        <!-- Map Canvas -->
        <main id="main-content" class="flex-1 relative overflow-hidden bg-slate-50">
          <RiskMap 
            ref="mapRef"
            :pmtilesUrl="pmtilesUrl"
            :pcodeField="pcodeField"
            :matchArray="matchArray"
            :highlightedPcode="highlightedPcode"
            :availableCountries="countries.map(c => c.code)"
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
        </main>
      </div>

      <div 
        class="relative h-full flex flex-col bg-white overflow-hidden transition-[width] duration-700 ease-in-out"
        :class="[
          viewMode === 'HOME' ? 'w-0' : (showAnalysis ? 'w-full md:w-1/2' : 'w-0 pointer-events-none')
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
</style>
