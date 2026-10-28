import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), viteSingleFile()],
  // Tell Vite that Buffer/global/process are already provided by Electron's Node.js — no polyfills needed
  define: {
    'global': 'globalThis',
  },
  optimizeDeps: {
    exclude: ['jszip'],
  },
  build: {
    rollupOptions: {
      external: [],
      output: {
        globals: {
          Buffer: 'Buffer',
        },
      },
    },
  },
});
