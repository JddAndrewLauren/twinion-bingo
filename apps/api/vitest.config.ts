import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Three suites now truncate every bingo table against the one throwaway
     * Postgres, and vitest runs files in parallel by default — so run them one
     * file at a time. Two suites truncating each other's rows mid-test is a
     * deadlock or a phantom failure, never a real one.
     */
    fileParallelism: false,
  },
});
