<script setup lang="ts">
const props = defineProps<{
  isMobile?: boolean;
}>();

const legendItems = [
  { label: 'Very High Risk', color: '#8B4C4C' },
  { label: 'High Risk', color: '#F28C82' },
  { label: 'Moderate Risk', color: '#F9D6C1' },
  { label: 'Low Risk', color: '#FFFFFF' }
];
</script>

<template>
  <div class="absolute z-[60] bg-white/80 backdrop-blur-xl border border-slate-200 rounded-lg shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500"
       :class="props.isMobile ? 'bottom-4 left-4 w-28 p-2' : 'bottom-6 left-6 p-3.5 rounded-2xl'">
    <h3 class="text-slate-900 font-extrabold tracking-tight uppercase opacity-60"
        :class="props.isMobile ? 'text-[9px] mb-1' : 'text-[11px] mb-2'">Risk Assessment:</h3>
    <div :class="props.isMobile ? 'space-y-0.5' : 'space-y-1.5'">
      <div 
        v-for="item in legendItems" 
        :key="item.label"
        class="flex items-center group"
        :class="props.isMobile ? 'gap-1.5' : 'gap-3'"
      >
        <div 
          class="border border-slate-300 shadow-sm transition-transform group-hover:scale-110"
          :class="props.isMobile ? 'w-2.5 h-2.5 rounded-[2px]' : 'w-4 h-4 rounded-md'"
          :style="{ backgroundColor: item.color }"
        ></div>
        <span class="text-slate-600 tracking-wide font-bold" :class="props.isMobile ? 'text-[10px]' : 'text-[11px]'">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop-blur-xl {
  backdrop-filter: blur(24px);
}
</style>
