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
  await expect(page.getByRole('region', { name: 'Підсумок по одержувачах' })).toContainText(
    'Маляр'
  );
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

test('new readiness snapshots reconcile payroll and workshop income without a paid check', async ({
  page
}) => {
  await page.goto('/dashboard/orders?flowDemo&economicsDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('combobox', { name: 'Відповідальний', exact: false }).click();
  await page.getByRole('option', { name: /Маляр Андрій/ }).click();
  await page.getByRole('button', { name: 'Зберегти замовлення', exact: true }).click();
  await page.goto('/dashboard/orders?flowDemo&role=worker');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('button', { name: 'Позначити готовим', exact: true }).click();
  await expect(page.getByText('Замовлення готове.', { exact: true })).toBeVisible();
  await page.goto('/dashboard/reports?flowDemo');
  const metrics = page.getByRole('region', { name: 'Підсумок проведень за період' });
  await expect(metrics).toContainText('18\u00a0000,00');
  await expect(metrics).toContainText('10\u00a0800,00');
  await expect(metrics).toContainText('7\u00a0200,00');
  await page.getByRole('tab', { name: 'Розрахунки', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Деталі розрахунків: Маляр Андрій', exact: true })
  ).toBeVisible();
});
