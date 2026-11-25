import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-31T10:00:00Z'));
});

test('presets and custom dates update period metrics while retaining current workload', async ({
  page
}, info) => {
  await page.goto('/dashboard/overview');
  await expect(page.getByRole('button', { name: 'Поточний місяць', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: 'Минулий місяць', exact: true }).click();
  await expect(page).toHaveURL(/overviewFrom=2026-09-01.*overviewTo=2026-09-30/);
  await expect(page.getByLabel('Початок періоду')).toHaveValue('2026-09-01');
  await expect(page.getByLabel('Кінець періоду')).toHaveValue('2026-09-30');
  await expect(page.getByRole('link', { name: /^Завершено за період: 0\./ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Замовлення в роботі: 22\./ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Минулий місяць', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByLabel('Початок періоду').fill('2026-10-31');
  await page.getByLabel('Кінець періоду').fill('2026-10-31');
  await page.getByRole('button', { name: 'Показати огляд', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Завершено за період: 1\./ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Завершено за період:/ })).toHaveAttribute(
    'href',
    /overviewMetric=completed&overviewFrom=2026-10-31&overviewTo=2026-10-31/
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.screenshot({
    path: info.outputPath('overview-period.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.getByRole('button', { name: 'Поточний місяць', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Завершено цього місяця: 2\./ })).toBeVisible();
});

test('cards open the corresponding order cohort and the scope can be cleared', async ({ page }) => {
  await page.goto('/dashboard/overview');
  for (const [label, metric] of [
    ['Прибуток фірми', 'profit'],
    ['Надходження за період', 'receipts'],
    ['Заборгованість за готовими авто', 'ready_debt'],
    ['До сплати за відкритими авто', 'open_debt']
  ] as const) {
    await expect(page.getByRole('link', { name: new RegExp(`^${label}:`) })).toHaveAttribute(
      'href',
      new RegExp(`overviewMetric=${metric}&overviewFrom=2026-10-01&overviewTo=2026-10-31`)
    );
  }
  await page.getByRole('link', { name: /^Завершено цього місяця:/ }).click();
  await expect(page).toHaveURL(/overviewMetric=completed/);
  await expect(page.getByRole('table', { name: 'Замовлення' }).locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText(/Завершені замовлення · 2026-10-01/)).toBeVisible();
  await page.getByRole('button', { name: 'Скинути відбір з огляду', exact: true }).click();
  await expect(page).not.toHaveURL(/overviewMetric=/);
  await expect(page.getByRole('table', { name: 'Замовлення' }).locator('tbody tr')).toHaveCount(10);
});

test('invalid ranges never show unrelated totals and can be corrected', async ({ page }) => {
  await page.goto('/dashboard/overview?overviewFrom=2026-11-20&overviewTo=2026-11-01');
  await expect(page.getByRole('alert')).toContainText('Перевірте період огляду');
  await expect(page.getByRole('link', { name: /^Прибуток фірми:/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Поточний місяць', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Завершено цього місяця:/ })).toBeVisible();
  await page.getByLabel('Кінець періоду').fill('2026-09-01');
  await page.getByRole('button', { name: 'Показати огляд', exact: true }).click();
  await expect(
    page.getByText('Кінець періоду не може бути раніше початку', { exact: true })
  ).toBeVisible();
  await expect(page).toHaveURL(/overviewTo=2026-10-31/);
});
