import { ref, watchEffect, onScopeDispose, toValue, type MaybeRefOrGetter } from "vue";
import yaml from "js-yaml";

interface MarkdownFile {
  id: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

const modules = import.meta.glob("/src/content/**/*.md", {
  query: "?raw",
  import: "default",
});

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, content: raw };

  const [, rawFrontmatter, content] = match;
  const parsed = yaml.load(rawFrontmatter);
  return {
    frontmatter: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {},
    content,
  };
}

export function useMarkdownFile(folder: string, id: MaybeRefOrGetter<string>) {
  const file = ref<MarkdownFile | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let cancelled = false;

  onScopeDispose(() => {
    cancelled = true;
  });

  watchEffect(async () => {
    const currentId = toValue(id);
    loading.value = true;
    error.value = null;

    try {
      const path = `/src/content/${folder}/${currentId}.md`;

      if (!modules[path]) {
        throw new Error(`File not found: ${path}`);
      }

      const raw = (await modules[path]()) as string;

      if (cancelled) return;
      const { frontmatter, content } = parseFrontmatter(raw);
      file.value = { id: currentId, content, frontmatter };
    } catch (e) {
      if (cancelled) return;
      error.value = e instanceof Error ? e.message : "Failed to load file";
    } finally {
      if (!cancelled) {
        loading.value = false;
      }
    }
  });

  return { file, loading, error };
}
