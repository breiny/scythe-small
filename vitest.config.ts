import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'packages/api/vitest.config.ts',
      'packages/web/vitest.config.ts',
    ],
  },
});
