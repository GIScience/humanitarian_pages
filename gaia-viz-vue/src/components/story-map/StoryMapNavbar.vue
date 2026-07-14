<script setup lang="ts">
export interface StorySection {
    id: string;
    text: string;
    level: number;
}

defineProps<{
    sections: StorySection[];
    activeId: string;
}>();

const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
    <nav v-if="sections.length"
        class="sticky top-1 z-[60] border-2 py-4 flex items-center border-b border-slate-200 bg-white/90 backdrop-blur sm:-mx-6">
        <ul class="flex w-full items-center justify-center gap-5 overflow-x-auto px-4 sm:px-6">
            <li v-for="s in sections" :key="s.id" class="shrink-0 list-none">
                <button type="button" @click="emit('select', s.id)"
                    class="block whitespace-nowrap border-b-2 px-1 py-3.5 text-base transition-colors duration-300"
                    :class="[
                        s.level === 3 ? 'text-[13px] text-slate-400' : 'font-semibold',
                        activeId === s.id
                            ? 'border-heigit-red text-heigit-red'
                            : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                    ]">
                    <v-icon v-if="s.level === 3" icon="mdi-circle-medium" size="16" class="mr-1 text-heigit-red" />
                    {{ s.text }}
                </button>
            </li>
        </ul>
    </nav>
</template>
