import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // This ensures assets (JS/CSS) load from the correct subfolder
  base: '/humanitarian_pages/gaia-dashboard/', 
  plugins: [vue()],
  build: {
    outDir: 'dist', // Keep it standard for the action
  }
})
