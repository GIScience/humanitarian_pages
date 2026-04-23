<script setup lang="ts">
// Define the constant here so it is available to the template
const year = new Date().getFullYear();
</script>

<template>
  <footer class="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-3 px-6 flex flex-row justify-between items-center text-xs text-slate-500 dark:text-slate-400 z-50 whitespace-nowrap overflow-x-auto scrollbar-hide shrink-0">
    <div class="flex gap-4">
      <a href="https://heigit.org/contact/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider">Contact</a>
      <a href="https://heigit.org/privacy-policy/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase wider">Privacy Policy</a>
      <a href="https://heigit.org/imprint/" target="_blank" class="hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-bold uppercase tracking-wider">Imprint</a>
    </div>
    <div class="font-bold tracking-wider ml-4">
      {{ year }} &copy; HeiGIT gGmbH
    </div>
  </footer>
</template>
