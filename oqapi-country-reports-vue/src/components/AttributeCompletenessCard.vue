<script setup lang="ts">
import { computed } from 'vue';

export interface AttributeOption {
  indicator: string;
  label: string;
  displayValue: string;
  ringPct: number;
  level: 'good' | 'warn' | 'bad' | 'neutral';
  description: string;
  disabled: boolean;
}

const props = defineProps<{
  options: AttributeOption[];
  selected: string;
  active: boolean;
  // True when every option has no data - the whole card is then shown but
  // not selectable, same treatment as an unavailable grid layer.
  disabled?: boolean;
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
    :class="{ active, disabled }"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled"
    @click="!disabled && emit('select', current?.indicator || selected)"
    @keydown.enter="!disabled && emit('select', current?.indicator || selected)"
    @keydown.space.prevent="!disabled && emit('select', current?.indicator || selected)"
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
        <span class="indicator-title">{{ $t('attributeCompleteness') }}</span>
        <select
          class="attribute-select"
          :value="selected"
          :disabled="disabled"
          @click.stop
          @change="emit('select', ($event.target as HTMLSelectElement).value)"
        >
          <!-- A variant with no data for every boundary is disabled on its
               own option, even when the group as a whole still has other,
               selectable variants (disabled only wholesale-disables the
               <select> itself, see the group-level `disabled` above for
               "every variant is empty"). -->
          <option v-for="opt in options" :key="opt.indicator" :value="opt.indicator" :disabled="opt.disabled">{{ opt.label }}</option>
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
/* Same treatment as an unavailable grid-layer pill (.layer-switch
   button:disabled in MainView.vue) - dashed border, muted text, not
   selectable, but still visible in the list rather than removed outright. */
.indicator-card.disabled {
  cursor: not-allowed;
  border-style: dashed;
  color: var(--disabled);
}
.indicator-card.disabled:hover { border-color: var(--line); }
.indicator-card.disabled .indicator-title { color: var(--disabled); }

.gaugewrap { flex: none; position: relative; width: 4.6rem; height: 4.6rem; }
.gaugewrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-track { fill: none; stroke: var(--line); stroke-width: 8; }
.ring-value { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 0.5s ease; }
.ring-value.level-good { stroke: var(--good); }
.ring-value.level-warn { stroke: var(--warn); }
.ring-value.level-bad { stroke: var(--bad); }
.ring-value.level-neutral { stroke: var(--disabled); }

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
