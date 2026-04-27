import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3200,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3000',
      '/mcp': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
