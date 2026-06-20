import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@interview-assistant/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@interview-assistant/shared'],
  },
  server: {
    port: 4000,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        proxyTimeout: 360000,
        timeout: 360000,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3002',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
