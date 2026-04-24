<script setup lang="ts">
const props = defineProps<{
  isMobile?: boolean;
}>();
</script>

<template>
  <a 
    href="https://heigit.org" 
    target="_blank" 
    class="absolute z-40 bg-white/70 backdrop-blur-md border border-slate-200 p-0 rounded-2xl shadow-2xl hover:bg-white transition-all group"
    :class="props.isMobile ? 'bottom-12 right-3' : 'bottom-12 right-3'"
    title="Powered by HeiGIT"
  >
    <img 
      src="https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/logos/heigit-logo-text.svg" 
      alt="HeiGIT Logo"
      class="w-auto opacity-90 group-hover:opacity-100 transition-opacity"
      :class="props.isMobile ? 'h-12' : 'h-20'"
    >
  </a>
</template>