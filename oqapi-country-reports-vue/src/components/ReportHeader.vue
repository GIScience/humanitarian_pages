<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  selectedCountry: string;
  selectedTopic: string;
  countries: { value: string; label: string }[];
  topics: string[];
}>();

const emit = defineEmits<{
  (e: 'update:selectedCountry', value: string): void;
  (e: 'update:selectedTopic', value: string): void;
}>();

function prettifyTopic(slug: string): string {
  if (!slug) return "";
  return slug
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
      <img src="https://dashboard.ohsome.org/en/assets/images/ohsome_narrow.svg" alt="ohsome" class="title-logo">
      <span> Country Quality Report</span>
    </div>

    <div class="header-selectors">
      <div class="selector-group horizontal">
        <label for="country-select">Select a Country</label>
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
      </div>

      <div class="selector-group horizontal">
        <label for="topic-select">Select a Topic</label>
        <select
          id="topic-select"
          :value="selectedTopic"
          @change="emit('update:selectedTopic', ($event.target as HTMLSelectElement).value)"
          class="country-select"
        >
          <option value="" disabled>Loading topics…</option>
          <option v-for="topic in prettyTopics" :key="topic.value" :value="topic.value">
            {{ topic.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="header-right">
    </div>
  </header>
</template>

<style scoped>
.header {
  padding: 0.5rem 1rem;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);

  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.header-title {
  text-align: left;
  justify-self: start;
  align-self: center;
  margin-left: 1.5rem;
  font-size: 1.5rem;
  font-weight: 900;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.title-logo {
  height: 40px;
  margin-right: 0.75rem;
}

.header-selectors {
  justify-content: center;
  display: flex;
  gap: 3.75rem;
  align-items: center;
}

.selector-group.horizontal {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
}

.selector-group.horizontal label {
  color: var(--color-text);
  font-family: var(--font-sans);
  font-weight: 800;
  font-size: 1rem;
  white-space: nowrap;
}

.country-select {
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: #fff;
  font-size: 0.875rem;
  min-width: 120px;
}

.country-select:hover {
  border-color: #aaa;
}

.header-right {
  display: flex;
  gap: 0.5rem;
}

.header-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 60px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: #fff;
  transition: background 0.15s ease, transform 0.05s ease;
  padding: 5px;
}

.header-logo img {
  max-width: 100%;
  max-height: 150%;
  object-fit: contain;
  display: block;
}

.header-logo:hover {
  background: #f3f3f3;
}

.header-logo:active {
  transform: translateY(1px);
}

@media (max-width: 768px) {
  .header {
    padding: 0.25rem 0.5rem;
    gap: 0.5rem;
    justify-content: center;
    flex-direction: column;
  }

  .header-title {
    margin-left: 0;
    font-size: 0.875rem;
    text-align: center;
    width: 100%;
    justify-content: center;
    margin-bottom: 0.5rem;
  }

  .title-logo {
    height: 24px;
    margin-right: 0.25rem;
  }

  .header-selectors {
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
  }

  .selector-group.horizontal {
    flex-direction: row;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
  }

  .selector-group.horizontal label {
    font-size: 0.75rem;
    min-width: 110px;
  }

  .country-select {
    width: 100%;
    min-width: unset;
    font-size: 0.75rem;
    padding: 0.25rem;
  }

  .header-right {
    display: none;
  }
}
</style>
