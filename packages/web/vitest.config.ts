import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@web': path.resolve(__dirname, './src'),
      '@scythe/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Entry point, pages (integration-level), and service worker are excluded
      // from unit coverage targets — they belong in E2E tests.
      exclude: [
        'src/main.tsx',
        'src/pages/**',
        'src/sw/**',
        'src/test/**',
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
});
