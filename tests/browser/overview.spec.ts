import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-31T10:00:00Z'));
});

test('overview displays CRM totals, queues and actual charts without demo content', async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dashboard/overview');
  await expect(page.getByRole('link', { name: 'Активні заявки: 22', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Замовлення в роботі: 22', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Готові до видачі: 1', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Видано цього місяця: 1', exact: true })
  ).toBeVisible();
  await expect(page.getByText('Вартість замовлень: 60 000,00 грн', { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot=chart]')).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Останні замовлення' }).locator('tbody tr')
  ).toHaveCount(5);
  await expect(page.getByText('Total Revenue', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath('overview.png'),
    fullPage: true,
    animations: 'disabled'
  });
  expect(errors).toEqual([]);
});

test('creating a customer from overview invalidates the shared CRM data', async ({ page }) => {
  await page.goto('/dashboard/overview');
  await page.getByRole('button', { name: 'Додати клієнта', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Ім’я клієнта *' }).fill('Новий клієнт з огляду');
  await dialog.getByRole('textbox', { name: 'Телефон *' }).fill('+380000000000');
  await dialog.getByRole('button', { name: 'Створити клієнта', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('link', { name: 'Клієнтів у базі: 25', exact: true })).toBeVisible();
});

test('overview opens existing orders and workflow dialogs using CRM forms', async ({ page }) => {
  await page.goto('/dashboard/overview');
  await page
    .getByRole('button', { name: /Відкрити замовлення №/ })
    .first()
    .click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Зберегти замовлення', exact: true })
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрити', exact: true }).click();
  await page
    .getByRole('button', { name: /^Статус і дати:/ })
    .first()
    .click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Статус *' })).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Зберегти статус і дати', exact: true })
  ).toBeVisible();
});

test('a new CRM has zero counters and helpful empty states', async ({ page }, info) => {
  await page.goto('/dashboard/overview?empty');
  await expect(page.getByText('Почнімо роботу з CRM', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Активні заявки: 0', exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.locator('[data-slot=chart]')).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('overview-empty.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.getByRole('button', { name: 'Створити першого клієнта', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('overview respects the dark theme and constrains the recent orders table', async ({
  page
}, info) => {
  await page.goto('/dashboard/overview?dark');
  await expect(page.getByRole('link', { name: 'Готові до видачі: 1', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  const scroll = page.locator('[data-slot=table-container]');
  await scroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await page.screenshot({
    path: info.outputPath('overview-dark.png'),
    fullPage: true,
    animations: 'disabled'
  });
});
