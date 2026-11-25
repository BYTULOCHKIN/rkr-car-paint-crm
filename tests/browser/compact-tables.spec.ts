import { expect, test } from '@playwright/test';

test('orders use header controls and compact rows with complete work and date previews', async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dashboard/orders?orderStatuses');
  await expect(page.getByRole('heading', { name: 'Замовлення', exact: true })).toHaveCount(1);
  await expect(page.locator('[data-slot=card]')).toHaveCount(0);
  const table = page.getByRole('table');
  const row = table.locator('tbody tr').first();
  await expect(row).toBeVisible();
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(60);
  expect((await table.boundingBox())!.y).toBeLessThan(300);
  const work = row.getByRole('button', { name: 'Роботи замовлення №1', exact: true });
  await work.click();
  const popup = page.locator('[data-slot=popover-content]');
  await expect(popup.locator('li')).toHaveCount(12);
  await expect(popup).toContainText('Рихтування та фарбування переднього бампера');
  await expect(popup).toContainText('Разом');
  const box = (await popup.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press('Escape');
  await expect(work).toBeFocused();
  await row.getByRole('button', { name: 'План і факт', exact: true }).click();
  await expect(popup).toContainText('Готовність · факт');
  await page.keyboard.press('Escape');
  await page
    .getByRole('textbox', { name: 'Пошук за клієнтом, автомобілем, VIN або роботами' })
    .fill('нічого-не-знайдено');
  await expect(table).toContainText('За цим пошуком записів не знайдено.');
  await page
    .getByRole('textbox', { name: 'Пошук за клієнтом, автомобілем, VIN або роботами' })
    .clear();
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'Фільтр статусу замовлень', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Готово', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Відкрити замовлення №2', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true })
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Відкрити замовлення №2', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Фільтр статусу замовлень', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Усі статуси', exact: true }).click();
  await page.screenshot({ path: info.outputPath('compact-orders.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('client cars and clipped names expand without increasing row height', async ({ page }) => {
  await page.goto('/dashboard/clients');
  const row = page.getByRole('table').locator('tbody tr').first();
  await expect(row).toBeVisible();
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(65);
  const edit = row.getByRole('button', { name: /Редагувати клієнта/ });
  await edit.click();
  const editor = page.getByRole('dialog', { name: 'Редагування клієнта', exact: true });
  await expect(editor.getByRole('textbox', { name: 'Ім’я клієнта *' })).toHaveValue(
    'Тестовий клієнт із довгим прізвищем та ім’ям'
  );
  await editor.getByRole('button', { name: 'Закрити', exact: true }).click();
  await expect(edit).toBeFocused();
  await row.getByRole('button', { name: 'Автомобілі клієнта', exact: true }).click();
  const popup = page.locator('[data-slot=popover-content]');
  await expect(popup.locator('li')).toHaveCount(7);
  await popup.getByRole('button', { name: 'Повна історія автомобілів' }).click();
  await expect(page.getByRole('region', { name: 'Історія вибраного автомобіля' })).toBeVisible();
});

test('worker retains search and order access without a creation action', async ({ page }) => {
  await page.goto('/dashboard/orders?role=worker');
  await expect(
    page.getByRole('textbox', { name: 'Пошук за клієнтом, автомобілем, VIN або роботами' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Нове замовлення', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Матеріали замовлення' })).toBeVisible();
});
