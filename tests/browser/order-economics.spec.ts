import { expect, test } from '@playwright/test';

test('client works remain editable while subcontract costs are independent and preserve drafts', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?flowDemo&economicsDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Замовлення №1', exact: true });
  await expect(dialog.getByRole('tab')).toHaveCount(5);
  await expect(dialog.getByRole('tab', { name: 'Економіка', exact: true })).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Роботи', exact: true }).click();
  await dialog
    .getByRole('spinbutton', { name: 'Ціна за одиницю, грн', exact: false })
    .fill('20000');
  await dialog.getByRole('button', { name: 'Зберегти замовлення', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Зведення замовлення' })).toContainText(
    '20\u00a0000,00'
  );
  await dialog.getByRole('tab', { name: 'Матеріали і витрати', exact: true }).click();
  await dialog.getByRole('button', { name: 'Додати витрату', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Назва витрати', exact: false }).click();
  await page.getByRole('option', { name: 'Підбір фарби', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Субпідрядник', exact: false }).click();
  await page.getByRole('option', { name: /^Маляр Андрій/ }).click();
  await dialog.getByRole('textbox', { name: 'Примітка', exact: true }).fill('Підбір кольору');
  await dialog
    .getByRole('textbox', { name: 'Вартість субпідряду, грн', exact: false })
    .fill('2500');
  await dialog.getByRole('tab', { name: 'Роботи', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Зберегти замовлення', exact: true })
  ).toBeDisabled();
  await dialog.getByRole('tab', { name: 'Матеріали і витрати', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Назва витрати', exact: false })).toContainText(
    'Підбір фарби'
  );
  await expect(dialog.getByRole('textbox', { name: 'Примітка', exact: true })).toHaveValue(
    'Підбір кольору'
  );
  await dialog.getByRole('button', { name: 'Зберегти витрату', exact: true }).click();
  const costs = dialog.getByRole('region', { name: 'Витрати на субпідряд', exact: true });
  await expect(costs).toContainText('2\u00a0500,00');
  await expect(dialog.getByRole('region', { name: 'Зведення замовлення' })).toContainText(
    '20\u00a0000,00'
  );
  await costs
    .getByRole('button', { name: 'Редагувати витрату: Підбір фарби', exact: true })
    .click();
  await dialog
    .getByRole('textbox', { name: 'Вартість субпідряду, грн', exact: false })
    .fill('3000');
  await dialog.getByRole('button', { name: 'Зберегти витрату', exact: true }).click();
  await expect(costs).toContainText('3\u00a0000,00');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await page.screenshot({
    path: info.outputPath('materials-and-expenses.png'),
    animations: 'disabled'
  });
  await costs.getByRole('button', { name: 'Видалити витрату: Підбір фарби', exact: true }).click();
  await expect(costs).toContainText('Витрат на субпідряд ще немає.');
});
