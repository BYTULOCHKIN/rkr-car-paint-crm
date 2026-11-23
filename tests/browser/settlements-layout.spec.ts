import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const route = '/dashboard/reports?reportFrom=2026-11-01&reportTo=2026-11-30&reportTab=settlements';

test('settlements separate debt from advances and show personal car details and history', async ({
  page
}, info) => {
  await page.goto(route);
  const summary = page.getByRole('region', { name: 'Підсумок розрахунків', exact: true });
  await expect(summary).toContainText('300,00');
  await expect(summary).toContainText('3 000,00');
  await expect(page.getByRole('table', { name: 'Баланси по авто' })).toHaveCount(0);
  await expect(page.getByLabel('Відбір на вкладці «Авто»', { exact: true })).toHaveCount(0);
  if (info.project.name === 'desktop') {
    await expect(
      page.getByRole('table', { name: 'Підсумок по одержувачах' }).getByRole('columnheader')
    ).toHaveCount(5);
  } else {
    await expect(
      page.getByRole('article', { name: 'Розрахунки: Маляр', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('table', { name: 'Підсумок по одержувачах' })).toHaveCount(0);
  }
  await page.screenshot({ path: info.outputPath('settlements-main.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Деталі розрахунків: Маляр', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Розрахунки — Маляр', exact: true });
  const cars = dialog.getByRole('table', { name: 'Баланси по авто' });
  await expect(cars).toContainText('№1');
  await expect(cars).toContainText('№2');
  await expect(dialog).not.toContainText('Полірувальник');
  await page.screenshot({
    path: info.outputPath('settlements-person.png'),
    animations: 'disabled'
  });
  await dialog.getByRole('tab', { name: 'Історія операцій', exact: true }).click();
  await expect(dialog.getByRole('table', { name: 'Операції розрахунків' })).toContainText(
    'Виплата / аванс'
  );
  await dialog.getByText('Повний рух розрахунків', { exact: true }).click();
  await expect(dialog.getByText('Початковий баланс (±)', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
});

test('recipient search and type filter persist in the URL and scope the entire CSV', async ({
  page
}) => {
  await page.goto(route);
  await page.getByRole('searchbox', { name: 'Пошук одержувача', exact: true }).fill('Маляр');
  const people = page.getByRole('region', { name: 'Підсумок по одержувачах', exact: true });
  await expect(people).not.toContainText('Полірувальник');
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Пошук одержувача', exact: true })).toHaveValue(
    'Маляр'
  );
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Завантажити CSV', exact: true }).click();
  const download = await downloading;
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('Маляр');
  expect(csv).not.toContain('Полірувальник');
  expect(csv).toContain('3000,00');
  await page.getByRole('combobox', { name: 'Кого показувати', exact: true }).click();
  await page.getByRole('option', { name: 'Підрядники', exact: true }).click();
  await expect(page.getByText('Одержувачів не знайдено', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Скинути пошук і фільтр', exact: true }).click();
  await expect(people).toContainText('Полірувальник');
});

test('workers keep their personal results even with administrative search filters in the URL', async ({
  page
}) => {
  await page.goto(`${route}&role=worker&settlementSearch=Полірувальник&settlementKind=contractor`);
  await expect(page.getByRole('heading', { name: 'Ваші розрахунки', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Деталі розрахунків: Маляр', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Пошук одержувача', exact: true })).toHaveCount(
    0
  );
  await expect(page.getByText('Полірувальник', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
});
