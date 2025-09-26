import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        overlay: path.resolve(__dirname, 'src/renderer/overlay.html'),
        settings: path.resolve(__dirname, 'src/renderer/settings.html')
      }
    },
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});