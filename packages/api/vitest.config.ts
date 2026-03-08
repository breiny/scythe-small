import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@api': path.resolve(__dirname, './src'),
      '@scythe/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // db/ wiring, app entry point, and env loader are integration/infra concerns
      exclude: [
        'src/db/**',
        'src/index.ts',
        'src/env.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
