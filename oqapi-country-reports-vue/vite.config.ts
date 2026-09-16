import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Use env var for local override, otherwise default to GH Pages path
const base = process.env.VITE_BASE_URL || '/osm-quality-country-reports/'

export default defineConfig({
  base,
  plugins: [vue()],
  build: {
    outDir: 'dist',
  }
})
