import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    // Tüm dosyalar aynı test veritabanını kullandığı için sırayla çalışır.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
