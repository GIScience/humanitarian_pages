<script setup lang="ts">
defineEmits<{
  (e: "toggle"): void;
}>();

</script>

<template>
  <v-dialog
    :model-value="true"
    max-width="56rem"
    @update:model-value="$emit('toggle')"
  >
    <v-sheet rounded="2xl" class="overflow-hidden">
      <section>
        <div
          class="flex items-center justify-between px-8 py-5 bg-white z-10 shrink-0"
        >
          <div>
            <h2 class="text-2xl font-extrabold text-slate-900 tracking-tight">
              Metadata
            </h2>
            <p
              class="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1"
            >
              Information about the Indicator
            </p>
          </div>
          <v-btn
            icon="mdi-close"
            class="hover:bg-heigit-red hover:text-white"
            variant="text"
            density="comfortable"
            @click="$emit('toggle')"
          />
        </div>
      </section>
    </v-sheet>
  </v-dialog>
</template>

<style scoped></style>
