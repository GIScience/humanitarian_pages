<script lang="ts" setup>
import { cn } from '@/utils/cn'

withDefaults(defineProps<{
    selectedDimension?: string;
}>(), {
    selectedDimension: 'composite-risk',
});

const emit = defineEmits<{
    (e: 'dimension', value: string): void;
}>();


const dimensionRiskColumns = [
    { key: 'composite-risk', label: 'Final Risk', icon: 'mdi-gauge' },
    { key: 'vulnerability', label: 'Vulnerability', icon: 'mdi-account-alert-outline' },
    { key: 'exposure', label: 'Hazard Exposure', icon: 'mdi-weather-hurricane' },
    { key: 'capacity', label: 'Coping Capacity', icon: 'mdi-shield-check-outline' },
];


const selectDimension = (key: string) => {
    emit('dimension', key);
}

</script>

<!-- Risk Indicator Selector -->
<template>
    <ul
        class="flex items-center whitespace-nowrap absolute top-0 w-fit mx-auto left-0 right-0 z-30 bg-white shadow-lg  rounded-b-2xl overflow-clip">
        <li v-for="dimension in dimensionRiskColumns" :key="dimension.key" :class="cn(
            'flex items-center gap-2 transition-colors cursor-pointer',
            selectedDimension === dimension.key ? 'bg-heigit-red text-white' : 'bg-white text-slate-700'
        )">
            <button @click="selectDimension(dimension.key)" class="text-sm font-semibold flex-1 p-2 flex items-center gap-2">
                <v-icon :icon="dimension.icon" size="18" />
                <span>{{ dimension.label }}</span>
                <v-icon icon="mdi-circle-medium" size="16" class="ml-1 text-heigit-red" />
            </button>
            <v-divider vertical />
        </li>
    </ul>
</template>