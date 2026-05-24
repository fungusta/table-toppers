import { test, expect } from '@playwright/test';

test('new user signs up and sees the seeded leaderboard', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto('/signup');
  await page.fill('input[name=display_name]', 'Tester');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'correct-horse-battery');
  await page.click('button[type=submit]');

  await page.waitForURL(/\/(\?.*)?$/, { timeout: 15_000 });

  await expect(page.getByRole('table')).toBeVisible();

  // 8 ghost members + Tester = 9 data rows + 1 header row
  await expect(page.getByRole('row')).toHaveCount(10);

  await expect(page.getByText('Mara')).toBeVisible();
  await expect(page.getByText('Tester')).toBeVisible();
});
