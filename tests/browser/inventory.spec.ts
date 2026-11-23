import { expect, test, type Locator } from '@playwright/test';

async function expectInlineIcon(button: Locator): Promise<void> {
  const layout = await button.evaluate((element) => {
    const icon = element.querySelector('svg')!.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent?.trim()) node = walker.nextNode();
    const range = document.createRange();
    range.selectNodeContents(node!);
    const label = range.getBoundingClientRect();
    return {
      centerDifference: Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2),
      iconRight: icon.right,
      labelLeft: label.left
    };
  });
  expect(layout.centerDifference).toBeLessThanOrEqual(2);
  expect(layout.iconRight).toBeLessThan(layout.labelLeft);
}

test('admin creates a position and receives fractional stock', async ({ page }) => {
  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Нова позиція', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Назва позиції' }).fill('Ґрунт');
  await dialog.getByRole('combobox', { name: 'Одиниця виміру' }).click();
  await expect(page.getByRole('option')).toHaveCount(4);
  await page.getByRole('option', { name: 'кг', exact: true }).click();
  await dialog.getByRole('button', { name: 'Створити позицію' }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: 'Ґрунт' });
  await row.getByRole('button', { name: 'Дії з позицією Ґрунт' }).click();
  await page.getByRole('menuitem', { name: 'Надходження', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Кількість' }).fill('0,250');
  await dialog.getByRole('textbox', { name: 'Загальна вартість надходження' }).fill('10');
  await dialog.getByRole('combobox', { name: 'Валюта' }).click();
  await page.getByRole('option', { name: 'Євро (EUR)', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Курс закупівлі, грн за 1 €' }).fill('48,4');
  await dialog.getByRole('button', { name: 'Додати надходження' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('0,25 кг');
  await expect(row).toContainText('484,00');
  await row.getByRole('button', { name: 'Дії з позицією Ґрунт' }).click();
  await page.getByRole('menuitem', { name: 'Коригувати', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Зміна залишку' }).fill('-0,050');
  await dialog.getByRole('textbox', { name: 'Причина коригування' }).fill('Інвентаризація');
  await dialog.getByRole('button', { name: 'Провести коригування' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('0,2 кг');
  await expect(row).toContainText('387,20');
  await row.getByRole('button', { name: 'Дії з позицією Ґрунт' }).click();
  await page.getByRole('menuitem', { name: 'В архів', exact: true }).click();
  await expect(row).toBeHidden();
  await page.getByRole('button', { name: 'Показати архів' }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Дії з позицією Ґрунт' }).click();
  await page.getByRole('menuitem', { name: 'Історія', exact: true }).click();
  await expect(dialog).toContainText('Інвентаризація');
});

test('order consumption validates remaining stock and cancellation preserves history', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали і витрати', exact: true }).click();
  const materials = page.getByRole('region', { name: 'Матеріали замовлення' });
  await materials.getByRole('button', { name: 'Додати списання' }).click();
  await materials.getByRole('combobox', { name: 'Матеріал' }).click();
  await page.getByRole('option', { name: /Фарба/ }).click();
  await materials.getByRole('textbox', { name: 'Кількість' }).fill('2');
  await page.getByRole('button', { name: 'Списати матеріали' }).click();
  await expect(materials.getByRole('alert')).toContainText('Недостатньо');
  await materials.getByRole('textbox', { name: 'Кількість' }).fill('0,250');
  await page.getByRole('button', { name: 'Списати матеріали' }).click();
  await expect(materials.getByText('Фарба — 0,25 л', { exact: true })).toBeVisible();
  await expect(materials).toContainText('Собівартість матеріалів: 250,00');
  await materials.getByRole('button', { name: 'Скасувати списання' }).click();
  await materials.getByRole('textbox', { name: 'Причина скасування' }).fill('Помилковий матеріал');
  await page.getByRole('button', { name: 'Підтвердити скасування' }).click();
  await expect(materials.getByText('Скасовано', { exact: true })).toBeVisible();
  await expect(materials.getByText('Фарба — 0,25 л', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('order-materials.png'), animations: 'disabled' });
  expect(
    await page
      .getByRole('dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true);
});

test('legacy balance is valued explicitly with an audit entry', async ({ page }) => {
  await page.goto('/dashboard/inventory');
  const row = page.getByRole('row').filter({ hasText: 'Лак (старий залишок)' });
  await expect(row).toContainText('Не визначена');
  await row.getByRole('button', { name: 'Дії з позицією Лак (старий залишок)' }).click();
  await page.getByRole('menuitem', { name: 'Оцінити залишок', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Вартість усього залишку, грн' }).fill('2000');
  await dialog.getByRole('textbox', { name: 'Підстава оцінювання' }).fill('Звірено за накладною');
  await dialog.getByRole('button', { name: 'Зберегти оцінку' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('2\u00a0000,00');
  await expect(page.getByRole('list', { name: 'Історія складських операцій' })).toContainText(
    'Звірено за накладною'
  );
});

test('admin searches materials, saves multiple rows together and reuses recent materials', async ({
  page
}) => {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали і витрати', exact: true }).click();
  const materials = page.getByRole('region', { name: 'Матеріали замовлення' });
  await materials.getByRole('button', { name: 'Додати списання' }).click();
  const form = materials.getByRole('form', { name: 'Списання матеріалів' });
  await form.getByRole('combobox', { name: 'Матеріал' }).click();
  await page.getByRole('combobox', { name: 'Пошук: Матеріал' }).fill('фар');
  await page.getByRole('option', { name: /Фарба/ }).click();
  await form.getByRole('textbox', { name: 'Кількість' }).fill('0,2');
  await form.getByRole('button', { name: 'Ще матеріал' }).click();
  await expectInlineIcon(form.getByRole('button', { name: 'Ще матеріал' }));
  await expectInlineIcon(form.getByRole('button', { name: 'Прибрати матеріал 2' }));
  await form.getByRole('combobox', { name: 'Матеріал' }).nth(1).click();
  await page.getByRole('option', { name: /Фарба/ }).click();
  await form.getByRole('textbox', { name: 'Кількість' }).nth(1).fill('0,3');
  await form.getByRole('combobox', { name: 'Для робіт' }).nth(1).click();
  await page.getByRole('option', { name: 'Полірування', exact: true }).click();
  await page.getByRole('button', { name: 'Списати матеріали', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(materials.getByText('Фарба — 0,5 л', { exact: true })).toBeVisible();
  await expect(materials).toContainText('Собівартість матеріалів: 500,00');
  await expect(materials).toContainText('Малярні роботи: 200,00');
  await expect(materials).toContainText('Полірування: 300,00');
  await materials.getByRole('button', { name: 'Додати списання' }).click();
  await form.getByRole('combobox', { name: 'Матеріал' }).click();
  await expect(page.getByText('Останні використані', { exact: true })).toBeVisible();
  await page.getByRole('option', { name: /Фарба/ }).click();
  await form.getByRole('button', { name: 'Ще матеріал' }).click();
  await form.getByRole('button', { name: 'Прибрати матеріал 2' }).click();
  await expect(form.getByRole('combobox', { name: 'Матеріал' })).toHaveCount(1);
  expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
});

test('worker can inspect stock with no write controls', async ({ page }) => {
  await page.goto('/dashboard/inventory?role=worker');
  await expect(page.getByRole('row').filter({ hasText: 'Фарба' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Нова позиція' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Надходження', exact: true })).toHaveCount(0);
  await page.goto('/dashboard/orders?role=worker');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали і витрати', exact: true }).click();
  const materials = page.getByRole('region', { name: 'Матеріали замовлення' });
  await expect(materials).toBeVisible();
  await expect(materials.getByRole('button')).toHaveCount(0);
});
