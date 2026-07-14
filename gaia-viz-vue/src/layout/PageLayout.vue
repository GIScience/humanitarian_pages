<script setup lang="ts">
import { watchEffect } from "vue";
import Header from "@/components/Header.vue";
import Footer from "@/components/Footer.vue";

const DEFAULT_DESCRIPTION =
  "Visualizing risk potential of natural hazards using open humanitarian data.";

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    description?: string;
    image?: string;
    fullHeight?: boolean;
  }>(),
  {
    title: "Hazard Risk Dashboard",
    description: DEFAULT_DESCRIPTION,
    fullHeight: false,
  },
);

function setMetaTag(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

watchEffect(() => {
  const pageTitle = props.title;
  document.title = pageTitle;
  setMetaTag("name", "description", props.description);
  setMetaTag("property", "og:title", pageTitle);
  setMetaTag("property", "og:description", props.description);
  setMetaTag("property", "og:type", "website");
  setMetaTag("name", "twitter:card", "summary_large_image");
  setMetaTag("name", "twitter:title", pageTitle);
  setMetaTag("name", "twitter:description", props.description);

  if (props.image) {
    setMetaTag("property", "og:image", props.image);
    setMetaTag("name", "twitter:image", props.image);
  }
});
</script>

<template>
  <div
    class="flex flex-col bg-white"
    :class="fullHeight ? 'h-screen overflow-hidden' : 'min-h-screen'"
  >
    <!-- Maintenance Banner -->
    <div
      class="bg-amber-50 border-b border-amber-300 px-4 py-3 text-center text-sm text-amber-900 flex items-center justify-center gap-2 shrink-0"
    >
      <span class="text-lg">⚠️</span>
      <span>
        <strong>Service Temporarily Unavailable:</strong> The dashboard is
        currently unable to load data due to a CORS-related issue with the data
        source. We are working on a fix.
      </span>
    </div>
    <Header>
      <template v-if="$slots['header-actions']" #actions>
        <slot name="header-actions" />
      </template>
    </Header>
    <main
      class="flex-1"
      :class="fullHeight ? 'min-h-0 overflow-hidden flex flex-col' : ''"
    >
      <slot />
    </main>
    <Footer />
  </div>
</template>
