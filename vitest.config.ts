import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { haptick: fileURLToPath(new URL('./src/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['test/**/*.test.ts', 'test/**/*.test.tsx'] },
});
