import { expect, test } from '@playwright/test';

test('admin creates an amount-only paint material and records, edits and cancels costs without quantities', async ({
  page
}, info) => {
  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Нова позиція', exact: true }).click();
  const create = page.getByRole('dialog');
  await create.getByRole('textbox', { name: 'Назва позиції' }).fill('Фарба за сумою');
  await create.getByRole('combobox', { name: 'Облік матеріалу' }).click();
  await page.getByRole('option', { name: 'За сумою', exact: true }).click();
  await expect(create.getByRole('combobox', { name: 'Одиниця виміру' })).toHaveCount(0);
  await create.getByRole('button', { name: 'Створити позицію', exact: true }).click();
  await expect(create).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: 'Фарба за сумою' });
  await expect(row).toContainText('Без контролю залишку');
  await row.getByRole('button', { name: 'Дії з позицією Фарба за сумою', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Надходження', exact: true })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Коригувати', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  const materials = page.getByRole('region', { name: 'Матеріали замовлення' });
  await materials.getByRole('button', { name: 'Додати списання', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Нове списання', exact: true });
  await dialog.getByRole('combobox', { name: 'Матеріал зі складу', exact: false }).click();
  await page.getByRole('option', { name: /^Фарба за сумою/ }).click();
  await expect(dialog.getByRole('textbox', { name: 'Кількість', exact: false })).toHaveCount(0);
  const amount = dialog.getByRole('textbox', { name: 'Сума витрати, грн', exact: false });
  await amount.fill('0');
  await expect(dialog.getByRole('button', { name: 'Списати', exact: true })).toBeDisabled();
  await amount.fill('3500,25');
  await dialog.getByRole('button', { name: 'Списати', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(materials).toContainText(/3\s500,25/);
  await materials
    .getByRole('button', { name: 'Редагувати списання: Фарба за сумою', exact: true })
    .click();
  const edit = page.getByRole('dialog', { name: 'Редагувати списання', exact: true });
  await expect(edit.getByRole('textbox', { name: 'Сума витрати, грн', exact: false })).toHaveValue(
    '3500.25'
  );
  await edit.getByRole('textbox', { name: 'Сума витрати, грн', exact: false }).fill('4000');
  await edit.getByRole('button', { name: 'Зберегти списання', exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(materials).toContainText(/4\s000,00/);
  await page.screenshot({
    path: info.outputPath('amount-material-cost.png'),
    animations: 'disabled'
  });
  await materials
    .getByRole('button', { name: 'Редагувати списання: Фарба за сумою', exact: true })
    .click();
  await edit.getByRole('button', { name: 'Скасувати списання', exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(
    materials.getByRole('button', { name: 'Редагувати списання: Фарба за сумою', exact: true })
  ).toHaveCount(0);
  await materials.getByText('Журнал складських операцій', { exact: true }).click();
  await expect(materials.getByText('Скасовано', { exact: true })).toHaveCount(2);
  await page.goto('/dashboard/inventory');
  await expect(page.getByRole('row').filter({ hasText: 'Фарба за сумою' })).toContainText(
    'Без контролю залишку'
  );
});
