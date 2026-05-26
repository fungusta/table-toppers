// web/tests/e2e/groups_invites.spec.ts
//
// Layer-3 coverage for the create-group + invite + accept flow.
// One scenario covers the happy path across two browser contexts.

import { test, expect } from '@playwright/test';

test('owner creates group, generates invite, second user accepts', async ({ browser }) => {
  const ts = Date.now();
  const ownerEmail  = `owner-${ts}@example.com`;
  const joinerEmail = `joiner-${ts}@example.com`;
  const password    = 'correct-horse-battery';

  // ----- Context A: owner -----
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  await pageA.goto('/signup');
  await pageA.fill('[name=display_name]', 'OwnerA');
  await pageA.fill('[name=email]', ownerEmail);
  await pageA.fill('[name=password]', password);
  await pageA.click('button[type=submit]');
  await pageA.waitForURL(/\/g\/[0-9a-f-]+\//, { timeout: 15_000 });

  // Owner creates a fresh group.
  await pageA.goto('/groups/new');
  await pageA.fill('input[required]', `PlanTestGroup-${ts}`);
  await pageA.click('button[type=submit]');
  await pageA.waitForURL(/\/g\/[0-9a-f-]+\//, { timeout: 15_000 });
  const groupUrl = pageA.url();
  const groupId = groupUrl.match(/\/g\/([0-9a-f-]+)\//)![1];

  // Owner opens manage page and creates an invite.
  await pageA.goto(`/g/${groupId}/manage`);
  await pageA.click('text=+ Create invite');
  // Code appears as the first <code> element under the manage list.
  const code = (await pageA.locator('code').first().innerText()).trim();
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);

  // ----- Context B: joiner -----
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  // Unauthed visit to /join/[code] should redirect to /signup?next=...
  await pageB.goto(`/join/${code}`);
  await pageB.waitForURL(/\/signup\?.*next=/, { timeout: 10_000 });

  // Sign up; ?next= round-trips back to /join/[code].
  await pageB.fill('[name=display_name]', 'JoinerB');
  await pageB.fill('[name=email]', joinerEmail);
  await pageB.fill('[name=password]', password);
  await pageB.click('button[type=submit]');
  await pageB.waitForURL(new RegExp(`/join/${code}`), { timeout: 15_000 });

  // Accept the invite.
  await pageB.click('text=Accept invite');
  await pageB.waitForURL(new RegExp(`/g/${groupId}/`), { timeout: 15_000 });

  // Group name is visible on the leaderboard (TopBar brand text).
  await expect(pageB.getByText(`PlanTestGroup-${ts}`)).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
