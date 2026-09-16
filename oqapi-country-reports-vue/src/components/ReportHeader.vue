<script setup lang="ts">
import { computed } from 'vue';
import { prettifyTopic } from '../utils/helpers';
import ohsomeLogo from '../assets/images/ohsome-quality-api_2000px.png';

const props = defineProps<{
  selectedCountry: string;
  selectedTopic: string;
  countries: { value: string; label: string }[];
  topics: string[];
  // Split View picks topic per view-column instead of here - this stays
  // true for Single View (where there's just one column, so the header can
  // still drive it directly) and for the legacy iframe-2col embed (which
  // only ever has one map/topic regardless).
  showTopicSelector?: boolean;
  viewMode?: 'single' | 'split';
  showViewModeToggle?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:selectedCountry', value: string): void;
  (e: 'update:selectedTopic', value: string): void;
  (e: 'update:viewMode', value: 'single' | 'split'): void;
}>();

const prettyTopics = computed(() => {
  return props.topics.map(topic => ({
    value: topic,
    label: prettifyTopic(topic)
  }));
});
</script>

<template>
  <header class="header">
    <div class="header-title">
      <img :src="ohsomeLogo" alt="ohsome quality api" class="brand-logo" />
      <div class="brand-text">
        <strong>ohsome Country Quality Report</strong>
      </div>
    </div>

    <div class="header-selectors">
      <label class="field">
        <span>Country</span>
        <select
          id="country-select"
          :value="selectedCountry"
          @change="emit('update:selectedCountry', ($event.target as HTMLSelectElement).value)"
          class="country-select"
        >
          <option value="" disabled>Loading countries…</option>
          <option v-for="country in countries" :key="country.value" :value="country.value">
            {{ country.label }}
          </option>
        </select>
      </label>

      <div class="field" v-if="showTopicSelector">
        <span>Topic</span>
        <div class="topic-pills">
          <button
            v-for="topic in prettyTopics"
            :key="topic.value"
            type="button"
            class="pill"
            :class="{ active: topic.value === selectedTopic }"
            @click="emit('update:selectedTopic', topic.value)"
          >
            {{ topic.label }}
          </button>
        </div>
      </div>

      <div class="field" v-if="showViewModeToggle">
        <span>View</span>
        <div class="view-mode-toggle">
          <button type="button" class="pill" :class="{ active: viewMode === 'single' }" @click="emit('update:viewMode', 'single')">Single View</button>
          <button type="button" class="pill" :class="{ active: viewMode === 'split' }" @click="emit('update:viewMode', 'split')">Split View</button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  padding: 0.85rem 1.1rem;
  background: var(--paper-raised);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  border-radius: var(--radius);

  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.brand-logo {
  height: 2.6rem;
  width: auto;
  display: block;
}

.brand-text strong {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: 0.01em;
  color: var(--ink);
  display: block;
  line-height: 1.15;
}

.header-selectors {
  display: flex;
  gap: 1.25rem;
  align-items: center;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.field > span {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
  font-weight: 600;
  font-family: var(--font-body);
}

.country-select {
  font-family: var(--font-body);
  font-weight: 600;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--line-strong);
  background: var(--paper-raised);
  color: var(--ink);
  font-size: 0.875rem;
  min-width: 140px;
  border-radius: var(--radius);
}

.country-select:hover {
  border-color: var(--accent);
}

.topic-pills, .view-mode-toggle {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.pill {
  font-family: var(--font-body);
  border: 1px solid var(--line-strong);
  background: var(--paper-raised);
  color: var(--ink-soft);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.4rem 0.85rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  border-radius: var(--radius);
}
.pill:hover { border-color: var(--accent); color: var(--ink); }
.pill.active { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

@media (max-width: 768px) {
  .header {
    padding: 0.6rem 0.75rem;
    flex-direction: column;
    align-items: stretch;
  }

  .header-selectors {
    flex-direction: column;
    align-items: stretch;
    gap: 0.6rem;
  }

  .country-select {
    width: 100%;
  }
}
</style>
