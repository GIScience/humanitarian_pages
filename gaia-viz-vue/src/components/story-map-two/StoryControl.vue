<script setup lang="ts">
import { ref } from "vue";
import type { Control, layerConfigType } from "@/types/story-map";
import Icon from "./Icon.vue";

const props = defineProps<{ control: Control }>();

const emit = defineEmits<{
  (e: "change-layer", config: layerConfigType): void;
}>();

const segValue = ref(
  props.control.type === "segmented"
    ? (props.control.options.find((o) => o.selected)?.value ??
        props.control.options[0]?.value)
    : "",
);

const sliderValue = ref(
  props.control.type === "slider" ? props.control.value : 0,
);

function handleSegChange(value: string) {
  segValue.value = value;

  if (props.control.type !== "segmented") return;

  // Find the selected option based on the value only if the control type is segmented
  const selectedOption = props.control.options.find((o) => o.value === value);
  if (!selectedOption?.layerConfig) return;

  emit("change-layer", selectedOption.layerConfig);
}
</script>

<template>
  <!-- segmented -->
  <div v-if="control.type === 'segmented'">
    <!-- card variant (icon options) -->
    <div v-if="control.variant === 'cards'" class="grid grid-cols-4 gap-2">
      <button
        v-for="opt in control.options"
        :key="opt.value"
        type="button"
        @click="segValue = opt.value"
        class="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors"
        :class="
          segValue === opt.value
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-200 text-gray-500 hover:border-gray-300'
        "
      >
        <Icon
          v-if="opt.icon"
          :name="opt.icon"
          class="h-5 w-5"
          :class="segValue === opt.value ? 'text-blue-600' : 'text-gray-400'"
        />
        <span class="text-xs font-medium leading-tight">{{ opt.label }}</span>
      </button>
    </div>

    <!-- pill variant -->
    <div
      v-else
      class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1"
    >
      <button
        v-for="opt in control.options"
        :key="opt.value"
        type="button"
        @click="handleSegChange(opt.value)"
        class="rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors"
        :class="
          segValue === opt.value
            ? 'bg-heigit-red text-white shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        "
      >
        {{ opt.label }}
      </button>
    </div>
  </div>

  <!-- slider -->
  <div v-else-if="control.type === 'slider'">
    <label class="text-xs text-gray-500">{{ control.label }}</label>
    <input
      type="range"
      :min="control.min"
      :max="control.max"
      v-model.number="sliderValue"
      class="story-range mt-3 w-full"
    />
    <div class="mt-1 flex justify-between">
      <span
        v-for="tick in control.ticks"
        :key="tick.value"
        class="text-xs"
        :class="
          sliderValue === tick.value
            ? 'font-semibold text-heigit-red'
            : 'text-gray-400'
        "
      >
        {{ tick.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.story-range {
  accent-color: var(--heigit-red);
  height: 4px;
  border-radius: 9999px;
}
</style>
