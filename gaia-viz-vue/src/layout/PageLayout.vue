<script setup lang="ts">
import { watchEffect } from 'vue';
import Header from '@/components/Header.vue';
import Footer from '@/components/Footer.vue';

const SITE_NAME = '';
const DEFAULT_DESCRIPTION = 'Visualizing risk potential of natural hazards using open humanitarian data.';

const props = withDefaults(defineProps<{
    title?: string;
    subtitle?: string;
    description?: string;
    image?: string;
}>(), {
    title: 'Hazard Risk Dashboard',
    description: DEFAULT_DESCRIPTION,
});

function setMetaTag(attr: 'name' | 'property', key: string, content: string) {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

watchEffect(() => {
    const pageTitle = props.title

    document.title = pageTitle;

    setMetaTag('name', 'description', props.description);
    setMetaTag('property', 'og:title', pageTitle);
    setMetaTag('property', 'og:description', props.description);
    setMetaTag('property', 'og:type', 'website');
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', pageTitle);
    setMetaTag('name', 'twitter:description', props.description);

    if (props.image) {
        setMetaTag('property', 'og:image', props.image);
        setMetaTag('name', 'twitter:image', props.image);
    }
});
</script>

<template>
    <div class="flex flex-col min-h-screen bg-white">
        <Header />
        <main class="flex-1">
            <slot />
        </main>
        <Footer />
    </div>
</template>
