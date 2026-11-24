import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import type { StockItem } from '../../src/features/inventory/api/types';

test('warehouse reads one page at a time, searches beyond it and exports every matching page', async ({
  page
}, info) => {
  const items: StockItem[] = Array.from({ length: 63 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1000).padStart(12, '0')}`,
    name: `Матеріал ${String(index).padStart(3, '0')}`,
    unit: 'л',
    notes: '',
    tags: ['Розхідник'],
    archived: false,
    locked: false,
    balanceMilli: 1000,
    totalCostCents: 10000,
    valuationRevision: 0
  }));
  const requested: number[] = [];
  await page.route('**/api/inventory/items?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const query = params.get('search') ?? '',
      number = Number(params.get('page') ?? 1),
      pageSize = Number(params.get('pageSize') ?? 50);
    const filtered = items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
    requested.push(number);
    await route.fulfill({
      json: {
        items: filtered.slice((number - 1) * pageSize, number * pageSize),
        page: number,
        pageSize,
        total: filtered.length
      }
    });
  });
  await page.goto('/dashboard/inventory');
  const rows = page.getByRole('table').locator('tbody tr');
  await expect(rows).toHaveCount(50);
  await expect(page.getByText('Знайдено позицій: 63', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Наступна сторінка', exact: true }).click();
  await expect(rows).toHaveCount(13);
  await expect(page).toHaveURL(/stockPage=2/);
  await expect(rows.first()).toContainText('Матеріал 050');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Експортувати склад в Excel' }).click();
  const download = await downloading;
  const path = info.outputPath('all-pages.xlsx');
  await download.saveAs(path);
  const files = unzipSync(await readFile(path));
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  const strings = strFromU8(files['xl/sharedStrings.xml']);
  expect((sheet.match(/<row\b/g) ?? []).length).toBe(64);
  for (const item of items) expect(strings).toContain(item.name);
  const input = page.getByRole('textbox', { name: 'Пошук складських позицій' });
  await input.fill('Матеріал 062');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Матеріал 062');
  await expect(page).not.toHaveURL(/stockPage=2/);
  expect(requested).toContain(2);
});
