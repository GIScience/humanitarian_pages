<script setup lang="ts">


defineEmits<{
  (e: 'close'): void;
}>();

const openLink = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

// --- Data: Resources ---
const resources = [
  { 
    title: "QGIS Plugin",
    description: "Learn how to calculate your own risk assessment using our plugin.",
    link: "https://giscience.github.io/gis-training-resource-center/content/GIS_AA/en_qgis_risk_assessment_plugin.html"
  }
];
</script>

<template>
  <div class="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" @click="$emit('close')"></div>

    <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-slate-900/5">
      
      <div class="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white z-10 shrink-0">
        <div>
          <h2 class="text-2xl font-extrabold text-slate-900 tracking-tight">Hazard Risk Dashboard</h2>
          <p class="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Visualizing risk potential of natural hazards</p>
        </div>
        <button 
          @click="$emit('close')"
          class="p-2 rounded-full text-slate-400 hover:text-heigit-red hover:bg-red-50 transition-all focus:outline-none"
          aria-label="Close"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="overflow-y-auto px-8 py-8 space-y-10 text-slate-600 leading-relaxed scroll-smooth custom-scrollbar">
        
        <section class="prose max-w-none">
          <p class="text-lg leading-relaxed text-slate-700">
            The <strong>Hazard Risk Dashboard</strong> delivers insights into the spatial distribution of risk from various natural hazards. Developed by <strong>HeiGIT</strong>, this tool helps visualize regions that are highly exposed or vulnerable combined with a lack of coping capacity, empowering decision-makers to identify areas requiring proactive humanitarian or disaster relief interventions.
          </p>
          
          <div class="not-prose mt-6 bg-red-50 p-5 rounded-xl border border-red-100 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h4 class="font-bold text-red-900 text-sm uppercase tracking-wider">Methodology</h4>
              <p class="text-sm text-red-700 mt-1">Access the underlying GAIA pipeline and training center.</p>
            </div>
            <button 
              @click="openLink('https://giscience.github.io/gis-training-resource-center/content/GIS_AA/en_gaia_indicators_processing.html')"
              class="shrink-0 px-4 py-2 bg-heigit-red hover:bg-red-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              View Documentation
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </button>
          </div>
        </section>

        <hr class="border-slate-200" />

        <section>
          <div class="flex items-center gap-2 mb-4">
             <div class="p-2 bg-slate-100 rounded-lg text-slate-600">
               <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.447-.894L15 7m0 13V7" /></svg>
             </div>
             <h3 class="text-xl font-bold text-slate-900">Method</h3>
          </div>
          
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
              <p>
                Our analysis pipeline leverages the power of open-source datasets and tools to quantify risk across regions. Using hazard datasets overlaid with OpenStreetMap and population data, we calculate aggregate risk scores.
              </p>
              <p>
                The unit of analysis corresponds to sub-national administrative boundaries (e.g., ADM1 or ADM2). By computing exposure, vulnerability and coping capacity metrics, we generate a composite index of risk which is visualized across the dashboard's statistics and map components.
              </p>
              <ul class="space-y-2 mt-2 col-span-1 lg:col-span-2">
                <li class="flex items-start gap-2 text-sm">
                  <span class="text-heigit-red mt">●</span>
                  <span><strong>Hazard Exposure:</strong> Identifying regions prone to specific disaster types.</span>
                </li>
                <li class="flex items-start gap-2 text-sm">
                  <span class="text-heigit-red mt">●</span>
                  <span><strong>Vulnerability:</strong> Representing the sensitivity of a population to external shocks.</span>
                </li>
                <li class="flex items-start gap-2 text-sm">
                  <span class="text-heigit-red mt">●</span>
                  <span><strong>Coping Capacity:</strong> Measuring the ability of a population to access essential services.</span>
                </li>
              </ul>
          </div>
        </section>

        <section class="bg-amber-50 rounded-xl p-6 border border-amber-100">
          <h3 class="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            Limitations & Constraints
          </h3>
          <ul class="space-y-2 text-sm text-amber-900/80 list-disc pl-5">
            <li><strong>Data Completeness:</strong> In regions with unmapped critical infrastructure or outdated population models, the risk may be inaccurately captured.</li>
            <li><strong>Aggregation Granularity:</strong> Presenting results at ADM1 or ADM2 level can obscure very localized variations in risk.</li>
            <li><strong>Static Snapshots:</strong> Hazards are dynamic, and static layers may not perfectly reflect ongoing or rapidly changing disaster events.</li>
            <li><strong>Lack of Local Knowledge:</strong> The model does not account for local knowledge and practices.</li>
          </ul>
        </section>

        <section>
           <h3 class="text-xl font-bold text-slate-900 mb-4">Further Resources</h3>
           
           <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
             <a v-for="(resource, i) in resources" :key="`res-${i}`" :href="resource.link" target="_blank" 
                class="group block p-4 rounded-lg border border-slate-200 hover:border-heigit-red transition-colors bg-slate-50">
               <h4 class="font-bold text-slate-800 text-sm group-hover:text-heigit-red transition-colors">
                 {{ resource.title }}
               </h4>
               <p class="text-xs text-slate-500 mt-2">
                 {{ resource.description }}
               </p>
             </a>
           </div>
        </section>

      </div>

      <div class="bg-slate-50 border-t border-slate-200 p-6 shrink-0">
        <p class="text-sm text-center text-slate-500">
          Have a use-case? Contact us at <a href="mailto:communications@heigit.org" class="text-heigit-red hover:underline font-bold">communications@heigit.org</a>
        </p>
      </div>
      
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
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
