import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC conserve les métadonnées de décorateurs nécessaires à l'injection de NestJS.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
  },
});
