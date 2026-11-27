import { expect, test } from '@playwright/test';
import type { StockItem } from '../../src/features/inventory/api/types';

test('cards share search results, remember the layout and lazily load item details', async ({
  page
}) => {
  await page.goto('/dashboard/inventory');
  await expect(page.getByRole('table')).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Пошук складських позицій' });
  await search.fill('Фарба');
  await expect(page.getByRole('row')).toHaveCount(2);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/inventory/')) requests.push(request.url());
  });
  await page.getByRole('button', { name: 'Вигляд картками' }).click();
  const list = page.getByRole('list', { name: 'Складські позиції — картки' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByText('В наявності', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  const history = page.waitForResponse((response) =>
    response.url().includes('/api/inventory/movements?')
  );
  await list.getByRole('button', { name: 'Деталі позиції Фарба', exact: true }).click();
  await history;
  const dialog = page.getByRole('dialog', { name: 'Деталі складської позиції' });
  await expect(dialog.getByRole('heading', { name: 'Фарба', exact: true })).toBeVisible();
  await expect(dialog.getByText('Фарба_зелена', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Історія операцій', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Примітку не додано.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Дії з позицією Фарба', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Редагувати', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Редагування позиції' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(list).toBeVisible();
  await expect(search).toHaveValue('Фарба');
  await page.getByRole('tab', { name: 'Останні операції', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали', exact: true }).click();
  await expect(list).toBeVisible();
});

test('amount-only materials have no availability badge in cards or details; zero quantity does', async ({
  page
}, info) => {
  await page
    .context()
    .addCookies([{ name: 'active_theme', value: 'supabase', url: 'http://127.0.0.1:4173' }]);
  await page.goto('/dashboard/inventory?settingsDemo=1');
  for (const amount of [true, false]) {
    await page.getByRole('button', { name: 'Нова позиція', exact: true }).click();
    const create = page.getByRole('dialog');
    await create
      .getByRole('textbox', { name: 'Назва позиції' })
      .fill(amount ? 'Фарба за сумою' : 'Матеріал без залишку');
    if (amount) {
      await create.getByRole('combobox', { name: 'Облік матеріалу' }).click();
      await page.getByRole('option', { name: 'За сумою', exact: true }).click();
    }
    await create.getByRole('button', { name: 'Створити позицію', exact: true }).click();
    await expect(create).toBeHidden();
  }
  await page.getByRole('button', { name: 'Вигляд картками' }).click();
  const list = page.getByRole('list', { name: 'Складські позиції — картки' });
  const amount = list
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Фарба за сумою', exact: true }) });
  await expect(amount.getByText('За сумою', { exact: true })).toBeVisible();
  await expect(amount.locator('[data-slot=badge]:not([data-stock-tag])')).toHaveCount(0);
  await expect(list.getByText('Немає залишку', { exact: true })).toHaveCount(1);
  await amount.getByRole('button', { name: 'Деталі позиції Фарба за сумою', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Деталі складської позиції' });
  await expect(dialog.locator('[data-slot=badge]:not([data-stock-tag])')).toHaveCount(0);
  await expect(dialog.getByText('Без контролю залишку', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('inventory-cards.png'), fullPage: true });
});

test('workers can inspect cards and history without stock write actions', async ({ page }) => {
  await page
    .context()
    .addCookies([{ name: 'active_theme', value: 'notebook', url: 'http://127.0.0.1:4173' }]);
  await page.goto('/dashboard/inventory?role=worker&settingsDemo=1&dark=1');
  await page.getByRole('button', { name: 'Вигляд картками' }).click();
  await expect(page.getByRole('button', { name: 'Нова позиція', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Деталі позиції Фарба', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Деталі складської позиції' });
  await dialog.getByRole('button', { name: 'Дії з позицією Фарба', exact: true }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Історія']);
  await page.getByRole('menuitem', { name: 'Історія', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Історія позиції' })).toBeVisible();
});

test('cards and table retain the same server page and archive filter', async ({ page }) => {
  await page.route('**/api/inventory/items?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const current = Number(params.get('page') ?? 1);
    const archived = params.get('archived') === 'true';
    const items: StockItem[] = Array.from({ length: current === 1 ? 50 : 5 }, (_, index) => ({
      id: `item-${(current - 1) * 50 + index + 1}`,
      name: `Матеріал ${(current - 1) * 50 + index + 1}`,
      unit: 'шт',
      tags: ['Розхідник'],
      notes: '',
      archived,
      locked: false,
      balanceMilli: 1000,
      totalCostCents: 10000,
      valuationRevision: 0
    }));
    await route.fulfill({ json: { items, total: 55, page: current, pageSize: 50 } });
  });
  await page.goto('/dashboard/inventory');
  await expect(page.getByRole('row')).toHaveCount(51);
  await page.getByRole('button', { name: 'Вигляд картками' }).click();
  const list = page.getByRole('list', { name: 'Складські позиції — картки' });
  await expect(list.getByRole('listitem')).toHaveCount(50);
  await page.getByRole('button', { name: 'Наступна сторінка' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(5);
  await expect(list.getByRole('heading', { name: 'Матеріал 51', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Вигляд таблицею' }).click();
  await expect(page.getByRole('row')).toHaveCount(6);
  await expect(page).toHaveURL(/stockPage=2/);
  await page.getByRole('button', { name: 'Показати архів', exact: true }).click();
  await expect(page).toHaveURL(/stockArchived=true/);
  await page.getByRole('button', { name: 'Вигляд картками' }).click();
  const card = list.getByRole('listitem').first();
  await card.getByRole('button', { name: /^Дії з позицією/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Відновити', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Надходження', exact: true })).toHaveCount(0);
});
