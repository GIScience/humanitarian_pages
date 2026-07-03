<script setup lang="ts">
const legendItems = [
    { label: 'Very High Risk', color: '#8B4C4C' },
    { label: 'High Risk', color: '#F28C82' },
    { label: 'Moderate Risk', color: '#F9D6C1' },
    { label: 'Low Risk', color: '#FFFFFF' },
];
</script>

<template>
    <div data-no-reveal
        class="my-8 grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-4">
        <div v-for="item in legendItems" :key="item.label" class="flex items-center gap-2.5">
            <span class="h-4 w-4 shrink-0 rounded-md border border-slate-300 shadow-sm" :style="{ backgroundColor: item.color }" />
            <span class="text-xs font-bold tracking-wide text-slate-600">{{ item.label }}</span>
        </div>
    </div>
</template>
