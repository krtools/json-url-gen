import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  base: process.env.CI ? '/json-url-gen/' : '/',
  server: {
    open: true,
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
});
