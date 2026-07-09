<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { cn } from "@/utils/cn";
import { fetchCountries, type Country } from "@/services/dataService";

const props = defineProps<{
  selectedCountry: string;
  selectedDisaster: string;
  disasters: string[];
  viewMode: "HOME" | "DASHBOARD";
  isAnalysisVisible?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:selectedCountry", value: string): void;
  (e: "update:selectedDisaster", value: string): void;
  (e: "go-home"): void;
  (e: "toggle-analysis"): void;
}>();

const countries = ref<Country[]>([]);
const isDropdownOpen = ref(false);
const isHazardDropdownOpen = ref(false);
const isExpanded = ref(true);
const searchQuery = ref("");
const dropdownRef = ref<HTMLElement | null>(null);
const hazardDropdownRef = ref<HTMLElement | null>(null);

onMounted(async () => {
  countries.value = await fetchCountries();
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

const filteredCountries = computed(() => {
  if (!searchQuery.value) return countries.value;
  const q = searchQuery.value.toLowerCase();
  return countries.value.filter((c) => c.name.toLowerCase().includes(q));
});

const selectedCountryLabel = computed(() => {
  const c = countries.value.find((c) => c.code === props.selectedCountry);
  return c ? c.name : "Select a Country";
});

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
  if (isDropdownOpen.value) {
    isHazardDropdownOpen.value = false;
    setTimeout(() => {
      document.getElementById("country-search-input")?.focus();
    }, 50);
  }
};

const toggleHazardDropdown = () => {
  isHazardDropdownOpen.value = !isHazardDropdownOpen.value;
  if (isHazardDropdownOpen.value) {
    isDropdownOpen.value = false;
  }
};

const selectCountry = (code: string) => {
  emit("update:selectedCountry", code);
  isDropdownOpen.value = false;
  searchQuery.value = "";
};

const selectHazard = (hazard: string) => {
  emit("update:selectedDisaster", hazard);
  isHazardDropdownOpen.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as Node;
  if (dropdownRef.value && !dropdownRef.value.contains(target)) {
    isDropdownOpen.value = false;
  }
  if (hazardDropdownRef.value && !hazardDropdownRef.value.contains(target)) {
    isHazardDropdownOpen.value = false;
  }
};

function formatDisaster(col: string) {
  return col
    .replace("risk_", "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
</script>

<template>
  <div
    class="w-full relative bg-white border-b border-slate-200 shadow-sm z-[100] transition-all duration-300 shrink-0"
  >
    <button
      @click="isExpanded = !isExpanded"
      :class="
        cn(
          'absolute right-4 top-2 w-7 h-7 flex items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-400 hover:text-heigit-red hover:border-heigit-red transition-all z-10',
          isExpanded
            ? ''
            : 'top-0 w-12 border-none rounded-t-none rounded-b-md shadow-md',
        )
      "
      :title="isExpanded ? 'Collapse Controls' : 'Expand Controls'"
    >
      <span
        class="text-xs transition-transform duration-300"
        :class="isExpanded ? 'rotate-180' : 'rotate-0'"
      >
        ▼
      </span>
    </button>

    <transition name="collapse">
      <div
        v-if="isExpanded"
        class="px-6 py-3 flex flex-col md:flex-row gap-6 items-center justify-center relative"
      >
        <div class="flex flex-col md:flex-row gap-4 w-full items-end py-1">
          <div
            class="flex-1 flex flex-col md:flex-row gap-4 items-end justify-center min-w-0"
          >
            <!-- Home Button -->
            <button
              v-if="viewMode === 'DASHBOARD'"
              @click="emit('go-home')"
              class="h-[34px] w-[34px] flex-none flex items-center justify-center bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-heigit-red"
              title="Back to Home"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>

            <!-- Country Search Dropdown -->
            <div
              class="relative w-full md:max-w-72 md:flex-1 text-left"
              ref="dropdownRef"
            >
              <label
                class="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1"
                >Target Country</label
              >
              <div
                @click="toggleDropdown"
                class="w-full bg-slate-50 border border-slate-200 hover:border-heigit-red rounded-lg px-4 py-1.5 text-sm cursor-pointer flex justify-between items-center text-slate-700 shadow-sm transition-all"
              >
                <span class="truncate font-medium">{{
                  selectedCountryLabel
                }}</span>
                <span
                  class="text-slate-400 text-[10px] transform transition-transform"
                  :class="{ 'rotate-180': isDropdownOpen }"
                  >▼</span
                >
              </div>

              <div
                v-if="isDropdownOpen"
                class="absolute top-full left-0 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-2xl max-h-[400px] flex flex-col z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <div
                  class="p-3 border-b border-slate-200 sticky top-0 bg-white rounded-t-lg"
                >
                  <input
                    id="country-search-input"
                    v-model="searchQuery"
                    placeholder="Search countries..."
                    class="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-heigit-red transition-all"
                    @click.stop
                  />
                </div>
                <div class="overflow-y-auto flex-1 py-1 custom-scrollbar">
                  <div
                    v-for="c in filteredCountries"
                    :key="c.code"
                    @click="selectCountry(c.code)"
                    class="px-4 py-2.5 text-sm hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                    :class="{
                      'text-heigit-red bg-red-50 font-semibold':
                        c.code === selectedCountry,
                      'text-slate-700': c.code !== selectedCountry,
                    }"
                  >
                    {{ c.name }}
                    <span
                      v-if="c.code === selectedCountry"
                      class="text-heigit-red text-xs"
                      >●</span
                    >
                  </div>
                  <div
                    v-if="filteredCountries.length === 0"
                    class="p-4 text-slate-400 text-sm text-center italic"
                  >
                    No matching countries found
                  </div>
                </div>
              </div>
            </div>

            <!-- Hazard Select Dropdown -->
            <div
              class="relative w-full md:max-w-64 md:flex-1 text-left transition-all duration-500"
              :class="{
                'opacity-40 grayscale pointer-events-none': !selectedCountry,
                'cursor-not-allowed': !selectedCountry,
              }"
              ref="hazardDropdownRef"
            >
              <label
                class="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1"
                >Hazard</label
              >
              <div
                @click="selectedCountry && toggleHazardDropdown()"
                class="w-full bg-slate-50 border border-slate-200 hover:border-heigit-red rounded-lg px-4 py-1.5 text-sm cursor-pointer flex justify-between items-center text-slate-700 shadow-sm transition-all"
                :class="{ 'cursor-not-allowed bg-slate-100': !selectedCountry }"
              >
                <span class="truncate font-medium">{{
                  selectedDisaster
                    ? formatDisaster(selectedDisaster)
                    : "Select a Hazard"
                }}</span>
                <span
                  class="text-slate-400 text-[10px] transform transition-transform"
                  :class="{ 'rotate-180': isHazardDropdownOpen }"
                  >▼</span
                >
              </div>

              <div
                v-if="isHazardDropdownOpen"
                class="absolute top-full left-0 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <div class="py-1">
                  <div
                    v-for="d in disasters"
                    :key="d"
                    @click="selectHazard(d)"
                    class="px-4 py-2.5 text-sm hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                    :class="{
                      'text-heigit-red bg-red-50 font-semibold':
                        d === selectedDisaster,
                      'text-slate-700': d !== selectedDisaster,
                    }"
                  >
                    {{ formatDisaster(d) }}
                    <span
                      v-if="d === selectedDisaster"
                      class="text-heigit-red text-xs"
                      >●</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Analysis Toggle Button -->
          <button
            v-if="viewMode === 'DASHBOARD'"
            @click="emit('toggle-analysis')"
            class="mr-10 flex items-center justify-center w-[34px] h-[34px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors border border-slate-200 shrink-0"
            :title="isAnalysisVisible ? 'Hide Analysis' : 'Show Analysis'"
          >
            <span
              class="text-xl font-black leading-none transition-transform duration-500 pb-[2px]"
              :class="isAnalysisVisible ? '' : 'rotate-180'"
            >
              »
            </span>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #475569;
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 200px;
}
.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-bottom: 0;
  padding-top: 0;
}
</style>
