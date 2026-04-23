<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-2 md:py-3 px-4 md:px-6 flex flex-row justify-between items-center text-xs text-slate-500 dark:text-slate-400 z-50 whitespace-nowrap overflow-x-auto scrollbar-hide shrink-0 h-10 md:h-auto">
    <div class="flex gap-2 md:gap-4">
      <a href="https://heigit.org/contact/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider text-[10px] md:text-xs">Contact</a>
      <a href="https://heigit.org/privacy-policy/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase wider text-[10px] md:text-xs">Privacy Policy</a>
      <a href="https://heigit.org/imprint/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider text-[10px] md:text-xs">Imprint</a>
    </div>
    <div class="font-bold tracking-wider ml-2 md:ml-4 text-[10px] md:text-xs">
      {{ year }} &copy; HeiGIT gGmbH
    </div>
  </footer>
</template>
