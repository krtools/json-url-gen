import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  server: {
    open: true,
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
});
