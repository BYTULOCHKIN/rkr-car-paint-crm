import { expect, test } from '@playwright/test';

const route = '/dashboard/orders?settingsDemo&realSidebar&sidebar=closed';

test('settings restore every palette and persist the choice across reload with keyboard access', async ({
  page
}, info) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(route);
  const trigger = page.getByRole('button', { name: 'Налаштування', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const settings = page.getByRole('dialog', { name: 'Налаштування', exact: true });
  await expect(settings).toBeVisible();
  const before = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--primary')
  );
  await settings.getByRole('combobox', { name: 'Тема оформлення', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(10);
  await page.getByRole('option', { name: 'Discord', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'discord');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary')
    )
  ).not.toBe(before);
  expect(
    (await page.context().cookies()).find((cookie) => cookie.name === 'active_theme')?.value
  ).toBe('discord');
  await page.screenshot({ path: info.outputPath('settings-palette.png'), animations: 'disabled' });
  const bounds = (await settings.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'discord');
  await trigger.click();
  await expect(
    settings.getByRole('combobox', { name: 'Тема оформлення', exact: true })
  ).toContainText('Discord');
});

test('appearance modes and palettes survive navigation and workers can reset their personal appearance', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${route}&role=worker`);
  await page.getByRole('button', { name: 'Налаштування', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Налаштування', exact: true });
  await settings.getByRole('combobox', { name: 'Тема оформлення', exact: true }).click();
  await page.getByRole('option', { name: 'Supabase', exact: true }).click();
  await settings.getByRole('combobox', { name: 'Режим відображення', exact: true }).click();
  await page.getByRole('option', { name: 'Темний', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await settings.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.goto('/dashboard/inventory?settingsDemo&role=worker');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'supabase');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Налаштування', exact: true }).click();
  await expect(
    settings.getByRole('combobox', { name: 'Режим відображення', exact: true })
  ).toContainText('Темний');
  await settings
    .getByRole('button', { name: 'Відновити стандартне оформлення', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'vercel');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(
    settings.getByRole('combobox', { name: 'Режим відображення', exact: true })
  ).toContainText('Як у системі');
  await expect(
    settings.getByRole('button', { name: 'Відновити стандартне оформлення', exact: true })
  ).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('system');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'vercel');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('system mode follows device changes while explicit light mode remains stable', async ({
  page
}, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(route);
  await page.getByRole('button', { name: 'Налаштування', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Налаштування', exact: true });
  await expect(
    settings.getByRole('combobox', { name: 'Режим відображення', exact: true })
  ).toContainText('Як у системі');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: info.outputPath('settings-dark.png'), animations: 'disabled' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await settings.getByRole('combobox', { name: 'Режим відображення', exact: true }).click();
  await page.getByRole('option', { name: 'Світлий', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
});
