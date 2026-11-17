import { expect, test } from '@playwright/test';

for (const dark of [false, true]) {
  test(`vehicle brand logos and unknown-brand fallback: ${dark ? 'dark' : 'light'}`, async ({
    page
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/dashboard/vehicles?brandAvatars${dark ? '&dark' : ''}`);
    const rows = page.getByRole('table').locator('tbody tr');
    const zeekr = rows.nth(0).locator('td').first();
    const mercedes = rows.nth(1).locator('td').first();
    const unknown = rows.nth(2).locator('td').first();
    await expect(zeekr.locator('img')).toHaveAttribute('src', '/vehicle-brands/zeekr.svg');
    await expect(mercedes.locator('img')).toHaveAttribute(
      'src',
      '/vehicle-brands/mercedes-benz.svg'
    );
    await expect(unknown.locator('[data-slot=avatar-fallback] svg')).toBeVisible();
    await expect(unknown.locator('img')).toHaveCount(0);
    await expect(zeekr).toContainText('ZEEKR');
    await expect(mercedes).toContainText('Mercedes Benz');
    const filter = await zeekr
      .locator('img')
      .evaluate((element) => getComputedStyle(element).filter);
    expect(filter).toBe(dark ? 'invert(1)' : 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    );
    await page.screenshot({
      path: info.outputPath('vehicle-brand-avatars.png'),
      animations: 'disabled'
    });
    expect(errors).toEqual([]);
  });
}

test('missing logo file falls back to the car icon while retaining the make', async ({ page }) => {
  await page.route('**/vehicle-brands/zeekr.svg', (route) => route.abort());
  await page.goto('/dashboard/vehicles?brandAvatars');
  const first = page.getByRole('table').locator('tbody tr').first().locator('td').first();
  await expect(first.locator('[data-slot=avatar-fallback] svg')).toBeVisible();
  await expect(first.locator('img')).toHaveCount(0);
  await expect(first).toContainText('ZEEKR');
});

test('vehicle modal shows small logos in make options and the selected control', async ({
  page
}, info) => {
  await page.goto('/dashboard/vehicles');
  await page.getByRole('button', { name: 'Додати автомобіль', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Новий автомобіль', exact: true });
  const make = dialog.getByRole('combobox', { name: 'Марка *', exact: true });
  await make.click();
  await page.getByPlaceholder('Пошук марки…', { exact: true }).fill('BMW');
  const option = page.getByRole('option', { name: 'BMW', exact: true });
  await expect(option.locator('img')).toHaveAttribute('src', '/vehicle-brands/bmw.svg');
  await expect(option.locator('[data-slot=avatar]')).toHaveAttribute('data-size', 'sm');
  await option.click();
  await expect(make).toContainText('BMW');
  await expect(make.locator('img')).toHaveAttribute('src', '/vehicle-brands/bmw.svg');
  await expect(dialog.getByRole('combobox', { name: 'Модель *', exact: true })).toBeEnabled();
  await expect(make).toBeFocused();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await page.screenshot({
    path: info.outputPath('make-selector-logo.png'),
    animations: 'disabled'
  });
});
