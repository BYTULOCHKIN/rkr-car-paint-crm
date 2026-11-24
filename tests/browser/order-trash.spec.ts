import { expect, test } from '@playwright/test';

test('admin moves an empty order to trash and restores its number, work and status after reload', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?flowDemo');
  const orderButton = page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true });
  await expect(orderButton).toBeVisible();
  const row = page
    .getByRole('table', { name: 'Замовлення', exact: true })
    .getByRole('row')
    .filter({ has: orderButton });
  await row.getByRole('button', { name: 'Дії із замовленням №1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Перемістити в кошик', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Перемістити замовлення №1 в кошик', exact: true });
  await expect(dialog).toContainText('Його можна буде відновити');
  await dialog.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await expect(orderButton).toBeVisible();
  await row.getByRole('button', { name: 'Дії із замовленням №1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Перемістити в кошик', exact: true }).click();
  await dialog.getByRole('button', { name: 'Перемістити в кошик', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(orderButton).toHaveCount(0);
  await page.getByRole('button', { name: 'Кошик', exact: true }).click();
  await expect(page).toHaveURL(/ordersScope=trash/);
  let trash = page.getByRole('table', { name: 'Кошик замовлень', exact: true });
  await expect(trash).toContainText('№1');
  await expect(trash).toContainText('Олена Адміністратор');
  await page.reload();
  trash = page.getByRole('table', { name: 'Кошик замовлень', exact: true });
  await trash.getByRole('button', { name: 'Відновити замовлення №1', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Відновлення замовлення №1', exact: true });
  await dialog.getByRole('button', { name: 'Відновити замовлення', exact: true }).click();
  await expect(page.getByText('Кошик порожній', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'До замовлень', exact: true }).click();
  await orderButton.click();
  await expect(
    page.getByRole('region', { name: 'Зведення замовлення', exact: true })
  ).toContainText('60\u00a0000,00');
  await expect(page.getByRole('dialog', { name: 'Замовлення №1', exact: true })).toContainText(
    'В роботі'
  );
  await page.screenshot({ path: info.outputPath('restored-order.png'), animations: 'disabled' });
});

test('paid order explains the blocker without offering a successful trash action', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?financeDemo');
  await page.getByRole('button', { name: 'Дії із замовленням №1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Перемістити в кошик', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Перемістити замовлення №1 в кошик',
    exact: true
  });
  await expect(dialog.getByRole('alert')).toContainText('Є оплати клієнта');
  await expect(
    dialog.getByRole('button', { name: 'Перемістити в кошик', exact: true })
  ).toBeDisabled();
  await page.screenshot({ path: info.outputPath('trash-blocked.png'), animations: 'disabled' });
});

test('worker has no trash controls even when the trash URL is supplied', async ({ page }) => {
  await page.goto('/dashboard/orders?role=worker&ordersScope=trash');
  await expect(page.getByRole('table', { name: 'Замовлення', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Кошик', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Дії із замовленням №1', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Перемістити в кошик', exact: true })
  ).toHaveCount(0);
});
