import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    globalSetup: ['./tests/globalSetup.js'],
    include: ['tests/**/*.test.js'],
    // Files share one database; run them one at a time so leaderboard/rank assertions stay deterministic.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
