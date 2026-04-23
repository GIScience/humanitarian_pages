<script setup lang="ts">
const legendItems = [
  { label: 'Very High Risk', color: '#8B4C4C' },
  { label: 'High Risk', color: '#F28C82' },
  { label: 'Moderate Risk', color: '#F9D6C1' },
  { label: 'Low Risk', color: '#FFFFFF' }
];
</script>

<template>
  <div class="absolute bottom-6 left-6 z-[60] p-2.5 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
    <h3 class="text-[9px] font-extrabold text-slate-900 mb-1.5 tracking-tight uppercase opacity-60">Risk Assessment:</h3>
    <div class="space-y-1">
      <div 
        v-for="item in legendItems" 
        :key="item.label"
        class="flex items-center gap-2 group"
      >
        <div 
          class="w-3.5 h-3.5 rounded-md border border-slate-300 shadow-sm transition-transform group-hover:scale-110"
          :style="{ backgroundColor: item.color }"
        ></div>
        <span class="text-[10px] font-bold text-slate-600 tracking-wide">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure the legend is cleanly separated from the map background */
.backdrop-blur-xl {
  backdrop-filter: blur(24px);
}
</style>
