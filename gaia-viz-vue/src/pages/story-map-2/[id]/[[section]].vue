<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import PageLayout from "@/layout/PageLayout.vue";
import { useMarkdownFile } from "@/composables/useMarkdownFile";
import type { StorySection } from "@/components/story-map/StoryMapNavbar.vue";

const route = useRoute();
const router = useRouter();

const { file: metaFile } = useMarkdownFile(
  "story-maps",
  () => route.params.id as string,
);
const pageTitle = computed(
  () => metaFile.value?.frontmatter.title as string | undefined,
);
const pageDescription = computed(
  () => metaFile.value?.frontmatter.subtitle as string | undefined,
);

const contentComponent = shallowRef<any>(null);
const contentRef = ref<HTMLElement | null>(null);
const heroRef = ref<{ $el: HTMLElement } | null>(null);
const notFound = ref(false);
const progress = ref(0);

const sections = ref<StorySection[]>([]);
const activeId = ref("");

const contentModules = import.meta.glob("/src/content/story-maps/*.md");

let revealObserver: IntersectionObserver | null = null;
let sectionObserver: IntersectionObserver | null = null;

const slugify = (text: string) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
};

const teardownObservers = () => {
  revealObserver?.disconnect();
  sectionObserver?.disconnect();
  revealObserver = null;
  sectionObserver = null;
};

const setupObservers = () => {
  teardownObservers();
  if (!contentRef.value) return;

  const headings = Array.from(
    contentRef.value.querySelectorAll("h2, h3"),
  ) as HTMLElement[];
  const used = new Set<string>();

  sections.value = headings.map((el) => {
    const base = el.id || slugify(el.textContent || "");
    let unique = base || "section";
    let i = 1;
    while (used.has(unique)) unique = `${base}-${i++}`;
    used.add(unique);
    el.id = unique;
    return {
      id: unique,
      text: el.textContent || "",
      level: el.tagName === "H2" ? 2 : 3,
    };
  });
  activeId.value = "";

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const revealTargets = Array.from(contentRef.value.children).filter(
    (el) =>
      !(el as HTMLElement).dataset ||
      (el as HTMLElement).dataset.noReveal === undefined,
  ) as HTMLElement[];

  revealTargets.forEach((el) =>
    el.classList.add(
      "opacity-0",
      "translate-y-7",
      "transition-all",
      "duration-700",
      "ease-out",
    ),
  );

  if (prefersReducedMotion) {
    revealTargets.forEach((el) =>
      el.classList.remove("opacity-0", "translate-y-7"),
    );
  } else {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove("opacity-0", "translate-y-7");
            revealObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" },
    );
    revealTargets.forEach((el) => revealObserver!.observe(el));
  }

  const heroEl = heroRef.value?.$el as HTMLElement | undefined;

  if (headings.length || heroEl) {
    sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            activeId.value =
              entry.target === heroEl ? "" : (entry.target as HTMLElement).id;
          }
        });
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => sectionObserver!.observe(h));
    if (heroEl) sectionObserver.observe(heroEl);
  }
};

const scrollToSection = (id: string, behavior: ScrollBehavior = "smooth") => {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 96;
  window.scrollTo({ top, behavior });
};

const onSelectSection = (id: string) => {
  activeId.value = id;
  scrollToSection(id);
};

const loadContent = async (id: string) => {
  teardownObservers();
  contentComponent.value = null;
  sections.value = [];
  activeId.value = "";
  notFound.value = false;

  const initialSection = (route.params.section as string) || "";
  if (!initialSection) window.scrollTo({ top: 0 });

  try {
    const loader = contentModules[`/src/content/story-maps/${id}.md`];
    if (!loader) throw new Error(`Story map not found: ${id}`);
    const mod = (await loader()) as { default: unknown };
    contentComponent.value = mod.default;
    await nextTick();
    setupObservers();

    if (initialSection && document.getElementById(initialSection)) {
      activeId.value = initialSection;
      scrollToSection(initialSection, "auto");
    }
  } catch (err) {
    console.error(`Story map not found: ${id}`, err);
    notFound.value = true;
  }
};

const onScroll = () => {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - doc.clientHeight;
  progress.value =
    scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0;
};

window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  teardownObservers();
});

watch(
  () => route.params.id,
  (id) => loadContent(id as string),
  { immediate: true },
);

watch(activeId, (id) => {
  if (route.params.section === id) return;

  if (id) {
    router.replace({
      name: "/story-map/[id]/[[section]]",
      params: { id: route.params.id, section: id },
    });
  } else {
    router.replace({
      name: "/story-map/[id]/[[section]]",
      params: { id: route.params.id },
    });
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" :description="pageDescription">
    <div class="relative">
      <div class="fixed left-0 right-0 top-0 z-[70] h-1 bg-slate-100">
        <div
          class="h-full bg-gradient-to-r from-heigit-red to-heigit-red-dark transition-[width] duration-150 ease-out"
          :style="{ width: progress + '%' }"
        ></div>
      </div>
      <div
        v-if="notFound"
        class="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6 lg:px-8"
      >
        <h1 class="text-2xl font-extrabold text-slate-900">
          Story map not found
        </h1>
        <p class="mt-2 text-slate-500">
          We couldn't find a story map for "{{ route.params.id }}".
        </p>
      </div>

      <div v-else class="w-full">
        <StoryMapHero ref="heroRef" :id="route.params.id as string" />

        <StoryMapNavbar
          :sections="sections"
          :active-id="activeId"
          @select="onSelectSection"
        />

        <div
          ref="contentRef"
          class="story-content max-w-[1400px] mx-auto pb-24 pt-8 sm:px-6"
        >
          <component :is="contentComponent" v-if="contentComponent" />
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.story-content :deep(h2) {
  @apply mt-16 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl;
}

.story-content :deep(h2:first-child) {
  @apply mt-0;
}

.story-content :deep(h3) {
  @apply mt-9 text-xl font-bold text-slate-900;
}

.story-content :deep(p) {
  @apply mt-5 text-[17px] leading-8 text-slate-600;
}

.story-content :deep(ul) {
  @apply mt-5 list-disc pl-6 leading-8 text-slate-600 marker:text-heigit-red;
}

.story-content :deep(ol) {
  @apply mt-5 list-decimal pl-6 leading-8 text-slate-600 marker:text-heigit-red marker:font-bold;
}

.story-content :deep(li + li) {
  @apply mt-2;
}

.story-content :deep(strong) {
  @apply font-bold text-slate-900;
}

.story-content :deep(a) {
  @apply font-semibold text-heigit-red underline decoration-transparent transition-colors hover:decoration-current;
}

.story-content :deep(blockquote) {
  @apply mt-5 border-l-2 border-heigit-red pl-5 italic text-slate-900;
}

.story-content :deep(img) {
  @apply mt-6 w-full rounded-2xl;
}
</style>
