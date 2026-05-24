import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '.env.test' });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
