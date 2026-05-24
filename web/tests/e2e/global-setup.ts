// web/tests/e2e/global-setup.ts
// Resets the local Supabase DB before any Playwright tests run so the
// "8 ghosts + 1 Tester = 9 rows" assertion is reliable across runs.

import { execSync } from 'node:child_process';
import path from 'node:path';

export default async function globalSetup() {
  const repoRoot = path.resolve(__dirname, '../../..');
  execSync('supabase db reset', { cwd: repoRoot, stdio: 'inherit' });
}
