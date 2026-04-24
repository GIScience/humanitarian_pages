<script setup lang="ts">
const props = defineProps<{
  isMobile?: boolean;
}>();

const year = new Date().getFullYear();
</script>

<template>
  <footer class="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-3 flex flex-row justify-between items-center z-50 whitespace-nowrap overflow-x-auto scrollbar-hide shrink-0"
           :class="props.isMobile ? 'px-2 text-[10px]' : 'px-6 text-xs'">
    <div class="flex gap-4" :class="props.isMobile ? 'gap-2' : 'gap-4'">
      <a href="https://heigit.org/contact/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider">Contact</a>
      <a href="https://heigit.org/privacy-policy/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider">{{ props.isMobile ? 'Privacy' : 'Privacy Policy' }}</a>
      <a href="https://heigit.org/imprint/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider">Imprint</a>
    </div>
    <div class="font-bold tracking-wider" :class="props.isMobile ? 'ml-2' : 'ml-4'">
      {{ year }} &copy; {{ props.isMobile ? 'HeiGIT' : 'HeiGIT gGmbH' }}
    </div>
  </footer>
</template>
