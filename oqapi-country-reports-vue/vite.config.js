import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// Use env var for local override, otherwise default to GH Pages path
var base = process.env.VITE_BASE_URL || '/humanitarian_pages/oqapi-country-report/';
export default defineConfig({
    base: base,
    plugins: [vue()],
    // vue-i18n's esm-bundler build expects these to be replaced at build time.
    define: {
        __VUE_I18N_FULL_INSTALL__: true,
        __VUE_I18N_LEGACY_API__: false,
        __INTLIFY_PROD_DEVTOOLS__: false,
    },
    build: {
        outDir: 'dist',
    }
});
