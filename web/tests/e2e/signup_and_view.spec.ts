import { test, expect } from '@playwright/test';

test('new user signs up and sees the seeded leaderboard', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto('/signup');
  await page.fill('input[name=display_name]', 'Tester');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'correct-horse-battery');
  await page.click('button[type=submit]');

  await page.waitForURL(/\/(\?.*)?$/, { timeout: 15_000 });

  // The full CafeView renders the league table; scope name assertions to it
  // because seed names also appear in stats panels, champions, and recent matches.
  const table = page.getByRole('table').first();
  await expect(table).toBeVisible();

  // 8 ghost members + Tester = 9 player rows in the standings table.
  await expect(table.getByText('Mara')).toBeVisible();
  await expect(table.getByText('Tester')).toBeVisible();
  await expect(table.getByText('Tomás')).toBeVisible();
  await expect(table.getByText('Felix')).toBeVisible();
});
