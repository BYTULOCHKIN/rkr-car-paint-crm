import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const period = 'reportFrom=2026-11-01&reportTo=2026-11-30';
test('report keeps previous period figures and shows only the correction in the next period', async ({
  page
}, info) => {
  await page.goto(`/dashboard/reports?${period}`);
  const metrics = page.getByRole('region', { name: 'Підсумок проведень за період' });
  await expect(metrics).toContainText('18\u00a0000,00');
  await expect(page.getByRole('table', { name: 'Журнал проведень економіки' })).toContainText(
    'Версія 1'
  );
  await page.getByRole('tab', { name: 'Авто', exact: true }).click();
  const cars = page.getByRole('table', { name: 'Авто за вибраними датами' });
  await expect(cars).toContainText('Версія 1');
  await expect(cars).toContainText('Без проведення');
  await page.getByLabel('Початок періоду', { exact: false }).fill('2026-12-01');
  await page.getByLabel('Кінець періоду', { exact: false }).fill('2026-12-31');
  await page.getByRole('button', { name: 'Показати зведення' }).click();
  await expect(page).toHaveURL(/reportFrom=2026-12-01/);
  await page.getByRole('tab', { name: 'Проведення', exact: true }).click();
  await expect(metrics).toContainText('-600,00');
  await expect(page.getByRole('table', { name: 'Журнал проведень економіки' })).toContainText(
    'Версія 2'
  );
  await page.screenshot({ path: info.outputPath('period-correction.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
});

test('material pivot and CSV preserve fractional quantities and unknown historical cost', async ({
  page
}, info) => {
  await page.goto(`/dashboard/reports?${period}&reportTab=materials`);
  const matrix = page.getByRole('table', { name: 'Матеріали × авто' });
  await expect(matrix).toContainText('0,8 л');
  await expect(matrix).toContainText('Не визначено');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Завантажити CSV' }).click();
  const download = await downloading;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('"0,800"');
  expect(csv).toContain('Не визначено');
  expect(download.suggestedFilename()).toBe('zvedennia-materials-2026-11-01-2026-11-30.csv');
  await page.screenshot({ path: info.outputPath('materials-matrix.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
});

test('worker sees and exports own settlements without administrative data', async ({ page }) => {
  await page.goto(`/dashboard/reports?${period}&role=worker&reportTab=postings`);
  await expect(page.getByRole('table', { name: 'Підсумок по одержувачах' })).toContainText('Маляр');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByText('Полірувальник', { exact: true })).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Завантажити CSV' }).click();
  const download = await downloading;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('Маляр');
  expect(csv).not.toContain('Полірувальник');
  expect(csv).not.toContain('Рух клієнтських коштів');
});

test('workshop process from EUR receipt through readiness and payout to correction reconciles with the period report', async ({
  page
}) => {
  test.setTimeout(60_000);
  await page.goto('/dashboard/inventory?flowDemo');
  const stock = page.getByRole('row').filter({ hasText: 'Фарба' });
  await stock.getByRole('button', { name: 'Дії з позицією Фарба', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Надходження', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Кількість', exact: false }).fill('1');
  await dialog.getByRole('textbox', { name: 'Загальна вартість надходження' }).fill('20');
  await dialog.getByRole('combobox', { name: 'Валюта' }).click();
  await page.getByRole('option', { name: 'Євро (EUR)', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Курс закупівлі, грн за 1 €' }).fill('50');
  await dialog.getByRole('button', { name: 'Додати надходження' }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/dashboard/orders?flowDemo&economicsDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('button', { name: 'Деталізувати чек', exact: true }).click();
  const form = page.getByRole('form', { name: 'Редагування деталізованого чека' });
  for (const [role, name] of [
    ['Маляр', 'Маляр Андрій'],
    ['Полірувальник', 'Олена Адміністратор']
  ] as const) {
    await form.getByRole('combobox', { name: role, exact: true }).click();
    const chooser = page.getByRole('dialog', { name: role, exact: true });
    await chooser.getByRole('option', { name, exact: true }).click();
    await expect(chooser).toBeHidden();
  }
  await form.getByRole('combobox', { name: 'Вид роботи 1' }).click();
  await page.getByRole('option', { name: 'Фарбування деталі', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Фарбування деталі', exact: true })).toBeHidden();
  await form.getByRole('textbox', { name: 'З цієї суми полірування, грн' }).fill('1000');
  await form.getByRole('button', { name: 'Зберегти деталізований чек' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const materials = page.getByRole('region', { name: 'Матеріали замовлення' });
  await materials.getByRole('button', { name: 'Додати списання' }).click();
  await materials.getByRole('combobox', { name: 'Матеріал' }).click();
  await page.getByRole('option', { name: /^Фарба/ }).click();
  await materials.getByRole('textbox', { name: 'Кількість', exact: false }).fill('0.8');
  await materials.getByRole('button', { name: 'Списати матеріал' }).click();
  await expect(materials).toContainText('Собівартість матеріалів: 800,00');
  async function payout(amount: string) {
    const payroll = page.getByRole('region', { name: 'Нарахування та виплати' });
    await payroll.getByRole('button', { name: 'Записати виплату / аванс', exact: true }).click();
    await payroll.getByRole('combobox', { name: 'Одержувач' }).click();
    await page.getByRole('option', { name: 'Маляр Андрій · Працівник', exact: true }).click();
    await payroll.getByRole('textbox', { name: 'Сума виплати / авансу, грн' }).fill(amount);
    await payroll.getByRole('button', { name: 'Зберегти фінансову операцію' }).click();
    await expect(
      payroll.getByRole('button', { name: 'Записати виплату / аванс', exact: true })
    ).toBeVisible();
  }
  await payout('1000');
  await page.goto('/dashboard/orders?flowDemo&role=worker');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await dialog.getByRole('button', { name: 'Позначити готовим', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/dashboard/orders?flowDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Нарахування та виплати' })).toContainText(
    'Нараховано: 9\u00a0720,00'
  );
  await payout('2000');
  await page.getByRole('button', { name: 'Фінансове коригування', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Причина фінансового коригування' })
    .fill('Додатково 0.2 л фарби');
  await page.getByRole('button', { name: 'Додати матеріал до коригування' }).click();
  await page.getByRole('combobox', { name: 'Матеріал 1' }).click();
  await page.getByRole('option', { name: /^Фарба ·/ }).click();
  await page.getByRole('textbox', { name: 'Кількість матеріалу 1' }).fill('0.2');
  await page.getByRole('button', { name: 'Переглянути коригування' }).click();
  await expect(
    page.getByRole('region', { name: 'Перегляд фінансового коригування' })
  ).toContainText('Маляр Андрій: -120,00');
  await page.getByRole('button', { name: 'Провести коригування', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/dashboard/reports?flowDemo');
  await expect(page.getByRole('region', { name: 'Підсумок проведень за період' })).toContainText(
    '10\u00a0200,00'
  );
  await page.getByRole('tab', { name: 'Розрахунки', exact: true }).click();
  const painter = page
    .getByRole('table', { name: 'Підсумок по одержувачах' })
    .getByRole('row')
    .filter({ hasText: 'Маляр Андрій' });
  await expect(painter).toContainText('6\u00a0600,00');
  await expect(painter).toContainText('3\u00a0000,00');
  await page.getByRole('tab', { name: 'Матеріали', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Матеріали × авто' })).toContainText('1 л');
});
