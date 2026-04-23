<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import Plotly from 'plotly.js-dist-min';

const props = defineProps<{
  data: any[];
  selectedDisaster: string;
  pcodeField: string;
  indicatorWeights: Record<string, number>;
}>();

const emit = defineEmits<{
  (e: 'region-hover', pcode: string | null): void;
  (e: 'region-click', pcode: string): void;
  (e: 'update:indicatorWeights', val: Record<string, number>): void;
}>();

const localWeights = ref<Record<string, number>>({...props.indicatorWeights});

watch(() => props.indicatorWeights, (newVal) => {
    if (Object.keys(newVal).length === 0 && Object.keys(localWeights.value).length > 0) {
        localWeights.value = {};
    }
}, { deep: true });

function getWeight(col: string) {
    return localWeights.value[col] ?? 1.0;
}

function setWeight(col: string, val: number) {
    localWeights.value[col] = val;
    emit('update:indicatorWeights', { ...localWeights.value });
}

function resetDimensionWeights(cols: string[]) {
    const newWeights = { ...localWeights.value };
    cols.forEach(c => delete newWeights[c]);
    localWeights.value = newWeights;
    emit('update:indicatorWeights', newWeights);
}

function downloadWeightsCSV() {
    let csvContent = "variable_name,category,weight,direction\n";

    const processCols = (cols: string[], category: string, direction: number) => {
        cols.forEach(col => {
            let rawName = col;
            if (category === 'exp') {
                 const parts = col.split('_');
                 if (parts.length > 2) {
                     rawName = parts.slice(2).join('_');
                 } else {
                     rawName = col.replace(/^exp_/, '');
                 }
            } else if (category === 'vul') {
                 rawName = col.replace(/^vul_/, '');
            } else if (category === 'cop') {
                 rawName = col.replace(/^cop_/, '');
            }
            const weight = getWeight(col);
            csvContent += `${rawName},${category},${weight},${direction}\n`;
        });
    };

    if (expCols.value.length > 0) processCols(expCols.value, 'exp', 1);
    if (vulCols.value.length > 0) processCols(vulCols.value, 'vul', 1);
    if (copCols.value.length > 0) processCols(copCols.value, 'cop', -1);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `weights_${props.selectedDisaster}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

const activeTab = ref<'ranking' | 'weights' | 'table'>('ranking');
const sortKey = ref<string>('');
const sortOrder = ref<'asc' | 'desc'>('desc');
const currentPage = ref(1);
const itemsPerPage = 50;

// Format disaster name
const disasterLabel = computed(() => {
  if (!props.selectedDisaster) return 'Risk';
  return props.selectedDisaster.replace('risk_', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
});

const disasterSuffix = computed(() => {
    if (!props.selectedDisaster) return '';
    return props.selectedDisaster.replace('risk_', '');
});

const hazardPrefix = computed(() => {
    const d = disasterSuffix.value.toLowerCase();
    if (d.includes('cyclone')) return 'cyc';
    if (d.includes('flood')) return 'flo';
    if (d.includes('drought')) return 'dr';
    if (d.includes('earthquake')) return 'eq';
    if (d.includes('tsunami')) return 'ts';
    return d;
});

const formatColName = (col: string) => {
    if (col === componentCols.value.cop && col !== '') return 'Lack of Coping Capacity';
    if (col === componentCols.value.vul && col !== '') return 'Vulnerability';
    if (col === componentCols.value.exp && col !== '') return `${disasterLabel.value} Exposure`;
    
    return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

// Dynamic component columns based on what's available in the dataset
const componentCols = computed(() => {
    if (!props.data || props.data.length === 0) return { exp: '', sus: '', vul: '', cop: '' };
    const cols = Object.keys(props.data[0]);
    
    // Base components precisely fetched
    const exp = cols.find(c => c === `exp_${disasterSuffix.value}`) || cols.find(c => c === 'exp') || '';
    const vul = cols.find(c => c === 'vul') || '';
    const cop = cols.find(c => c === 'cop') || '';
    
    return { exp, vul, cop };
});

// Extract all indicator columns dynamically for the table
const indicatorCols = computed(() => {
    if (!props.data || props.data.length === 0) return [];
    
    const excluded = new Set([props.pcodeField, props.selectedDisaster]);
    
    const orderPriority = (k: string) => {
       if (k === componentCols.value.exp && k !== '') return 1;
       if (k === componentCols.value.vul && k !== '') return 2;
       if (k === componentCols.value.cop && k !== '') return 3;
       if (k.startsWith('exp_')) return 4;
       if (k.startsWith('vul_')) return 5;
       if (k.startsWith('cop_')) return 6;
       return 7;
    };
    
    return Object.keys(props.data[0]).filter(k => {
        if (excluded.has(k) || k.startsWith('risk_')) return false;
        
        if (k === componentCols.value.exp) return true;
        
        // Hide sub-indicators that do not match the short selected hazard (cyc, flo, dr, etc.)
        if (k.startsWith('exp_') && !k.startsWith(`exp_${hazardPrefix.value}`)) {
            return false;
        }
        return true;
    }).sort((a, b) => {
        const diff = orderPriority(a) - orderPriority(b);
        return diff !== 0 ? diff : a.localeCompare(b);
    });
});

const expCols = computed(() => indicatorCols.value.filter(c => c !== componentCols.value.exp && c.startsWith('exp') && c !== 'exp'));
const vulCols = computed(() => indicatorCols.value.filter(c => c !== componentCols.value.vul && c.startsWith('vul') && c !== 'vul'));
const copCols = computed(() => indicatorCols.value.filter(c => c !== componentCols.value.cop && c.startsWith('cop') && c !== 'cop'));

const sortedData = computed(() => {
    if (!props.data || props.data.length === 0) return [];
    
    const key = sortKey.value || props.selectedDisaster;
    
    return [...props.data].sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        
        const numA = Number(valA);
        const numB = Number(valB);
        
        if (valA !== null && valA !== undefined && valB !== null && valB !== undefined && !isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
            if (numA < numB) return sortOrder.value === 'asc' ? -1 : 1;
            if (numA > numB) return sortOrder.value === 'asc' ? 1 : -1;
            return 0;
        } else {
            const strA = String(valA || '');
            const strB = String(valB || '');
            if (strA < strB) return sortOrder.value === 'asc' ? -1 : 1;
            if (strA > strB) return sortOrder.value === 'asc' ? 1 : -1;
            return 0;
        }
    });
});

const totalPages = computed(() => {
    return Math.max(1, Math.ceil(sortedData.value.length / itemsPerPage));
});

const paginatedData = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage;
    return sortedData.value.slice(start, start + itemsPerPage);
});

watch([sortKey, sortOrder, () => props.data], () => {
    currentPage.value = 1;
}, { deep: true });

const toggleSort = (key: string) => {
    if (sortKey.value === key) {
        sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortOrder.value = 'desc';
    }
};

const rankingChartRef = ref<HTMLElement | null>(null);
let chartObserver: ResizeObserver | null = null;

const renderRanking = async () => {
    await nextTick();
    const el = rankingChartRef.value;
    if (!el || !props.data.length || !props.selectedDisaster) return;

    // Get top 15 highest risk
    const topData = [...props.data]
        .filter(d => !isNaN(Number(d[props.selectedDisaster])))
        .sort((a, b) => Number(b[props.selectedDisaster]) - Number(a[props.selectedDisaster]))
        .slice(0, 15)
        .reverse();

    const yValues = topData.map(d => d[props.pcodeField]);
    const xValues = topData.map(d => Number(d[props.selectedDisaster]));

    const trace = {
        x: xValues,
        y: yValues,
        type: 'bar',
        orientation: 'h',
        marker: {
            color: xValues,
            colorscale: [
                [0, '#F9D6C1'],
                [0.5, '#F28C82'],
                [1, '#8B4C4C']
            ]
        },
        text: xValues.map(v => v.toFixed(3)),
        textposition: 'auto',
        hoverinfo: 'y+text'
    };

    const layout = {
        font: { family: 'inherit', color: '#475569' },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { 
            title: 'Risk Score',
            gridcolor: '#e2e8f0',
            zerolinecolor: '#e2e8f0',
            automargin: true
        },
        yaxis: { 
            automargin: true,
            tickfont: { size: 10, color: '#475569' }
        },
        margin: { t: 10, r: 10, b: 10, l: 10 },
    };

    try {
        const el = rankingChartRef.value;
        if (!el) return;
        await Plotly.newPlot(el, [trace] as any, layout as any, { responsive: true, displayModeBar: false });
        (el as any).on('plotly_hover', (data: any) => {
            if (data.points && data.points.length > 0) {
                emit('region-hover', data.points[0].y);
            }
        });
        (el as any).on('plotly_unhover', () => emit('region-hover', null));
    } catch (e) {
        console.error("Plotly Ranking Error:", e);
    }
};

const setupObserver = () => {
    if (chartObserver) chartObserver.disconnect();
    
    const el = rankingChartRef.value;
    if (!el) return;
    
    chartObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
            if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                renderRanking();
            }
        }
    });
    chartObserver.observe(el);
};

watch(rankingChartRef, (newVal) => {
    if (newVal) {
        setupObserver();
        renderRanking();
    }
});

const updateActiveChart = () => {
    if (activeTab.value === 'ranking') {
        setupObserver();
    }
};

onMounted(() => {
    updateActiveChart();
});

watch([() => props.data, () => props.selectedDisaster], () => {
    updateActiveChart();
}, { deep: true });

watch(activeTab, () => {
    updateActiveChart();
});

</script>

<template>
  <div class="risk-statistics h-full flex flex-col bg-white">
    <!-- Tabs Header -->
    <div class="flex gap-2 p-4 border-b border-slate-200">
        <button 
            v-for="tab in ['ranking', 'table', 'weights']" 
            :key="tab"
            @click="activeTab = tab as any"
            class="px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors"
            :class="activeTab === tab ? 'bg-heigit-red text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'"
        >
            {{ tab }}
        </button>
    </div>

    <!-- Content Area -->
    <div class="flex-1 p-4 flex flex-col min-h-0" :class="activeTab !== 'table' ? 'overflow-y-auto custom-scrollbar' : ''">

        <!-- Ranking -->
        <div v-if="activeTab === 'ranking'" class="h-full min-h-[400px] flex flex-col">
            <h3 class="text-lg font-extrabold text-slate-900 mb-2 mt-2 px-2 tracking-tight">Top 15 Regions</h3>
            <div ref="rankingChartRef" id="ranking-chart" class="w-full flex-1"></div>
        </div>

        <!-- Dimensions Flowchart -->
        <div v-else-if="activeTab === 'weights'" class="w-full h-full flex flex-col p-4 min-h-0 relative overflow-y-auto custom-scrollbar bg-slate-50/50">
            <p class="text-xs text-slate-500 text-left mb-8 max-w-xl mx-auto leading-relaxed">
                The overall risk score is calculated using three main dimensions: <strong>Exposure</strong>, <strong>Vulnerability</strong>, and <strong>Lack of Coping Capacity</strong>. Here are the underlying sub-indicators available for this region.
            </p>
            
            <div class="flex-1 flex flex-col items-center justify-start min-h-max pb-12 w-full">
                <!-- Final Risk Node Row -->
                <div class="relative flex items-center justify-center w-full max-w-4xl z-10">
                    <!-- Download Weights -->
                    <div class="absolute left-4 top-1/2 -translate-y-1/2 hidden md:block">
                        <button 
                            @click="downloadWeightsCSV" 
                            title="Download current weights as CSV"
                            class="shrink-0 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-[10px] font-bold uppercase tracking-widest rounded shadow-sm border border-slate-200 transition-colors flex items-center gap-1.5"
                        >
                            <svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            Download Weights
                        </button>
                    </div>

                    <!-- Final Risk Node -->
                    <div class="bg-slate-800 text-white font-black px-6 py-2.5 rounded-xl shadow-lg border-b-4 border-slate-900 text-base tracking-wide uppercase">
                        {{ disasterLabel }} Risk
                    </div>
                    
                    <!-- Methodology Link -->
                    <div class="absolute right-4 top-1/2 -translate-y-1/2 hidden md:block">
                        <a href="https://giscience.github.io/gis-training-resource-center/content/GIS_AA/en_qgis_risk_assessment_plugin.html#methodology" target="_blank" rel="noopener noreferrer" class="text-heigit-red hover:text-red-700 text-xs font-semibold underline-offset-2 hover:underline inline-flex items-center gap-1 transition-colors">
                            Read more about the methodology<span class="text-[10px]">↗</span>
                        </a>
                    </div>
                </div>
                
                <!-- Vertical Line from Risk -->
                <div class="w-[2px] h-6 bg-slate-300"></div>
                
                <!-- Horizontal connecting line -->
                <div class="w-2/3 max-w-2xl border-t-[2px] border-slate-300 relative h-6">
                   <div class="absolute left-0 top-0 w-[2px] h-6 bg-slate-300"></div>
                   <div class="absolute left-1/2 top-0 w-[2px] h-6 bg-slate-300 transform -translate-x-1/2"></div>
                   <div class="absolute right-0 top-0 w-[2px] h-6 bg-slate-300"></div>
                </div>
                
                <!-- 3 Columns -->
                <div class="w-full max-w-4xl grid grid-cols-3 gap-6 px-4 relative z-10">
                    <!-- EXPOSURE -->
                    <div class="flex flex-col items-center">
                        <div class="bg-[#ca2333] text-white font-bold px-4 py-2 rounded-lg shadow border-b-4 border-[#8B1824] w-full text-center text-sm mb-2 relative">
                            Exposure
                        </div>
                        <button v-if="expCols.length > 0" @click="resetDimensionWeights(expCols)" class="mb-4 text-[10px] uppercase font-bold text-slate-500 hover:text-slate-800 transition-colors shrink-0 px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded shadow-sm flex items-center gap-1">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            Reset Weights
                        </button>
                        <div class="flex flex-col gap-2 w-full">
                            <div v-for="col in expCols" :key="col" class="bg-white border border-slate-200 px-3 py-2.5 rounded shadow-sm text-xs text-slate-700 flex flex-col gap-2">
                                <div class="font-semibold text-center">{{ formatColName(col) }}</div>
                                <div class="flex items-center gap-2">
                                   <input type="range" class="flex-1 w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#ca2333]" min="0" max="5" step="0.1" :value="getWeight(col)" @input="e => setWeight(col, Number((e.target as HTMLInputElement).value))" />
                                   <span class="text-[10px] font-bold tabular-nums min-w-[20px] text-right">{{ getWeight(col).toFixed(1) }}</span>
                                </div>
                            </div>
                            <div v-if="expCols.length === 0" class="text-xs text-slate-400 text-center italic py-2">No sub-indicators</div>
                        </div>
                    </div>
                    
                    <!-- VULNERABILITY -->
                    <div class="flex flex-col items-center">
                        <div class="bg-[#E77480] text-white font-bold px-4 py-2 rounded-lg shadow border-b-4 border-[#b04a55] w-full text-center text-sm mb-2 relative">
                            Vulnerability
                        </div>
                        <button v-if="vulCols.length > 0" @click="resetDimensionWeights(vulCols)" class="mb-4 text-[10px] uppercase font-bold text-slate-500 hover:text-slate-800 transition-colors shrink-0 px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded shadow-sm flex items-center gap-1">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            Reset Weights
                        </button>
                        <div class="flex flex-col gap-2 w-full">
                            <div v-for="col in vulCols" :key="col" class="bg-white border border-slate-200 px-3 py-2.5 rounded shadow-sm text-xs text-slate-700 flex flex-col gap-2">
                                <div class="font-semibold text-center">{{ formatColName(col) }}</div>
                                <div class="flex items-center gap-2">
                                   <input type="range" class="flex-1 w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#E77480]" min="0" max="5" step="0.1" :value="getWeight(col)" @input="e => setWeight(col, Number((e.target as HTMLInputElement).value))" />
                                   <span class="text-[10px] font-bold tabular-nums min-w-[20px] text-right">{{ getWeight(col).toFixed(1) }}</span>
                                </div>
                            </div>
                            <div v-if="vulCols.length === 0" class="text-xs text-slate-400 text-center italic py-2">No sub-indicators</div>
                        </div>
                    </div>
                    
                    <!-- COPING CAPACITY -->
                    <div class="flex flex-col items-center">
                        <div class="bg-[#2C3E50] text-white font-bold px-4 py-2 rounded-lg shadow border-b-4 border-[#1a252f] w-full text-center text-sm mb-2 relative z-10">
                            Coping Capacity
                        </div>
                        <button v-if="copCols.length > 0" @click="resetDimensionWeights(copCols)" class="mb-4 text-[10px] uppercase font-bold text-slate-500 hover:text-slate-800 transition-colors shrink-0 px-2 py-1 relative z-10 bg-white hover:bg-slate-50 border border-slate-200 rounded shadow-sm flex items-center gap-1">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            Reset Weights
                        </button>
                        <div class="flex flex-col gap-2 w-full relative z-10">
                            <div v-for="col in copCols" :key="col" class="bg-white border border-slate-200 px-3 py-2.5 rounded shadow-sm text-xs text-slate-700 flex flex-col gap-2">
                                <div class="font-semibold text-center">{{ formatColName(col) }}</div>
                                <div class="flex items-center gap-2">
                                   <input type="range" class="flex-1 w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E50]" min="0" max="5" step="0.1" :value="getWeight(col)" @input="e => setWeight(col, Number((e.target as HTMLInputElement).value))" />
                                   <span class="text-[10px] font-bold tabular-nums min-w-[20px] text-right">{{ getWeight(col).toFixed(1) }}</span>
                                </div>
                            </div>
                            <div v-if="copCols.length === 0" class="text-xs text-slate-400 text-center italic py-2">No sub-indicators</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Table -->
        <div v-else-if="activeTab === 'table'" class="w-full h-full flex flex-col min-h-0 relative">
             <div class="flex justify-between items-center mb-2 shrink-0">
                 <div class="text-sm font-bold text-slate-700">{{ sortedData.length }} Regions</div>
             </div>
             
             <div class="flex-1 overflow-auto border border-slate-200 rounded-lg custom-scrollbar bg-white">
                 <table class="w-full text-left text-sm text-slate-600 relative border-collapse">
                     <thead class="text-xs text-slate-500 uppercase sticky top-0 z-10 shadow-sm border-b border-slate-200">
                         <tr>
                             <th class="px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 whitespace-nowrap border-b border-slate-200" @click="toggleSort(pcodeField)">
                                 PCODE <span v-if="sortKey === pcodeField">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                             </th>
                             <th class="px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 whitespace-nowrap border-b border-slate-200" @click="toggleSort(selectedDisaster)">
                                 {{ disasterLabel }} Risk <span v-if="sortKey === selectedDisaster || sortKey === ''">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                             </th>
                             <th v-for="col in indicatorCols" :key="col" class="px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 whitespace-nowrap border-b border-slate-200" @click="toggleSort(col)">
                                 {{ formatColName(col) }} <span v-if="sortKey === col">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                             </th>
                         </tr>
                     </thead>
                     <tbody>
                         <tr v-for="row in paginatedData" :key="row[pcodeField]" class="hover:bg-slate-50"
                             @mouseenter="emit('region-hover', row[pcodeField])"
                             @mouseleave="emit('region-hover', null)"
                         >
                             <td class="px-4 py-2 font-medium text-slate-900 whitespace-nowrap border-b border-slate-100">{{ row[pcodeField] }}</td>
                             <td class="px-4 py-2 font-bold whitespace-nowrap border-b border-slate-100">{{ row[selectedDisaster] !== undefined && row[selectedDisaster] !== null && row[selectedDisaster] !== '' && !isNaN(Number(row[selectedDisaster])) ? Number(row[selectedDisaster]).toFixed(3) : 'N/A' }}</td>
                             <td v-for="col in indicatorCols" :key="col" class="px-4 py-2 whitespace-nowrap text-slate-600 border-b border-slate-100">
                                 {{ row[col] !== undefined && row[col] !== null && row[col] !== '' && !isNaN(Number(row[col])) ? Number(row[col]).toFixed(3) : (row[col] || '-') }}
                             </td>
                         </tr>
                     </tbody>
                 </table>
             </div>
             
             <!-- Pagination Controls -->
             <div class="flex justify-between items-center mt-3 shrink-0" v-if="totalPages > 1">
                 <button 
                     @click="currentPage--" 
                     :disabled="currentPage === 1"
                     class="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded-md disabled:opacity-40 hover:bg-slate-200 transition-colors cursor-pointer"
                 >
                     Previous
                 </button>
                 <span class="text-xs font-bold text-slate-500 tracking-wider">
                     PAGE {{ currentPage }} OF {{ totalPages }}
                 </span>
                 <button 
                     @click="currentPage++" 
                     :disabled="currentPage === totalPages"
                     class="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded-md disabled:opacity-40 hover:bg-slate-200 transition-colors cursor-pointer"
                 >
                     Next
                 </button>
             </div>
        </div>
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
  background: #8B4C4C; /* HeiGIT Red */
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #8B4C4C; /* Darker HeiGIT Red */
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
  .risk-statistics {
    height: auto;
    min-height: 100%;
  }
  
  /* Horizontal scrolling tabs */
  .flex.gap-2.p-4.border-b.border-slate-200 {
    padding: 0.5rem;
    gap: 0.25rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  
  .flex.gap-2.p-4.border-b.border-slate-200::-webkit-scrollbar {
    display: none;
  }
  
  .flex.gap-2.p-4.border-b.border-slate-200 button {
    padding: 0.4rem 0.6rem;
    font-size: 0.65rem;
    white-space: nowrap;
    flex-shrink: 0;
  }
  
  .flex-1.p-4.flex.flex-col.min-h-0 {
    padding: 0.75rem;
  }
  
  .h-full.min-h-\[400px\].flex.flex-col {
    min-height: 300px;
  }
  
  .text-lg.font-extrabold.text-slate-900.mb-2.mt-2.px-2.tracking-tight {
    font-size: 1rem;
    margin-bottom: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .text-xs.text-slate-500.text-left.mb-8.max-w-xl.mx-auto.leading-relaxed {
    font-size: 0.7rem;
    margin-bottom: 1rem;
  }
  
  /* Make the weights grid stack on mobile */
  .w-full.max-w-4xl.grid.grid-cols-3.gap-6.px-4.relative.z-10 {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 0.5rem;
  }
  
  .absolute.left-4.top-1\/2.-translate-y-1\/2,
  .absolute.right-4.top-1\/2.-translate-y-1\/2 {
    position: relative;
    left: auto;
    right: auto;
    top: auto;
    transform: none;
    margin-bottom: 0.5rem;
  }
  
  .bg-slate-800.text-white.font-black.px-6.py-2\.5.rounded-xl.shadow-lg.border-b-4.border-slate-900.text-base.tracking-wide.uppercase {
    font-size: 0.875rem;
    padding: 0.75rem 1rem;
  }
  
  /* Table mobile adjustments */
  .w-full.text-left.text-sm.text-slate-600.relative.border-collapse {
    font-size: 0.75rem;
  }
  
  .px-4.py-3.bg-slate-50.cursor-pointer.hover\:bg-slate-100.whitespace-nowrap.border-b.border-slate-200 {
    padding: 0.5rem;
  }
  
  .px-4.py-2.font-medium.text-slate-900.whitespace-nowrap.border-b.border-slate-100 {
    padding: 0.4rem;
  }
  
  /* Adjust charts container for mobile */
  #ranking-chart,
  #components-chart,
  #demographics-chart {
    min-height: 250px;
    height: 250px;
  }
}
</style>
