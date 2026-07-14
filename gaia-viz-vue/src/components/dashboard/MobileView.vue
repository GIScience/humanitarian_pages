<script setup lang="ts">
import { ref } from 'vue';
import RiskMap from '@/components/dashboard/RiskMap.vue';
import RiskStatistics from '@/components/dashboard/RiskStatistics.vue';
import AboutModal from '@/components/dashboard/modals/AboutModal.vue';
import FloatingLogo from '@/components/FloatingLogo.vue';
import { useRiskLogic } from '@/composables/useRiskLogic';

const {
  selectedCountry,
  selectedDisaster,
  disasters,
  pmtilesUrl,
  pcodeField,
  matchArray,
  isLoading,
  lastLoadedData,
  highlightedPcode,
  indicatorWeights,
  viewMode,
  showAboutModal,
  countries,
  selectedCountryName,
  riskViewMode,
  riskViewLabel
} = useRiskLogic();

const mapRef = ref<InstanceType<typeof RiskMap> | null>(null);
const isDrawerOpen = ref(false);
const isHazardDropdownOpen = ref(false);

function goHome() {
  selectedCountry.value = '';
  isDrawerOpen.value = false;
  if (mapRef.value) {
    (mapRef.value as any).resetView();
  }
}

function formatDisaster(col: string) {
  return col.replace("risk_", "").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function selectDisaster(disaster: string) {
  selectedDisaster.value = disaster;
  isHazardDropdownOpen.value = false;
}
</script>

<template>
  <div class="h-screen w-full overflow-hidden flex flex-col relative bg-white text-slate-900">
    <!-- Mobile Header -->
    <header class="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between z-50">
      <div @click="goHome" class="flex flex-col cursor-pointer">
        <h1 class="text-xl font-extrabold text-slate-900 tracking-tight leading-tight">Hazard Risk Dashboard</h1>
      </div>
      <div class="flex items-center gap-2">
        <button @click="goHome" class="text-heigit-red bg-red-50 px-3 py-1.5 rounded-full border border-red-200" title="Back to Home">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>
        <button @click="showAboutModal = true" class="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
          About
        </button>
      </div>
    </header>

    <!-- Main Map View -->
    <main class="flex-1 relative overflow-hidden bg-slate-50">
      <RiskMap 
        ref="mapRef"
        :pmtilesUrl="pmtilesUrl"
        :pcodeField="pcodeField"
        :matchArray="matchArray"
        :highlightedPcode="highlightedPcode"
        :availableCountries="countries.map(c => c.code)"
        :showZoomControls="false"
        :is-mobile="true"
        :risk-view-mode="riskViewMode"
        :legend-title="riskViewLabel"
        @country-click="selectedCountry = $event"
        @update:riskViewMode="riskViewMode = $event"
      />
      
      <!-- Selection Controls Overlay -->
      <div v-if="viewMode === 'DASHBOARD'" class="absolute top-4 left-4 right-4 flex flex-col gap-2 z-40">
        <div class="bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl shadow-lg p-3 flex flex-col gap-2">
          <div class="flex items-center justify-between">
             <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Analysis</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 overflow-hidden">
               <h2 class="text-sm font-bold text-slate-900 truncate">{{ selectedCountryName }}</h2>
               <p class="text-[10px] text-slate-500 font-medium">{{ formatDisaster(selectedDisaster) }}</p>
            </div>
            <button 
              @click="isDrawerOpen = !isDrawerOpen"
              class="bg-heigit-red text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md active:scale-95 transition-all"
            >
              {{ isDrawerOpen ? 'CLOSE DATA' : 'VIEW DATA' }}
            </button>
          </div>
          <!-- Hazard Selector (only show if multiple disasters available) -->
          <div v-if="disasters.length > 1" class="relative">
            <button 
              @click="isHazardDropdownOpen = !isHazardDropdownOpen"
              class="w-full flex items-center justify-between bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium"
            >
              <span>Select Hazard: <span class="font-bold">{{ formatDisaster(selectedDisaster) }}</span></span>
              <span class="text-slate-400 text-[10px]" :class="{'rotate-180': isHazardDropdownOpen}">▼</span>
            </button>
            <div v-if="isHazardDropdownOpen" class="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-50">
              <div 
                v-for="d in disasters" 
                :key="d"
                @click="selectDisaster(d)"
                class="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                :class="{'text-heigit-red font-bold bg-red-50': d === selectedDisaster, 'text-slate-700': d !== selectedDisaster}"
              >
                {{ formatDisaster(d) }}
                <span v-if="d === selectedDisaster" class="text-heigit-red text-[10px]">●</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Home State: Country Selector Overlay -->
      <div v-if="viewMode === 'HOME'" class="absolute top-4 left-4 right-4 z-40 bg-slate-900/10 pointer-events-none">
        <div class="w-full bg-white border border-slate-200 rounded-xl shadow-2xl p-4 pointer-events-auto flex flex-col gap-3">
          <div class="text-center">
            <h3 class="text-base font-extrabold text-slate-900">Select a country</h3>
            <p class="text-[10px] text-slate-500 mt-0.5">Choose a country to analyze hazard risks</p>
          </div>
          
          <select 
            v-model="selectedCountry" 
            class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-heigit-red/20 outline-none"
          >
            <option value="" disabled>Select Country...</option>
            <option v-for="c in countries" :key="c.code" :value="c.code">{{ c.name }}</option>
          </select>
        </div>
      </div>

      <!-- Loading Overlay -->
      <transition name="fade">
        <div v-if="isLoading" class="absolute inset-0 bg-white/80 backdrop-blur-md z-[60] flex items-center justify-center">
          <div class="flex flex-col items-center gap-4">
            <div class="w-10 h-10 border-4 border-heigit-red border-t-transparent rounded-full animate-spin"></div>
            <div class="text-[10px] text-slate-900 font-black tracking-widest uppercase">Processing...</div>
          </div>
        </div>
      </transition>

      <FloatingLogo :is-mobile="true" />
    </main>

    <!-- Bottom Sheet Drawer for Statistics -->
<transition name="drawer">
      <div v-if="isDrawerOpen" class="fixed inset-0 z-[100] flex flex-col justify-end">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="isDrawerOpen = false"></div>
        
        <!-- Drawer Content -->
        <div class="relative bg-white rounded-t-[32px] shadow-2xl flex flex-col max-h-[85vh] transition-transform duration-500">
          <!-- Handle -->
          <div class="w-full flex justify-center py-4" @click="isDrawerOpen = false">
            <div class="w-12 h-1.5 bg-slate-200 rounded-full"></div>
          </div>
          
          <div class="flex-1 overflow-y-auto px-6 pb-12 custom-scrollbar">
             <header class="mb-6">
                <h2 class="text-2xl font-black text-slate-900 tracking-tight">Analysis</h2>
                <div class="flex items-center gap-2 mt-1">
                  <span class="px-2 py-0.5 rounded bg-red-50 text-[10px] font-black text-heigit-red uppercase">
                    {{ selectedDisaster ? selectedDisaster.replace('risk_', '').toUpperCase() : '' }}
                  </span>
                  <span class="text-slate-400 text-xs">| {{ selectedCountryName }}</span>
                </div>
             </header>

             <div class="border border-slate-100 rounded-2xl overflow-hidden shadow-inner bg-slate-50">
               <RiskStatistics 
                  v-if="lastLoadedData.length > 0 && selectedDisaster"
                  :data="lastLoadedData" 
                  :selected-disaster="selectedDisaster"
                  :selected-country="selectedCountry" 
                  :indicator-weights="indicatorWeights"
                  :pcode-field="pcodeField" 
                  :is-mobile="true"
                  @update:indicatorWeights="indicatorWeights = $event"
                  @region-hover="highlightedPcode = $event"
               />
             </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <AboutModal v-if="showAboutModal" @close="showAboutModal = false" />
    </transition>
  </div>
</template>

<style scoped>
.drawer-enter-active, .drawer-leave-active {
  transition: all 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}
.drawer-enter-from, .drawer-leave-to {
  transform: translateY(100%);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}
</style>
