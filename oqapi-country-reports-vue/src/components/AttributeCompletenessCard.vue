<script setup lang="ts">
import { computed } from 'vue';

export interface AttributeOption {
  indicator: string;
  label: string;
  displayValue: string;
  ringPct: number;
  level: 'good' | 'warn' | 'bad';
  description: string;
}

const props = defineProps<{
  options: AttributeOption[];
  selected: string;
  active: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', indicator: string): void;
}>();

const RADIUS = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const current = computed(() => props.options.find(o => o.indicator === props.selected) || props.options[0]);
const dashOffset = computed(() => {
  const pct = current.value ? Math.max(0, Math.min(100, current.value.ringPct)) : 0;
  return CIRCUMFERENCE * (1 - pct / 100);
});

</script>

<template>
  <article
    class="indicator-card attribute-card"
    :class="{ active }"
    role="button"
    tabindex="0"
    @click="emit('select', current?.indicator || selected)"
    @keydown.enter="emit('select', current?.indicator || selected)"
    @keydown.space.prevent="emit('select', current?.indicator || selected)"
  >
    <div class="gaugewrap">
      <svg viewBox="0 0 72 72">
        <circle class="ring-track" cx="36" cy="36" r="30" />
        <circle
          v-if="current"
          class="ring-value"
          :class="'level-' + current.level"
          cx="36" cy="36" r="30"
          :stroke-dasharray="CIRCUMFERENCE.toFixed(1)"
          :stroke-dashoffset="dashOffset.toFixed(1)"
        />
      </svg>
      <div class="gauge-pct">{{ current?.displayValue || '—' }}</div>
    </div>
    <div class="indicator-body">
      <div class="indicator-title-row">
        <span class="indicator-title">Attribute Completeness</span>
        <select
          class="attribute-select"
          :value="selected"
          @click.stop
          @change="emit('select', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in options" :key="opt.indicator" :value="opt.indicator">{{ opt.label }}</option>
        </select>
      </div>
    </div>
  </article>
</template>

<style scoped>
.indicator-card {
  background: var(--paper-raised);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  border-radius: var(--radius);
  padding: 1rem 1.1rem;
  display: flex;
  gap: 1rem;
  align-items: center;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.indicator-card:hover { border-color: var(--line-strong); }
.indicator-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), var(--shadow); }
.indicator-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.gaugewrap { flex: none; position: relative; width: 4.6rem; height: 4.6rem; }
.gaugewrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-track { fill: none; stroke: var(--line); stroke-width: 8; }
.ring-value { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 0.5s ease; }
.ring-value.level-good { stroke: var(--good); }
.ring-value.level-warn { stroke: var(--warn); }
.ring-value.level-bad { stroke: var(--bad); }

.gauge-pct {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-weight: 600; font-size: 0.95rem;
  color: var(--ink);
}

.indicator-body { flex: 1; min-width: 0; }
.indicator-title-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.3rem;
}
.indicator-title { font-size: 0.9rem; font-weight: 700; color: var(--ink); }
.attribute-select {
  font-family: var(--font-body);
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  padding: 0.2rem 0.45rem;
  border-radius: var(--radius);
}
</style>
