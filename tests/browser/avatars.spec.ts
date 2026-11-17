import { expect, test } from '@playwright/test';

for (const route of ['clients', 'users', 'team']) {
  test(`${route}: people have different fallback avatars that survive reloads`, async ({
    page
  }, info) => {
    await page.goto(`/dashboard/${route}`);
    const table = page.getByRole('table').first();
    const people = route === 'clients' ? table.locator('tbody tr td:first-child') : table;
    const avatars = people.locator('[data-slot=avatar-fallback] svg');
    await expect(avatars.first()).toBeVisible();
    await expect(avatars.nth(1)).toBeVisible();
    const patterns = await avatars.evaluateAll((elements) =>
      elements.map((element) => element.innerHTML)
    );
    expect(new Set(patterns).size).toBe(patterns.length);
    expect(await people.locator('[data-slot=avatar-image]').count()).toBe(0);
    await page.reload();
    await expect(avatars.first()).toBeVisible();
    expect(await avatars.first().evaluate((element) => element.innerHTML)).toBe(patterns[0]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    );
    await page.screenshot({
      path: info.outputPath(`${route}-avatars.png`),
      animations: 'disabled'
    });
  });
}
