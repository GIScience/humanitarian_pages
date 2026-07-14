<script setup lang="ts">
import { computed } from "vue";
import type { StoryMapConfig } from "@/types/story-map";
import { useScrollSpy } from "@/composables/useScrollSpy";
import StoryMapNavbar from "./StoryMapNavbar.vue";
import StorySection from "./StorySection.vue";
import StoryCallouts from "./StoryCallouts.vue";
import Icon from "./Icon.vue";

const props = defineProps<{ config: StoryMapConfig }>();
const sm = computed(() => props.config.storyMap);

const { activeId, scrollTo } = useScrollSpy(
  props.config.storyMap.sections.map((s) => s.id),
);
</script>

<template>
  <div class="px-4 py-6">
    <div class="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <!-- sidebar -->
      <aside class="lg:w-[23rem] lg:flex-none">
        <div class="lg:sticky lg:top-24 p-6">
          <div class="mb-5 flex items-start gap-3">
            <span class="mt-0.5 text-heigit-red"
              ><Icon name="waves" class="h-7 w-7"
            /></span>
            <div>
              <h1 class="text-xl font-bold leading-tight text-gray-900">
                {{ sm.sidebar.title }}
              </h1>
              <p class="mt-1 text-sm text-gray-500">
                {{ sm.sidebar.subtitle }}
              </p>
            </div>
          </div>

          <StoryMapNavbar
            :steps="sm.sidebar.steps"
            :active-id="activeId"
            @select="scrollTo"
          />

          <div class="mt-6 rounded-lg bg-red-50 p-4">
            <div
              class="flex items-center gap-2 text-sm font-semibold text-heigit-red"
            >
              <Icon name="info" class="h-4 w-4" />
              {{ sm.sidebar.aside.title }}
            </div>
            <p class="mt-1.5 text-xs leading-relaxed text-gray-600">
              {{ sm.sidebar.aside.body }}
            </p>
          </div>
        </div>
      </aside>

      <!-- main -->
      <main class="min-w-0 flex-1">
        <header class="rounded-xl border border-gray-200 bg-white p-6">
          <h2 class="text-lg font-bold text-gray-900">{{ sm.header.title }}</h2>
          <p class="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
            {{ sm.header.description }}
          </p>
          <!-- <StoryEquation class="mt-6" :terms="sm.header.equation.terms" /> -->
        </header>

        <div
          class="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white"
        >
          <StorySection
            v-for="section in sm.sections"
            :key="section.id"
            :section="section"
          >
          </StorySection>
        </div>

        <StoryCallouts class="mt-4" :callouts="config.footer.callouts" />
      </main>
    </div>
  </div>
</template>
