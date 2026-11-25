import { expect, test } from '@playwright/test';

test('unpaid readiness and later cost edits appear in payroll with automatic history', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?flowDemo&economicsDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Замовлення №1', exact: true });
  await page.getByRole('combobox', { name: 'Відповідальний', exact: false }).click();
  await page.getByRole('option', { name: /Маляр Андрій/ }).click();
  await dialog.getByRole('button', { name: 'Зберегти замовлення', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  await dialog.getByRole('button', { name: 'Додати субпідряд', exact: true }).click();
  await page.getByRole('combobox', { name: 'Назва витрати', exact: false }).click();
  await page.getByRole('option', { name: 'Пайка', exact: true }).click();
  await page.getByRole('combobox', { name: 'Субпідрядник', exact: false }).click();
  await page.getByRole('option', { name: /^Олена Адміністратор/ }).click();
  await page.getByRole('textbox', { name: 'Примітка', exact: true }).fill('Пайка бампера');
  await page.getByRole('textbox', { name: 'Вартість субпідряду, грн', exact: false }).fill('3000');
  await page.getByRole('button', { name: 'Зберегти витрату', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Додати субпідряд', exact: true })).toBeEnabled();
  await page.goto('/dashboard/orders?flowDemo&role=worker');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('button', { name: 'Позначити готовим', exact: true }).click();
  await expect(page.getByText('Замовлення готове.', { exact: true })).toBeVisible();
  await page.goto('/dashboard/payroll?flowDemo');
  const table = page.getByRole('table', { name: 'Зарплати команди', exact: true });
  await expect(table).toContainText('9 000,00');
  await page.goto('/dashboard/orders?flowDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Замовлення №1', exact: true });
  await expect(dialog.getByRole('region', { name: 'Зведення замовлення' })).toContainText(
    'Оплачено0,00'
  );
  await dialog.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  await dialog.getByRole('button', { name: 'Редагувати витрату: Пайка', exact: true }).click();
  await page.getByRole('textbox', { name: 'Вартість субпідряду, грн', exact: false }).fill('4000');
  await page.getByRole('button', { name: 'Зберегти витрату', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Додати субпідряд', exact: true })).toBeEnabled();
  await page.goto('/dashboard/payroll?flowDemo');
  await expect(table).toContainText('8 400,00');
  await table.getByRole('button', { name: 'Зарплата: Маляр Андрій', exact: true }).click();
  const salary = page.getByRole('dialog', { name: 'Зарплата — Маляр Андрій', exact: true });
  await expect(salary).toContainText('Маляр');
  await expect(salary).toContainText('-600,00');
  await page.screenshot({
    path: info.outputPath('automatic-salary-history.png'),
    animations: 'disabled'
  });
});

test('worker reads costs without editing or obsolete financial correction controls', async ({
  page
}) => {
  await page.goto('/dashboard/orders?financeDemo&role=worker');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Витрати на субпідряд', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Додати субпідряд', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Фінансове коригування', exact: true })
  ).toHaveCount(0);
});
