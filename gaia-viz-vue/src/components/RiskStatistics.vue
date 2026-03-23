<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import Plotly from 'plotly.js-dist-min';

const props = defineProps<{
  data: any[];
  selectedDisaster: string;
  pcodeField: string;
}>();

const emit = defineEmits<{
  (e: 'region-hover', pcode: string | null): void;
  (e: 'region-click', pcode: string): void;
}>();

const activeTab = ref<'ranking' | 'components' | 'demographics' | 'table'>('ranking');
const sortKey = ref<string>('risk');
const sortOrder = ref<'asc' | 'desc'>('desc');

// Format disaster name
const disasterLabel = computed(() => {
  if (!props.selectedDisaster) return 'Risk';
  return props.selectedDisaster.replace('risk_', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
});

const disasterSuffix = computed(() => {
    if (!props.selectedDisaster) return '';
    return props.selectedDisaster.replace('risk_', '');
});

// Dynamic component columns based on what's available in the dataset
const componentCols = computed(() => {
    if (!props.data || props.data.length === 0) return { exp: '', sus: '', vul: 'vul', cop: 'cop' };
    const cols = Object.keys(props.data[0]);
    
    // Look for exp_ related to the disaster
    const exp = cols.find(c => c === `exp_${disasterSuffix.value}`) || cols.find(c => c.startsWith('exp_')) || '';
    const vul = cols.find(c => c === 'vul') || cols.find(c => c.startsWith('vul')) || '';
    const cop = cols.find(c => c === 'cop') || cols.find(c => c.startsWith('cop')) || '';
    
    return { exp, vul, cop };
});

const sortedData = computed(() => {
    if (!props.data || props.data.length === 0) return [];
    
    let key = props.selectedDisaster;
    if (sortKey.value !== 'risk') {
       key = componentCols.value[sortKey.value as keyof typeof componentCols.value] || props.selectedDisaster;
    }
    
    return [...props.data].sort((a, b) => {
        const valA = Number(a[key]) || 0;
        const valB = Number(b[key]) || 0;
        if (valA < valB) return sortOrder.value === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder.value === 'asc' ? 1 : -1;
        return 0;
    });
});

const toggleSort = (key: string) => {
    if (sortKey.value === key) {
        sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortOrder.value = 'desc';
    }
};

const renderRanking = async () => {
    await nextTick();
    const graphDiv = document.getElementById('ranking-chart');
    if (!graphDiv || !props.data.length || !props.selectedDisaster) return;

    // Get top 15 highest risk
    const topData = [...props.data]
        .filter(d => !isNaN(Number(d[props.selectedDisaster])))
        .sort((a, b) => Number(b[props.selectedDisaster]) - Number(a[props.selectedDisaster]))
        .slice(0, 15)
        .reverse(); // Reverse for Plotly horizontal bar chart (bottom to top)

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
        await Plotly.newPlot(graphDiv as any, [trace] as any, layout as any, { responsive: true, displayModeBar: false });
        (graphDiv as any).on('plotly_hover', (data: any) => {
            if (data.points && data.points.length > 0) {
                emit('region-hover', data.points[0].y); // Horizontal bar, so y is the PCODE
            }
        });
        (graphDiv as any).on('plotly_unhover', () => emit('region-hover', null));
    } catch (e) {
        console.error("Plotly Ranking Error:", e);
    }
};

const renderComponents = async () => {
    await nextTick();
    const graphDiv = document.getElementById('components-chart');
    if (!graphDiv || !props.data.length) return;

    // Top 5 regions by risk
    const topData = [...props.data]
        .filter(d => !isNaN(Number(d[props.selectedDisaster])))
        .sort((a, b) => Number(b[props.selectedDisaster]) - Number(a[props.selectedDisaster]))
        .slice(0, 5);

    const pcodes = topData.map(d => d[props.pcodeField]);
    const { exp, vul, cop } = componentCols.value;

    const traces = [];
    const colors = {
        exp: '#ca2333', // HeiGIT Red
        vul: '#E77480', 
        cop: '#F4C2C7'  
    };

    if (exp) {
        traces.push({
            x: pcodes,
            y: topData.map(d => Number(d[exp]) || 0),
            name: 'Exposure',
            type: 'bar',
            marker: { color: colors.exp }
        });
    }
    if (vul) {
        traces.push({
            x: pcodes,
            y: topData.map(d => Number(d[vul]) || 0),
            name: 'Vulnerability',
            type: 'bar',
            marker: { color: colors.vul }
        });
    }
    if (cop) {
        traces.push({
            x: pcodes,
            y: topData.map(d => Number(d[cop]) || 0),
            name: 'Lack of Coping Capacity',
            type: 'bar',
            marker: { color: colors.cop }
        });
    }

    const layout = {
        font: { family: 'inherit', color: '#475569' },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        barmode: 'group',
        xaxis: { 
            title: 'Region (PCODE)',
            gridcolor: '#e2e8f0',
            tickfont: { size: 10, color: '#475569' },
            automargin: true
        },
        yaxis: { 
            title: 'Index Value',
            gridcolor: '#e2e8f0',
            zerolinecolor: '#e2e8f0',
            automargin: true,
            range: [0, Math.max(1, ...topData.map(d => Math.max(Number(d[exp])||0, Number(d[vul])||0, Number(d[cop])||0)))]
        },
        margin: { t: 10, r: 10, b: 100, l: 10 },
        legend: { orientation: 'h' }
    };

    try {
        await Plotly.newPlot(graphDiv as any, traces as any, layout as any, { responsive: true, displayModeBar: false });
        (graphDiv as any).on('plotly_hover', (data: any) => {
            if (data.points && data.points.length > 0) {
                emit('region-hover', data.points[0].x); // Vertical bar, x is PCODE
            }
        });
        (graphDiv as any).on('plotly_unhover', () => emit('region-hover', null));
    } catch (e) {
        console.error("Plotly Components Error:", e);
    }
};

const renderDemographics = async () => {
    await nextTick();
    const graphDiv = document.getElementById('demographics-chart');
    if (!graphDiv || !props.data.length) return;

    // Aggregate demographics for the whole country
    const cols = Object.keys(props.data[0]);
    const demoCols = cols.filter(c => c.startsWith('vul_') && !c.includes('perc') && !c.includes('rural'));
    
    if (demoCols.length === 0) {
        // Fallback if no demographics found
        Plotly.purge(graphDiv as any);
        return;
    }

    const totals: Record<string, number> = {};
    demoCols.forEach(col => {
        totals[col] = props.data.reduce((sum, row) => sum + (Number(row[col]) || 0), 0);
    });

    // Remove total female/pop just to not skew the chart, or keep it as specific groups
    const selectedDemoCols = demoCols.filter(c => !c.includes('pop') || c.includes('rural_pop'));

    const labels = selectedDemoCols.map(c => c.replace('vul_', '').replace(/_/g, ' ').toUpperCase());
    const values = selectedDemoCols.map(c => totals[c]);

    const trace = {
        labels: labels,
        values: values,
        type: 'pie',
        hole: 0.4,
        textinfo: 'percent',
        textposition: 'inside',
        insidetextorientation: 'radial',
        marker: {
            colors: [
                '#8B1824', // Shade (Dark Red)
                '#E77480', // Tint (Soft Red/Rose)
                '#2C3E50', // Base (Midnight Navy)
                '#5D6D7E',  // Tint (Steel Blue)
                '#1B2838', // Shade (Deep Night Blue)
                '#CA2333', // Base (Your Main Red)
            ]
        }
    };

    const layout = {
        font: { family: 'inherit', color: '#475569' },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { t: 10, r: 10, b: 100, l: 10 },
        showlegend: true,
        legend: { orientation: 'h' }
    };

    try {
        await Plotly.newPlot(graphDiv as any, [trace] as any, layout as any, { responsive: true, displayModeBar: false });
    } catch (e) {
        console.error("Plotly Demographics Error:", e);
    }
};

const updateActiveChart = () => {
    if (activeTab.value === 'ranking') setTimeout(() => renderRanking(), 100);
    else if (activeTab.value === 'components') setTimeout(() => renderComponents(), 100);
    else if (activeTab.value === 'demographics') setTimeout(() => renderDemographics(), 100);
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
            v-for="tab in ['ranking', 'components', 'table', 'demographics']" 
            :key="tab"
            @click="activeTab = tab as any"
            class="px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors"
            :class="activeTab === tab ? 'bg-heigit-red text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'"
        >
            {{ tab }}
        </button>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <!-- Ranking -->
        <div v-if="activeTab === 'ranking'" class="h-full min-h-[400px] flex flex-col">
            <h3 class="text-lg font-extrabold text-slate-900 mb-2 mt-2 px-2 tracking-tight">Top 15 Regions</h3>
            <div id="ranking-chart" class="w-full flex-1"></div>
        </div>

        <!-- Components -->
        <div v-else-if="activeTab === 'components'" class="h-full min-h-[400px] flex flex-col">
            <h3 class="text-lg font-extrabold text-slate-900 mb-1 mt-2 px-2 tracking-tight">Top 5 Regions</h3>
            <div class="mb-2 px-2 text-xs text-slate-500 font-medium">Risk breakdown of top vulnerable areas based on formula factors.</div>
            <div id="components-chart" class="w-full flex-1"></div>
        </div>

        <!-- Demographics -->
        <div v-else-if="activeTab === 'demographics'" class="h-full min-h-[400px] flex flex-col">
            <h3 class="text-lg font-extrabold text-slate-900 mb-2 mt-2 px-2 tracking-tight">Vulnerable Demographics</h3>
            <div id="demographics-chart" class="w-full flex-1"></div>
        </div>

        <!-- Table -->
        <div v-else-if="activeTab === 'table'" class="w-full">
             <div class="flex justify-between items-center mb-4">
                 <div class="text-sm font-bold text-slate-700">{{ sortedData.length }} Regions</div>
             </div>
             
             <div class="overflow-x-auto border border-slate-200 rounded-lg">
                 <table class="w-full text-left text-sm text-slate-600">
                     <thead class="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                         <tr>
                             <th class="px-4 py-3 cursor-pointer hover:bg-slate-100" @click="toggleSort('pcode')">
                                 PCODE <span v-if="sortKey === 'pcode'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                             </th>
                             <th class="px-4 py-3 cursor-pointer hover:bg-slate-100" @click="toggleSort('risk')">
                                 {{ disasterLabel }} Risk <span v-if="sortKey === 'risk'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                             </th>
                             <th v-if="componentCols.exp" class="px-4 py-3 cursor-pointer hover:bg-slate-100" @click="toggleSort('exp')">
                                 Exposure <span v-if="sortKey === 'exp'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                             </th>
                             <th v-if="componentCols.vul" class="px-4 py-3 cursor-pointer hover:bg-slate-100" @click="toggleSort('vul')">
                                 Vulnerability <span v-if="sortKey === 'vul'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                             </th>
                             <th v-if="componentCols.cop" class="px-4 py-3 cursor-pointer hover:bg-slate-100" @click="toggleSort('cop')">
                                 Lack of Coping Capacity <span v-if="sortKey === 'cop'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                             </th>
                         </tr>
                     </thead>
                     <tbody>
                         <tr v-for="row in sortedData.slice(0, 50)" :key="row[pcodeField]" class="border-b border-slate-100 hover:bg-slate-50"
                             @mouseenter="emit('region-hover', row[pcodeField])"
                             @mouseleave="emit('region-hover', null)"
                         >
                             <td class="px-4 py-2 font-medium text-slate-900">{{ row[pcodeField] }}</td>
                             <td class="px-4 py-2 font-bold">{{ Number(row[selectedDisaster])?.toFixed(3) || 'N/A' }}</td>
                             <td v-if="componentCols.exp" class="px-4 py-2">{{ Number(row[componentCols.exp])?.toFixed(3) || '-' }}</td>
                             <td v-if="componentCols.vul" class="px-4 py-2">{{ Number(row[componentCols.vul])?.toFixed(3) || '-' }}</td>
                             <td v-if="componentCols.cop" class="px-4 py-2">{{ Number(row[componentCols.cop])?.toFixed(3) || '-' }}</td>
                         </tr>
                     </tbody>
                 </table>
             </div>
             <div v-if="sortedData.length > 50" class="text-xs text-slate-400 mt-2 text-center italic">Showing top 50 regions</div>
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
  background: #cbd5e1;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
