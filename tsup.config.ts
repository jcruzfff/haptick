import { defineConfig } from 'tsup';

const shared = {
  format: ['esm', 'cjs'] as const,
  dts: true,
  sourcemap: true,
  target: 'es2020',
};

export default defineConfig([
  { ...shared, entry: { index: 'src/index.ts' }, clean: true },
  {
    ...shared,
    entry: { react: 'src/react/index.ts' },
    external: ['react', 'haptick'],
    // React Server Components: hooks only run in client components.
    banner: { js: "'use client';" },
  },
]);
