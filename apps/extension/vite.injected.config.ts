import path from 'node:path';
import { defineConfig } from 'vite';

const injectedEntries = {
  'amis-bridge': {
    name: 'VcsAmisBridge',
    source: 'src/integrations/amis/amis-bridge.ts',
  },
  'amis-page-hook': {
    name: 'VcsAmisPageHook',
    source: 'src/integrations/amis/amis-page-hook.ts',
  },
} as const;

export default defineConfig(({ mode }) => {
  const entry = injectedEntries[mode as keyof typeof injectedEntries];
  if (!entry) {
    throw new Error(`Unsupported injected AMIS entry: ${mode}`);
  }

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@interview-assistant/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(__dirname, entry.source),
        output: {
          format: 'iife',
          name: entry.name,
          inlineDynamicImports: true,
          entryFileNames: `assets/${mode}.js`,
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  };
});
