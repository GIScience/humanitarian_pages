<script setup lang="ts">
defineEmits<{
  (e: "close"): void;
  (e: "use-custom"): void;
  (e: "use-default"): void;
}>();
</script>

<template>
  <v-dialog
    :model-value="true"
    max-width="30rem"
    @update:model-value="$emit('close')"
  >
    <v-sheet rounded="xl" class="overflow-hidden">
      <div class="px-7 pt-6 pb-2 flex items-start justify-between">
        <div class="flex items-center gap-3">
          <div
            class="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0"
          >
            <v-icon icon="mdi-database-check-outline" class="text-amber-600" />
          </div>
          <h2 class="text-lg font-bold text-slate-900 tracking-tight">
            Custom Indicator Data found
          </h2>
        </div>
      </div>

      <div class="px-7 pb-6">
        <p class="text-sm text-slate-600 leading-relaxed">
          You've previously uploaded a custom dataset. Would you like to keep
          working with it, or switch back to the default HeiGIT data?
        </p>

        <div class="flex flex-col-reverse sm:flex-row gap-3 mt-6">
          <v-btn
            variant="tonal"
            class="flex-1 normal-case border-2 border-slate-300 text-slate-700 font-semibold shadow-none"
            rounded="lg"
            @click="$emit('use-default')"
          >
            Use HeiGIT default
          </v-btn>
          <v-btn
            color="heigit-red"
            variant="flat"
            class="flex-1 normal-case text-white font-semibold hover:bg-heigit-red/90"
            rounded="lg"
            @click="$emit('use-custom')"
          >
            Continue with custom data
          </v-btn>
        </div>
      </div>
    </v-sheet>
  </v-dialog>
</template>
