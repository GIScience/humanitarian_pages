import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * Tracks which section id is currently "active" as the user scrolls, and
 * exposes a smooth scrollTo(id) for click navigation from the sidebar.
 *
 * Active detection uses a thin horizontal band near the top third of the
 * viewport (rootMargin). Whichever observed section overlaps that band,
 * earliest in document order, wins.
 */
export function useScrollSpy(ids: string[], opts: { rootMargin?: string } = {}) {
  const activeId = ref<string | null>(ids[0] ?? null);
  const intersecting = new Set<string>();
  let observer: IntersectionObserver | null = null;

  function recompute() {
    for (const id of ids) {
      if (intersecting.has(id)) {
        activeId.value = id;
        return;
      }
    }
  }

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) intersecting.add(e.target.id);
          else intersecting.delete(e.target.id);
        }
        recompute();
      },
      { rootMargin: opts.rootMargin ?? "-35% 0px -55% 0px", threshold: 0 }
    );
    // Wait a frame so target elements are mounted before observing.
    requestAnimationFrame(() => {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) observer!.observe(el);
      }
    });
  });

  onBeforeUnmount(() => observer?.disconnect());

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    activeId.value = id;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  return { activeId, scrollTo };
}