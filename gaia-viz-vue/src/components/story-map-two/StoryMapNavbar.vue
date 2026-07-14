<script setup lang="ts">
import { computed } from "vue";
import type { SidebarStep } from "@/types/story-map";
import RichText from "./RichText.vue";

const props = defineProps<{ steps: SidebarStep[]; activeId: string | null }>();
const emit = defineEmits<{ (e: "select", sectionRef: string): void }>();

const activeIndex = computed(() => {
  const i = props.steps.findIndex((s) => s.sectionRef === props.activeId);
  return i === -1 ? 0 : i;
});

function state(i: number): "done" | "active" | "todo" {
  if (i < activeIndex.value) return "done";
  if (i === activeIndex.value) return "active";
  return "todo";
}
</script>

<template>
  <nav aria-label="Story steps">
    <ol>
      <li v-for="(step, i) in steps" :key="step.sectionRef" class="flex gap-3">
        <!-- rail: badge + connector -->
        <div class="flex flex-col items-center">
          <button
            type="button"
            @click="emit('select', step.sectionRef)"
            :aria-current="state(i) === 'active' ? 'step' : undefined"
            class="flex h-7 w-7 flex-none items-center justify-center rounded-full border text-xs font-semibold transition-colors"
            :class="
              state(i) === 'todo'
                ? 'border-gray-300 bg-white text-gray-400'
                : 'border-heigit-red bg-heigit-red text-white'
            "
          >
            {{ step.number }}
          </button>
          <div
            v-if="i < steps.length - 1"
            class="w-px flex-1 transition-colors"
            :class="i < activeIndex ? 'bg-heigit-red' : 'bg-gray-200'"
          />
        </div>

        <button
          type="button"
          class="pb-6 text-left"
          @click="emit('select', step.sectionRef)"
        >
          <h3
            class="text-base font-semibold transition-colors"
            :class="state(i) === 'active' ? 'text-heigit-red' : 'text-gray-900'"
          >
            {{ step.title }}
          </h3>
          <RichText
            class="mt-1 text-sm leading-relaxed text-gray-500"
            :text="step.body"
          />
        </button>
      </li>
    </ol>
  </nav>
</template>
