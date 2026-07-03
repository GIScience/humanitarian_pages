import type { App } from "vue";

export function registerGlobalComponents(app: App) {
  const modules = import.meta.glob(
    [
      "@/views/story-map/components/*.vue",
      "@/components/**/*.vue"
    ],
    { eager: true }
  );

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