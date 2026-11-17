import { expect, test } from '@playwright/test';

test('clients have compact header actions and icon dropdowns instead of summary cards', async ({
  page
}, info) => {
  await page.goto('/dashboard/clients');
  await expect(page.getByRole('heading', { name: 'Клієнти', exact: true })).toHaveCount(1);
  await expect(page.locator('[data-slot=card]')).toHaveCount(0);
  const group = page.getByRole('group', { name: 'Дії сторінки клієнтів' });
  await expect(group.getByRole('button', { name: 'Додати клієнта' })).toBeVisible();
  expect(
    await group
      .locator('button')
      .evaluateAll((buttons) => buttons.every((button) => !!button.querySelector('svg')))
  ).toBe(true);
  const title = (await page.getByRole('heading', { name: 'Клієнти', exact: true }).boundingBox())!;
  const actions = (await group.boundingBox())!;
  expect(Math.abs(title.y - actions.y)).toBeLessThan(20);
  await page
    .getByRole('table')
    .locator('tbody tr')
    .first()
    .getByRole('button', { name: /^Дії/ })
    .click();
  const items = page.getByRole('menuitem');
  await expect(items).toHaveCount(3);
  expect(
    await items.evaluateAll((entries) => entries.every((entry) => !!entry.querySelector('svg')))
  ).toBe(true);
  await page.getByRole('menuitem', { name: 'Автомобілі та історія' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Закрити вікно' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.screenshot({ path: info.outputPath('clients-page.png'), animations: 'disabled' });
});

test('creation date sort persists and resets pagination', async ({ page }) => {
  await page.goto('/dashboard/clients?customerDates');
  const rows = page.getByRole('table').locator('tbody tr');
  await expect(rows.first()).toContainText('Тестовий клієнт 2');
  await page.getByRole('button', { name: 'Наступна сторінка', exact: true }).click();
  await page.getByRole('button', { name: 'Сортувати за датою створення' }).click();
  await page.getByRole('menuitemradio', { name: 'Спочатку старі' }).click();
  await expect(rows.first()).toContainText('Тестовий клієнт із довгим');
  await expect(page).toHaveURL(/customerOrder=oldest/);
  await expect(page.getByRole('status').filter({ hasText: '1–10 із 24' })).toBeVisible();
  await page.reload();
  await expect(rows.first()).toContainText('Тестовий клієнт із довгим');
  await page.getByRole('button', { name: 'Сортувати за датою створення' }).click();
  await page.getByRole('menuitemradio', { name: 'Спочатку нові' }).click();
  await expect(rows.first()).toContainText('Тестовий клієнт 2');
});
