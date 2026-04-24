import { ref, watch, shallowRef, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadParquetData } from '../utils/duckdb';
import { checkFileExists, fetchCountries, type Country } from '../services/dataService';
import { calculateDynamicRisk } from '../utils/riskCalculation';

export function useRiskLogic() {
  const route = useRoute();
  const router = useRouter();

  const selectedCountry = ref((route.query.country as string) || '');
  const selectedDisaster = ref((route.query.disaster as string) || '');
  
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

  onMounted(async () => {
    countries.value = await fetchCountries();
    if (selectedCountry.value) {
      updateCountryData(selectedCountry.value);
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
      
      const rawJSON = JSON.parse(JSON.stringify(data, (_, value) =>
          typeof value === 'bigint' ? Number(value) : value
      ));
      rawOriginalData.value = JSON.parse(JSON.stringify(rawJSON));
      
      const currentLevel = level;
      pcodeField.value = `${currentLevel}_PCODE`;
      lastLoadedData.value = rawJSON;
      lastLoadedCountry.value = countryCode;
      indicatorWeights.value = {}; 
      
      const riskCols = Object.keys(data[0] || {}).filter(c => c.startsWith("risk_"));
      disasters.value = riskCols;
      
      if (!selectedDisaster.value || !riskCols.includes(selectedDisaster.value)) {
        selectedDisaster.value = riskCols[0] || '';
      }

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

  // Watch for route query changes to keep state in sync
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

  return {
    selectedCountry,
    selectedDisaster,
    disasters,
    pmtilesUrl,
    pcodeField,
    matchArray,
    isLoading,
    error,
    lastLoadedData,
    lastLoadedCountry,
    highlightedPcode,
    indicatorWeights,
    viewMode,
    showAnalysis,
    showAboutModal,
    countries,
    selectedCountryName,
    updateCountryData,
    loadAndCalculateWithWeights
  };
}
