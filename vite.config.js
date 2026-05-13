import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: false,
    allowedHosts: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  base: './'
});
