<script setup lang="ts">
import { header, introHtml, methodology, method, limitationsTitle, limitations, resources, contact } from '@/content/resources.json';

defineEmits<{
  (e: 'close'): void;
}>();

const openLink = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');
</script>


<template>
  <v-dialog :model-value="true" max-width="54rem" @update:model-value="$emit('close')">
    <v-sheet rounded="2xl" class="overflow-hidden flex flex-col max-h-[90vh]">
      <div>
        <div class="flex items-center justify-between px-8 py-5 bg-white z-10 shrink-0">
          <div>
            <h2 class="text-2xl font-extrabold text-slate-900 tracking-tight">{{ header.title }}</h2>
            <p class="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">{{ header.subtitle }}</p>
          </div>
          <v-btn icon="mdi-close" class="hover:bg-heigit-red-light hover:text-heigit-red cursor-pointer" variant="text" density="comfortable" @click="$emit('close')" />
        </div>
      </div>
      <v-divider />
      <div class="overflow-y-auto px-8 py-8 space-y-10 text-slate-600 leading-relaxed scroll-smooth custom-scrollbar">
        <section class="prose max-w-none">
          <p class="text-lg leading-relaxed text-slate-700" v-html="introHtml" />

          <div
            class="not-prose mt-6 bg-red-50 p-5 rounded-xl border border-red-100 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h4 class="font-bold text-red-900 text-sm uppercase tracking-wider">{{ methodology.title }}</h4>
              <p class="text-sm text-red-700 mt-1">{{ methodology.description }}</p>
            </div>
            <button
              @click="openLink(methodology.link)"
              class="shrink-0 px-4 py-2 bg-heigit-red hover:bg-red-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2">
              {{ methodology.buttonText }}
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>
        </section>

        <hr class="border-slate-200" />

        <section>
          <div class="flex items-center gap-2 mb-4">
            <div class="size-8 flex items-center justify-center bg-slate-100 rounded-lg text-slate-600">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.447-.894L15 7m0 13V7" />
              </svg>
            </div>
            <h3 class="text-xl font-bold text-slate-900">{{ method.title }}</h3>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

            <p v-for="(paragraph, i) in method.paragraphs" :key="`method-p-${i}`">
              {{ paragraph }}
            </p>
            <ul class="space-y-2 mt-2 col-span-1 lg:col-span-2">
              <li v-for="(point, i) in method.points" :key="`method-point-${i}`" class="flex items-start gap-2 text-sm">
                <span class="text-heigit-red mt">●</span>
                <span><strong>{{ point.title }}:</strong> {{ point.description }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="bg-amber-50 rounded-xl p-6 border border-amber-100">
          <h3 class="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {{ limitationsTitle }}
          </h3>
          <ul class="space-y-2 text-sm text-amber-900/80 list-disc pl-5">
            <li v-for="(limitation, i) in limitations" :key="`lim-${i}`">
              <strong>{{ limitation.title }}:</strong> {{ limitation.description }}
            </li>
          </ul>
        </section>

        <section>
          <h3 class="text-xl font-bold text-slate-900 mb-4">{{ resources.title }}</h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a v-for="(resource, i) in resources.items" :key="`res-${i}`" :href="resource.link" target="_blank"
              class="group block p-4 rounded-lg border border-slate-200 hover:border-heigit-red transition-colors bg-slate-50">
              <h4 class="font-bold text-slate-800 text-sm group-hover:text-heigit-red transition-colors">
                {{ resource.title }}
              </h4>
              <p class="text-xs text-slate-500 mt-2">
                {{ resource.description }}
              </p>
            </a>
          </div>
        </section>
      </div>
      <div class="bg-slate-50 border-t border-slate-200 p-6 shrink-0">
        <p class="text-sm text-center text-slate-500">
          {{ contact.message }} <a :href="`mailto:${contact.email}`"
            class="text-heigit-red hover:underline font-bold">{{ contact.email }}</a>
        </p>
      </div>

    </v-sheet>
  </v-dialog>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
