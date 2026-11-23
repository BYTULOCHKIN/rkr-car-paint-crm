import { expect, test } from '@playwright/test';

test('collapsed work board link receives pointer clicks across group boundaries', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard/orders?realSidebar&sidebar=closed');
  const board = page.getByRole('link', { name: 'Дошка робіт', exact: true });
  await expect(board).toBeVisible();
  await expect
    .poll(() =>
      board.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return element === hit || element.contains(hit)
          ? 'Дошка робіт'
          : hit?.getAttribute('data-slot');
      })
    )
    .toBe('Дошка робіт');
  await board.click();
  await expect(page).toHaveURL(/\/dashboard\/kanban$/);
});

test('primary CRM icons are distinct and collapsed group labels do not intercept links', async ({
  page
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard/orders?realSidebar&sidebar=closed');
  const group = page.locator('[data-slot=sidebar-group]').first();
  const buttons = group.getByRole('link').or(group.getByRole('button'));
  const icons = await buttons.evaluateAll((elements) =>
    elements.map((element) => element.querySelector('svg')?.innerHTML)
  );
  expect(icons).toHaveLength(9);
  expect(icons.every(Boolean)).toBe(true);
  expect(new Set(icons).size).toBe(icons.length);
  for (const name of [
    'Огляд',
    'Замовлення',
    'Зарплати',
    'Склад',
    'Автомалярки',
    'Команда',
    'Дошка робіт'
  ]) {
    const link = group.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await expect
      .poll(() =>
        link.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return element === hit || element.contains(hit);
        })
      )
      .toBe(true);
  }
  for (const name of ['Product', 'Users', 'AI Chat', 'Icons', 'Chat'])
    await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('sidebar-collapsed.png'), animations: 'disabled' });
});

test('work board is reachable from the mobile sidebar drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/orders?realSidebar');
  await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
  const board = page.getByRole('link', { name: 'Дошка робіт', exact: true });
  await expect(board).toBeVisible();
  await board.click();
  await expect(page).toHaveURL(/\/dashboard\/kanban$/);
});

test('work board remains accessible after expanding and collapsing and with worker permissions', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard/orders?realSidebar&sidebar=closed&role=worker&dark');
  await expect(page.getByRole('link', { name: 'Заявки', exact: true })).toHaveCount(0);
  for (const name of ['Огляд', 'Клієнти та автомобілі']) {
    const unavailable = page.getByRole('button', { name, exact: true });
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toBeDisabled();
    await expect
      .poll(() =>
        unavailable.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return hit ? getComputedStyle(hit).cursor : null;
        })
      )
      .toBe('not-allowed');
    await unavailable.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page).toHaveURL(
      /\/dashboard\/orders\?realSidebar&sidebar=closed&role=worker&dark$/
    );
  }
  for (const name of ['Замовлення', 'Зарплати', 'Склад', 'Команда', 'Дошка робіт']) {
    await expect(
      page.locator('[data-slot=sidebar]').getByRole('link', { name, exact: true })
    ).toBeEnabled();
  }
  const toggle = page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).first();
  const board = page.getByRole('link', { name: 'Дошка робіт', exact: true });
  await toggle.click();
  await expect(page.locator('[data-slot=sidebar]')).toHaveAttribute('data-state', 'expanded');
  await toggle.click();
  await expect(page.locator('[data-slot=sidebar]')).toHaveAttribute('data-state', 'collapsed');
  await board.focus();
  await board.press('Enter');
  await expect(page).toHaveURL(/\/dashboard\/kanban$/);
});
