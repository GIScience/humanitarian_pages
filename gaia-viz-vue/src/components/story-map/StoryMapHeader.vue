<script setup lang="ts">
import { onMounted, ref } from 'vue';

withDefaults(defineProps<{
    eyebrow?: string;
    title: string;
    description?: string;
}>(), {
    eyebrow: 'HeiGIT Story Map',
});

const mounted = ref(false);

onMounted(() => {
    requestAnimationFrame(() => {
        mounted.value = true;
    });
});
</script>

<template>
    <header data-no-reveal
        class="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-heigit-red-dark px-6 py-16 sm:px-12 sm:py-24 text-center mt-6 mb-12">
        <div class="pointer-events-none absolute inset-0 opacity-[0.06]
            bg-[linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)]
            bg-[length:32px_32px]">
        </div>

        <div class="relative z-10 mx-auto max-w-2xl">
            <span class="inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-heigit-red-light/90 transition-all duration-700 ease-out"
                :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'">
                {{ eyebrow }}
            </span>

            <h1 class="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight text-white transition-all duration-700 delay-150 ease-out"
                :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                {{ title }}
            </h1>

            <p v-if="description"
                class="mt-5 text-base sm:text-lg leading-relaxed text-slate-300 transition-all duration-700 delay-300 ease-out"
                :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
                {{ description }}
            </p>
        </div>

        <div class="relative z-10 mt-10 flex justify-center transition-opacity duration-700 delay-500 ease-out"
            :class="mounted ? 'opacity-100' : 'opacity-0'">
            <div class="flex h-9 w-9 animate-bounce items-center justify-center rounded-full border border-white/30 text-white/70">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
            </div>
        </div>
    </header>
</template>
