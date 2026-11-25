import { test, expect, type Page } from '@playwright/test';

async function openHistory(page: Page) {
  await page.goto('/dashboard/clients');
  await page.getByRole('button', { name: 'Автомобілі клієнта', exact: true }).first().click();
  await page.getByRole('button', { name: 'Повна історія автомобілів', exact: true }).click();
  return page.getByRole('dialog');
}

async function selectCar(page: Page, index: number) {
  const dialog = page.getByRole('dialog');
  if (page.viewportSize()!.width < 768) {
    await dialog.getByRole('combobox', { name: 'Автомобіль клієнта' }).click();
    await page.getByRole('option').nth(index).click();
  } else {
    await dialog
      .getByRole('navigation', { name: 'Автомобілі клієнта' })
      .getByRole('button')
      .nth(index)
      .click();
  }
}

test('history separates the cars and shows order details with no viewport overflow', async ({
  page
}, info) => {
  const dialog = await openHistory(page);
  await expect(dialog.getByText('Автомобілі: 7', { exact: true })).toBeVisible();
  const panel = dialog.getByRole('region', { name: 'Історія вибраного автомобіля' });
  await expect(panel.getByText('WVWZZZ1JZXW000010', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Відкрити замовлення №1' })).toBeVisible();
  await selectCar(page, 6);
  await expect(panel.getByText('Замовлень ще немає', { exact: true })).toBeVisible();
  await expect(panel.getByText('WVWZZZ1JZXW000016', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Відкрити замовлення №1' })).toHaveCount(0);
  await selectCar(page, 0);
  await panel.getByRole('button', { name: 'Відкрити замовлення №1' }).click();
  await expect(dialog.getByRole('heading', { name: 'Замовлення №1', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'До автомобілів клієнта' }).click();
  await expect(
    dialog
      .getByRole('region', { name: 'Історія вибраного автомобіля' })
      .getByText('WVWZZZ1JZXW000010', { exact: true })
  ).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await page.screenshot({ path: info.outputPath('customer-history.png'), animations: 'disabled' });
  await page.goto('/dashboard/clients?dark');
  await page.getByRole('button', { name: 'Автомобілі клієнта', exact: true }).first().click();
  await page.getByRole('button', { name: 'Повна історія автомобілів', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Історія вибраного автомобіля' })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('customer-history-dark.png'),
    animations: 'disabled'
  });
});

test('returning to history protects unsaved order changes', async ({ page }) => {
  const dialog = await openHistory(page);
  await dialog.getByRole('button', { name: 'Відкрити замовлення №1' }).click();
  await dialog.getByRole('textbox', { name: 'Опис замовлення' }).fill('Незбережені зміни');
  await dialog.getByRole('button', { name: 'До автомобілів клієнта' }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Продовжити редагування' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Опис замовлення' })).toHaveValue(
    'Незбережені зміни'
  );
  await dialog.getByRole('button', { name: 'До автомобілів клієнта' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Скасувати зміни' }).click();
  await expect(dialog.getByRole('region', { name: 'Історія вибраного автомобіля' })).toBeVisible();
  await expect(dialog.getByText('Незбережені зміни', { exact: true })).toHaveCount(0);
});
