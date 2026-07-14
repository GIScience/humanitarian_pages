import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/** Toggles `revealed` when an element scrolls into view. Respects reduced motion. */
export function useReveal(
  el: Ref<HTMLElement | null>,
  opts: { threshold?: number; repeat?: boolean } = {}
) {
  const revealed = ref(false);
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !el.value) {
      revealed.value = true;
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            revealed.value = true;
            if (!opts.repeat) observer?.unobserve(e.target);
          } else if (opts.repeat) {
            revealed.value = false;
          }
        }
      },
      { threshold: opts.threshold ?? 0.15 }
    );
    observer.observe(el.value);
  });

  onBeforeUnmount(() => observer?.disconnect());
  return { revealed };
}