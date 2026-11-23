import { expect, test } from '@playwright/test';

test('admin classifies a check with internal polishing and multiple roles without double charging', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?economicsDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Роботи', exact: true }).click();
  await page.getByRole('button', { name: 'Деталізувати чек', exact: true }).click();
  const form = page.getByRole('form', { name: 'Редагування деталізованого чека' });
  await form.getByRole('combobox', { name: 'Маляр', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Маляр', exact: true })
    .getByRole('option', { name: 'Маляр Андрій', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Маляр', exact: true })).toBeHidden();
  await form.getByRole('combobox', { name: 'Полірувальник', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Полірувальник', exact: true })
    .getByRole('option', { name: 'Олена Адміністратор', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Полірувальник', exact: true })).toBeHidden();
  await form.getByRole('combobox', { name: 'Розбірник', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Розбірник', exact: true })
    .getByRole('option', { name: 'Маляр Андрій', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Розбірник', exact: true })).toBeHidden();
  const first = form.getByRole('group', { name: 'Позиція 1', exact: true });
  await first.getByRole('combobox', { name: 'Вид роботи 1' }).click();
  await page.getByRole('option', { name: 'Фарбування деталі', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Фарбування деталі', exact: true })).toBeHidden();
  await first.getByRole('textbox', { name: 'З цієї суми полірування, грн' }).fill('1000');
  for (const [index, kind, name, price, contractor] of [
    [2, 'Розбірка-збірка', 'Розбірка-збірка авто', '1000', ''],
    [3, 'Підбір фарби', 'Підбір кольору', '2000', 'Колорист'],
    [4, 'Пайка', 'Пайка бампера', '1500', 'Майстер пайки']
  ] as const) {
    await form.getByRole('button', { name: 'Додати роботу до чека' }).click();
    const line = form.getByRole('group', { name: `Позиція ${index}`, exact: true });
    await line.getByRole('combobox', { name: `Вид роботи ${index}` }).click();
    await page.getByRole('option', { name: kind, exact: true }).click();
    await expect(page.getByRole('option', { name: kind, exact: true })).toBeHidden();
    await line.getByRole('textbox', { name: `Назва роботи ${index}` }).fill(name);
    await line.getByRole('textbox', { name: 'Ціна за одиницю, грн' }).fill(price);
    if (contractor) await line.getByRole('textbox', { name: /^Підрядник/ }).fill(contractor);
    if (index === 4)
      await expect(line.getByRole('textbox', { name: 'Оплата підряднику, грн' })).toHaveValue(
        '1500.00'
      );
  }
  await expect(form).toContainText('Чек клієнта: 22\u00a0500,00');
  await page.getByRole('button', { name: 'Зберегти деталізований чек' }).click();
  await expect(form).toBeHidden();
  const check = page.getByRole('region', { name: 'Деталізований чек', exact: true });
  await expect(check).toContainText('Маляр Андрій');
  await expect(check).toContainText('Олена Адміністратор');
  await page.getByRole('tab', { name: 'Економіка', exact: true }).click();
  const economics = page.getByRole('region', { name: 'Економіка замовлення' });
  await expect(economics.getByText('10\u00a0200,00 грн', { exact: true })).toBeVisible();
  await expect(economics.getByText('7\u00a0600,00 грн', { exact: true })).toBeVisible();
  await economics.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('order-economics.png'), animations: 'disabled' });
  expect(
    await page
      .getByRole('dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true);
});
