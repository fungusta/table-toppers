import { test, expect } from '@playwright/test';

test('new user signs up and lands on /groups/new with no memberships', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto('/signup');
  await page.fill('input[name=display_name]', 'Tester');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'correct-horse-battery');
  await page.click('button[type=submit]');

  // Signup -> / -> /groups/new because the new account has zero memberships.
  await page.waitForURL(/\/groups\/new(\?.*)?$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Create a group' })).toBeVisible();
});
