import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '.env.test' });

// Tests touch the Supabase DB via shared global state (db reset, ephemeral users).
// Serialize execution so files don't trample each other.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
    poolOptions: {
      forks: { singleFork: true },
    },
  } as any,
});
