import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import Markdown from "unplugin-vue-markdown/vite";
import VueRouter from "unplugin-vue-router/vite";
import vuetify from "vite-plugin-vuetify";

export default defineConfig({
  // This ensures assets (JS/CSS) load from the correct subfolder
  base: "/humanitarian_pages/gaia-dashboard/",
  plugins: [
    vue({
      include: [/\.vue$/, /\.md$/], // treats .md files as Vue components
    }),
    VueRouter(),
    vuetify({ autoImport: true }),
    Markdown({
      markdownItOptions: {
        html: true,
        linkify: true,
        typographer: true,
      },
    }),
  ],
  build: {
    outDir: "dist", // Keep it standard for the action
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
