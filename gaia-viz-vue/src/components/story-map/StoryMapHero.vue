<script lang="ts" setup>
import { computed } from 'vue';
import { useMarkdownFile } from '@/composables/useMarkdownFile';

const DEFAULT_TITLE = 'Story Map';
const DEFAULT_SUBTITLE = 'An interactive walkthrough of how HeiGIT quantifies humanitarian risk.';

const props = withDefaults(defineProps<{
    id?: string;
    title?: string;
    subtitle?: string;
}>(), {
    id: 'vulnerability',
});

const { file } = useMarkdownFile('story-maps', () => props.id);

const title = computed(() => props.title ?? (file.value?.frontmatter.title as string | undefined) ?? DEFAULT_TITLE);
const subtitle = computed(() => props.subtitle ?? (file.value?.frontmatter.subtitle as string | undefined) ?? DEFAULT_SUBTITLE);
</script>

<template>
    <section
        class="relative flex h-[calc(100vh-4rem)] w-full items-center justify-center  bg-slate-900  overflow-hidden">
        <div class="absolute inset-0 z-10 flex flex-col items-center justify-center text-center text-white">
            <h1 class="mb-4 text-4xl font-bold sm:text-5xl md:text-6xl text-white">{{ title }}</h1>
            <p class="max-w-xl text-lg sm:text-xl md:text-2xl text-white">{{ subtitle }}</p>
        </div>
        <img src="@/assets/floods.jpg" alt="Story Map Hero"
            class="absolute inset-0 h-full w-full object-cover opacity-50" />

    </section>

</template>
