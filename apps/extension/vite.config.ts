import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'popup.html'),
        'side-panel': path.resolve(__dirname, 'side-panel.html'),
        background: path.resolve(__dirname, 'src/background.ts'),
        'amis-source-column': path.resolve(__dirname, 'src/amis-source-column.ts'),
        'amis-page-hook': path.resolve(__dirname, 'src/amis-page-hook.ts'),
        'amis-bridge': path.resolve(__dirname, 'src/amis-bridge.ts'),
        'frontend-bridge': path.resolve(__dirname, 'src/frontend-bridge.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
