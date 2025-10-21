import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [],
  base: './',
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        overlay: path.resolve(__dirname, 'src/renderer/overlay.html')
      }
    },
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});