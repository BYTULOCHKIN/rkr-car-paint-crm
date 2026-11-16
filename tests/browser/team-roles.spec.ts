import { expect, test } from '@playwright/test';

test('admin can select either active role as executor when creating an order', async ({ page }) => {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Нове замовлення', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Виконавець *', exact: true }).click();
  await expect(page.getByRole('option', { name: /Олена Адміністратор/ })).toBeVisible();
  await page.getByRole('option', { name: /Маляр Андрій/ }).click();
  await expect(page.getByRole('combobox', { name: 'Виконавець *', exact: true })).toContainText(
    'Маляр Андрій'
  );
});

test('worker sees all orders as read-only and takes successive forward status steps', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?role=worker');
  await expect(page.getByRole('button', { name: 'Нове замовлення', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
  await expect(dialog.getByText('Олена Адміністратор', { exact: true })).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Позначити готовим', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('worker-read-only.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Позначити готовим', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await dialog.getByRole('button', { name: 'Позначити виданим', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await expect(dialog.getByText('Замовлення вже видано.', { exact: true })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
});

test('team roles are readable and administration controls are not offered to workers', async ({
  page
}, info) => {
  await page.goto('/dashboard/team');
  await expect(page.getByText('Clerk invitation controls', { exact: true })).toBeVisible();
  await expect(page.getByText('Маляр Андрій', { exact: true })).toBeVisible();
  await page.goto('/dashboard/team?role=worker');
  await expect(page.getByText('Clerk invitation controls', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Маляр Андрій', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('team-worker.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
});
