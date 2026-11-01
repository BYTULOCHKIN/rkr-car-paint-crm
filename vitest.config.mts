import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['src/features/crm/tests/**/*.test.tsx'],
    setupFiles: ['src/features/crm/tests/setup.ts'],
    maxWorkers: 1
  }
});
