import type { App } from "vue";

// Register all components in the story-map folder as global components
export function registerGlobalComponents(app: App) {
  const modules = import.meta.glob(["@/components/story-map/*.vue"], { eager: true });

  for (const path in modules) {
    const componentName = path
      .split("/")
      .pop()
      ?.replace(/\.vue$/, "");

    if (componentName) {
      app.component(componentName, (modules[path] as any).default);
    }
  }
}