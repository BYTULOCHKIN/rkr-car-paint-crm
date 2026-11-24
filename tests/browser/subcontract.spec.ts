import { expect, test } from '@playwright/test';

test('expense names are selectable, new names persist, duplicates are rejected, and notes and team recipients are saved', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?flowDemo&economicsDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Замовлення №1', exact: true });
  await dialog.getByRole('tab', { name: 'Матеріали і витрати', exact: true }).click();
  await dialog.getByRole('button', { name: 'Додати витрату', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Вид витрати', exact: false })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Назва витрати', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Нова назва витрати', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Нова назва витрати', exact: true })
    .fill('Ремонт пластику');
  await dialog.getByRole('button', { name: 'Додати назву', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Назва витрати', exact: false })).toContainText(
    'Ремонт пластику'
  );
  await dialog.getByRole('combobox', { name: 'Субпідрядник', exact: false }).click();
  await page.getByRole('option', { name: 'Маляр Андрій', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Примітка', exact: true })
    .fill('Додаткове кріплення бампера');
  await dialog
    .getByRole('textbox', { name: 'Вартість субпідряду, грн', exact: false })
    .fill('1500');
  await dialog.getByRole('button', { name: 'Зберегти витрату', exact: true }).click();
  const costs = dialog.getByRole('region', { name: 'Витрати на субпідряд', exact: true });
  await expect(costs).toContainText('Додаткове кріплення бампера');
  await expect(costs).toContainText('Маляр Андрій');
  await expect(costs).toContainText('1\u00a0500,00');
  await dialog.getByRole('button', { name: 'Додати витрату', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Назва витрати', exact: false }).click();
  await expect(page.getByRole('option', { name: 'Ремонт пластику', exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'Ремонт пластику', exact: true }).click();
  await dialog.getByRole('button', { name: 'Нова назва витрати', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Нова назва витрати', exact: true })
    .fill('  РЕМОНТ   пластику  ');
  await dialog.getByRole('button', { name: 'Додати назву', exact: true }).click();
  await expect(
    dialog.getByRole('alert').filter({ hasText: 'Така назва витрати вже існує.' })
  ).toContainText('вже існує');
  await page.screenshot({
    path: info.outputPath('expense-name-duplicate.png'),
    animations: 'disabled'
  });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
});

test('subcontract payroll is off by default and team preference adds its full amount without changing responsible earnings', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?flowDemo&economicsDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Замовлення №1', exact: true });
  await dialog.getByRole('combobox', { name: 'Відповідальний', exact: false }).click();
  await page.getByRole('option', { name: /Маляр Андрій/ }).click();
  await dialog.getByRole('button', { name: 'Зберегти замовлення', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Матеріали і витрати', exact: true }).click();
  await dialog.getByRole('button', { name: 'Додати витрату', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Назва витрати', exact: false }).click();
  await page.getByRole('option', { name: 'Пайка', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Субпідрядник', exact: false }).click();
  await page.getByRole('option', { name: 'Олена Адміністратор', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Вартість субпідряду, грн', exact: false })
    .fill('3000');
  await dialog.getByRole('button', { name: 'Зберегти витрату', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Додати витрату', exact: true })).toBeEnabled();
  await page.goto('/dashboard/orders?flowDemo&role=worker');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('button', { name: 'Позначити готовим', exact: true }).click();
  await expect(page.getByText('Замовлення готове.', { exact: true })).toBeVisible();
  await page.goto('/dashboard/payroll?flowDemo');
  const table = page.getByRole('table', { name: 'Зарплати команди', exact: true });
  const row = (name: string) =>
    table
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: `Зарплата: ${name}`, exact: true }) });
  await expect(row('Маляр Андрій')).toContainText('9 000,00');
  await expect(row('Олена Адміністратор')).not.toContainText('3 000,00');
  await page.goto('/dashboard/team?flowDemo');
  await page
    .getByRole('button', { name: 'Налаштувати учасника Олена Адміністратор', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Учасник команди — Олена Адміністратор', exact: true });
  const toggle = dialog.getByRole('switch', {
    name: 'Показувати субпідряд у зарплатах',
    exact: true
  });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await dialog.getByRole('button', { name: 'Зберегти налаштування', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/dashboard/payroll?flowDemo');
  await expect(row('Олена Адміністратор')).toContainText('3 000,00');
  await expect(row('Маляр Андрій')).toContainText('9 000,00');
  await table.getByRole('button', { name: 'Зарплата: Олена Адміністратор', exact: true }).click();
  const salary = page.getByRole('dialog', { name: 'Зарплата — Олена Адміністратор', exact: true });
  await expect(salary).toContainText('Субпідряд');
  await expect(salary).toContainText('100%');
  await page.screenshot({
    path: info.outputPath('subcontract-payroll.png'),
    animations: 'disabled'
  });
});
