<!-- StoryMapStat.vue -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{
    value: number;
    label: string;
    prefix?: string;
    suffix?: string;
    decimals?: number;
}>(), {
    prefix: '',
    suffix: '',
    decimals: 0,
});

const el = ref<HTMLElement | null>(null);
const isVisible = ref(false);
const display = ref(0);
let observer: IntersectionObserver | null = null;
let animated = false;

function animateCount() {
    if (animated) return;
    animated = true;

    const duration = 1200;
    const start = performance.now();

    function tick(now: number) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        display.value = props.value * eased;
        if (progress < 1) requestAnimationFrame(tick);
        else display.value = props.value;
    }

    requestAnimationFrame(tick);
}

onMounted(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        isVisible.value = true;
        display.value = props.value;
        return;
    }

    observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    isVisible.value = true;
                    animateCount();
                    observer?.disconnect();
                }
            });
        },
        { threshold: 0.4 }
    );

    if (el.value) observer.observe(el.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
    <div ref="el" data-no-reveal
        class="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 text-center transition-all duration-700 ease-out"
        :class="isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'">
        <div class="text-3xl sm:text-4xl font-extrabold tabular-nums text-heigit-red">
            {{ prefix }}{{ display.toFixed(decimals) }}{{ suffix }}
        </div>
        <div class="mt-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            {{ label }}
        </div>
    </div>
</template>
