import { expect, test } from '@playwright/test';

test('admin records partial payments, rejects overpayment, and reverses an incorrect payment with history', async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const section = page.getByRole('region', { name: 'Оплати замовлення' });
  await section.getByRole('button', { name: 'Додати оплату', exact: true }).click();
  await section.getByRole('textbox', { name: 'Сума оплати, грн *' }).fill('20000,50');
  await section.getByRole('button', { name: 'Записати оплату', exact: true }).click();
  await expect(section).toContainText('Частково оплачено');
  await expect(section.locator('dd').first()).toContainText(/20\s000,50/);
  await expect(section.locator('dd').last()).toContainText(/39\s999,50/);
  await section.getByRole('button', { name: 'Додати оплату', exact: true }).click();
  await section.getByRole('textbox', { name: 'Сума оплати, грн *' }).fill('50000');
  await section.getByRole('button', { name: 'Записати оплату', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('Оплата перевищує залишок');
  await section.getByRole('textbox', { name: 'Сума оплати, грн *' }).fill('39999,50');
  await section.getByRole('button', { name: 'Записати оплату', exact: true }).click();
  await expect(section.locator('dd').last()).toContainText('0,00');
  await expect(section.getByRole('button', { name: 'Додати оплату', exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: 'Скасувати платіж', exact: true }).first().click();
  await section
    .getByRole('textbox', { name: 'Причина скасування платежу *' })
    .fill('Помилкова сума');
  await section
    .getByRole('button', { name: 'Підтвердити скасування платежу', exact: true })
    .click();
  await expect(section).toContainText('Помилкова сума');
  await expect(section).toContainText('Частково оплачено');
  await expect(section.getByText('Скасовано', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('payment-history.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('overview separates actual receipts from the outstanding balance of delivered cars', async ({
  page
}, info) => {
  await page.goto('/dashboard/overview?paymentDemo');
  const finance = page.getByRole('region', { name: 'Фінанси автомалярки' });
  await expect(finance.getByRole('link', { name: /Надходження за місяць/ })).toContainText(
    '10K грн'
  );
  await expect(
    finance.getByRole('link', { name: /Заборгованість за виданими авто/ })
  ).toContainText('50K грн');
  await expect(
    finance.getByRole('link', { name: /Заборгованість за виданими авто/ })
  ).toContainText('Неоплачених виданих замовлень: 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.screenshot({ path: info.outputPath('overview-finance.png'), animations: 'disabled' });
});

test('workers can start a created order but cannot record payments', async ({ page }) => {
  await page.goto('/dashboard/orders?role=worker&createdDemo');
  await expect(page.getByRole('table').locator('tbody tr').first()).toContainText('Створено');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const payments = page.getByRole('region', { name: 'Оплати замовлення' });
  await expect(payments).toBeVisible();
  await expect(payments.getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Почати роботу', exact: true }).click();
  await expect(page.getByRole('table').locator('tbody tr').first()).toContainText('У роботі');
});
