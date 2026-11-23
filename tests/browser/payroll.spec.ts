import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { businessToday } from '../../src/features/crm/lib/workflow';
import { previousPayrollMonth } from '../../src/features/payroll/schemas/filters';

const november = '/dashboard/payroll?payrollFrom=2026-11-01&payrollTo=2026-11-30';

test('payroll lists earnings and opens per-car calculations with a numeric CSV and no payout controls', async ({
  page
}, info) => {
  await page.goto(november);
  const table = page.getByRole('table', { name: 'Зарплати команди', exact: true });
  await expect(table.getByRole('button', { name: 'Зарплата: Сергій', exact: true })).toBeVisible();
  await expect(table).toContainText('8 400,00');
  await expect(table).toContainText('300,00');
  for (const label of ['Виплачено', 'До виплати', 'Аванси', 'Зареєструвати виплату'])
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Пошук працівника', exact: true }).fill('Сергій');
  await expect(table.getByRole('button', { name: 'Зарплата: Валик', exact: true })).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Завантажити CSV', exact: true }).click();
  const download = await downloading;
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('Сергій');
  expect(csv).toContain('8400,00');
  expect(csv).not.toContain('Валик');
  expect(csv).not.toContain('Виплати');
  await table.getByRole('button', { name: 'Зарплата: Сергій', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Зарплата — Сергій', exact: true });
  const details = dialog.getByRole('table', { name: 'Нарахування: Сергій', exact: true });
  await expect(details).toContainText('№1');
  await expect(details).toContainText('60%');
  await expect(details).toContainText('14 000,00');
  await expect(details.getByText('№1', { exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('payroll-details.png'), animations: 'disabled' });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(table.getByRole('button', { name: 'Зарплата: Сергій', exact: true })).toBeFocused();
});

test('date selection shows only correction deltas, persists on reload and supports month presets', async ({
  page
}, info) => {
  await page.goto(november);
  await page.getByLabel('Початок періоду *', { exact: true }).fill('2026-12-01');
  await page.getByLabel('Кінець періоду *', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: 'Показати зарплати', exact: true }).click();
  const table = page.getByRole('table', { name: 'Зарплати команди', exact: true });
  await expect(table).toContainText('-600,00');
  await expect(page).toHaveURL(/payrollFrom=2026-12-01/);
  await page.reload();
  await expect(table).toContainText('-600,00');
  await page.screenshot({ path: info.outputPath('payroll-period.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Минулий місяць', exact: true }).click();
  const previous = previousPayrollMonth(businessToday());
  await expect(page.getByLabel('Початок періоду *', { exact: true })).toHaveValue(previous.from);
  await expect(page.getByLabel('Кінець періоду *', { exact: true })).toHaveValue(previous.to);
  await page.getByRole('button', { name: 'Поточний місяць', exact: true }).click();
  await expect(page.getByLabel('Кінець періоду *', { exact: true })).toHaveValue(businessToday());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
});

test('worker sees and exports only personal earnings even with another employee in the URL', async ({
  page
}) => {
  await page.goto(`${november}&role=worker&payrollSearch=Валик`);
  await expect(page.getByText('Показано тільки ваші нарахування.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Зарплата: Сергій', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByText('Валик', { exact: true })).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Завантажити CSV', exact: true }).click();
  const download = await downloading;
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('Сергій');
  expect(csv).not.toContain('Валик');
  expect(csv).not.toContain('payout');
});

test('invalid periods show an error and can be corrected; empty searches show a clear empty state', async ({
  page
}) => {
  await page.goto('/dashboard/payroll?payrollFrom=2026-12-01&payrollTo=2026-11-01');
  await expect(page.getByRole('alert')).toContainText('Кінець періоду');
  await expect(page.getByRole('table', { name: 'Зарплати команди', exact: true })).toHaveCount(0);
  await page.getByLabel('Початок періоду *', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Кінець періоду *', { exact: true }).fill('2026-11-30');
  await page.getByRole('button', { name: 'Показати зарплати', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Пошук працівника', exact: true })
    .fill('Невідомий працівник');
  await expect(page.getByText('Немає записів', { exact: true })).toBeVisible();
});
