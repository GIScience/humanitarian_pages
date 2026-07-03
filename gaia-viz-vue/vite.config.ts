import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import Markdown from 'unplugin-vue-markdown/vite'

export default defineConfig({
  // This ensures assets (JS/CSS) load from the correct subfolder
  base: "/humanitarian_pages/gaia-dashboard/",
  plugins: [
    vue({
      include: [/\.vue$/, /\.md$/], // treats .md files as Vue components
    }),
    Markdown({
      markdownItOptions: {
        html: true,
        linkify: true,
        typographer: true
      }
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
