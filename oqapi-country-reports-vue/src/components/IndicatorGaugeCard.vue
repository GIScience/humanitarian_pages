<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  title: string;
  displayValue: string;
  ringPct: number;
  level: 'good' | 'warn' | 'bad' | 'neutral';
  active: boolean;
  // 'people' (default) is the raw-count badge (e.g. User Activity) - shows
  // the count value inside the circle. 'tag' is for indicators that aren't
  // a count at all (e.g. Tag Distribution) - a plain icon, no number.
  icon?: 'people' | 'tag';
}>(), {
  icon: 'people'
});

defineEmits<{
  (e: 'click'): void;
}>();

const RADIUS = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const dashOffset = computed(() => CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, props.ringPct)) / 100));
</script>

<template>
  <article
    class="indicator-card"
    :class="{ active }"
    role="button"
    tabindex="0"
    @click="$emit('click')"
    @keydown.enter="$emit('click')"
    @keydown.space.prevent="$emit('click')"
  >
    <!-- A percentage ring implies a graded quality score, which doesn't apply
         to a raw count (see isNoQualityDescription in MainView.vue) - a
         people icon plus the number reads as "a count of something",
         not "a score out of 100" that happens to be empty. -->
    <div v-if="level === 'neutral'" class="count-badge">
      <svg v-if="icon === 'tag'" class="count-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20.59 13.41 11.83 4.65A2 2 0 0 0 10.41 4.06L4 4a1 1 0 0 0-1 1l.06 6.41a2 2 0 0 0 .59 1.42l8.76 8.76a2 2 0 0 0 2.82 0l5.36-5.36a2 2 0 0 0 0-2.82Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
        <circle cx="7.5" cy="8.5" r="1.15" fill="currentColor" />
      </svg>
      <svg v-else class="count-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="8.5" r="3" stroke="currentColor" stroke-width="1.6" />
        <path d="M3.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        <circle cx="16.5" cy="8" r="2.4" stroke="currentColor" stroke-width="1.6" />
        <path d="M14.7 13.7c2.7.4 4.8 2.4 4.8 5.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <div v-if="icon !== 'tag'" class="count-value">{{ displayValue }}</div>
    </div>
    <div v-else class="gaugewrap">
      <svg viewBox="0 0 72 72">
        <circle class="ring-track" cx="36" cy="36" r="30" />
        <circle
          class="ring-value"
          :class="'level-' + level"
          cx="36" cy="36" r="30"
          :stroke-dasharray="CIRCUMFERENCE.toFixed(1)"
          :stroke-dashoffset="dashOffset.toFixed(1)"
        />
      </svg>
      <div class="gauge-pct">{{ displayValue }}</div>
    </div>
    <div class="indicator-body">
      <div class="indicator-title-row">
        <div class="indicator-title">{{ title }}</div>
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
  cursor: pointer;
  text-align: left;
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
  text-align: center;
  padding: 0 0.3rem;
}

.count-badge {
  flex: none; width: 4.6rem; height: 4.6rem;
  border-radius: 50%; background: var(--line);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.15rem;
  color: var(--ink-soft);
}
.count-icon { width: 1.5rem; height: 1.5rem; }
/* Raw counts can run to 4-5 digits (vs. a 2-3 digit percentage) - shrink to fit. */
.count-value {
  font-family: var(--font-mono); font-weight: 700; font-size: 0.68rem;
  color: var(--ink); text-align: center; padding: 0 0.2rem; line-height: 1.1;
}

.indicator-body { flex: 1; min-width: 0; }
.indicator-title-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.indicator-title { font-size: 0.9rem; font-weight: 700; color: var(--ink); }
</style>
