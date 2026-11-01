import { test, expect, type Page } from '@playwright/test';

async function openBoard(page: Page, suffix = '') {
  await page.clock.setFixedTime(new Date('2026-10-31T10:00:00Z'));
  await page.goto('/dashboard/kanban' + suffix);
  await expect(page.locator('[data-slot=kanban-column]')).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready);
}

test('kanban contains long content and aligns columns without page overflow', async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openBoard(page);
  const columns = page.locator('[data-slot=kanban-column]');
  const scroll = page.locator('[data-slot=crm-board-scroll]');
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(46);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(1700);
  await expect(page.getByRole('heading', { name: 'Backlog', exact: true })).toBeInViewport();
  const bounds = await columns.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        y: box.y,
        height: box.height,
        width: element.clientWidth,
        scroll: element.scrollWidth
      };
    })
  );
  for (const column of bounds) {
    expect(column.height).toBeCloseTo(bounds[0].height, 0);
    expect(column.y).toBeCloseTo(bounds[0].y, 0);
    expect(column.scroll).toBeLessThanOrEqual(column.width + 1);
  }
  expect(
    await page
      .locator('[data-slot=crm-board-card]')
      .evaluateAll((cards) => cards.every((card) => card.scrollWidth <= card.clientWidth + 1))
  ).toBe(true);
  await scroll.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('kanban.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await scroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(page.getByRole('heading', { name: 'Видано', exact: true })).toBeInViewport();
  await page.screenshot({
    path: info.outputPath('kanban-right.png'),
    fullPage: true,
    animations: 'disabled'
  });
  expect(errors).toEqual([]);
});

test('each column scrolls independently while its header remains stationary', async ({ page }) => {
  await openBoard(page);
  const column = page.locator('[data-slot=kanban-column]').first();
  const body = column.locator('[data-slot=crm-column-body]');
  const header = column.locator('[data-slot=crm-column-header]');
  const before = await header.boundingBox();
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  expect((await header.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  expect(
    await page
      .locator('[data-slot=crm-column-body]')
      .nth(1)
      .evaluate((element) => element.scrollTop)
  ).toBe(0);
  const action = column.getByRole('button', { name: 'Статус і дати', exact: true }).last();
  await action.focus();
  await expect(action).toBeInViewport();
  await expect(action).toBeFocused();
});

test('search has clear empty feedback and restores all records', async ({ page }) => {
  await openBoard(page);
  const search = page.getByRole('searchbox', { name: 'Пошук на дошці' });
  await search.fill('Надзвичайно');
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(1);
  await search.fill('no-such-car-999');
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(0);
  await expect(
    page.getByText('За вашим пошуком записів не знайдено.', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Очистити пошук', exact: true }).click();
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(46);
});

test('card actions open readable order and workflow dialogs', async ({ page }) => {
  await openBoard(page);
  const search = page.getByRole('searchbox', { name: 'Пошук на дошці' });
  await search.fill('Надзвичайно');
  await page.getByRole('button', { name: 'Замовлення', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const body = dialog.locator('[data-slot=crm-dialog-body]');
  expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await expect(
    dialog.getByRole('button', { name: 'Зберегти замовлення', exact: true })
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрити', exact: true }).click();
  await page.getByRole('button', { name: 'Статус і дати', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Статус *' })).toBeVisible();
});

test('empty columns and dark theme remain contained at narrow widths', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openBoard(page, '?empty&dark');
  await expect(page.getByText('Немає записів', { exact: true })).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.screenshot({
    path: info.outputPath('kanban-empty-narrow.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.goto('/dashboard/kanban?dark');
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(46);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'claude';
  });
  await page.locator('[data-slot=crm-board-scroll]').evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await page.screenshot({
    path: info.outputPath('kanban-dark-narrow.png'),
    fullPage: true,
    animations: 'disabled'
  });
});

test('keyboard drag preview retains card dimensions and Escape restores the board', async ({
  page
}, info) => {
  await openBoard(page);
  const scroll = page.locator('[data-slot=crm-board-scroll]');
  await scroll.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await scroll.evaluate((element) => {
    element.scrollLeft = 0;
  });
  const handle = page.locator('[data-slot=kanban-item-handle]').first();
  await handle.focus();
  await expect(handle).toBeFocused();
  const card = page.locator('[data-slot=crm-board-card]').first();
  const before = await card.boundingBox();
  await page.keyboard.press('Space');
  const preview = page.locator('[data-slot=crm-board-card][inert]');
  await expect(preview).toBeVisible();
  const after = await preview.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 0);
  expect(after!.height).toBeCloseTo(before!.height, 0);
  await page.screenshot({ path: info.outputPath('kanban-drag.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(46);
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(preview).toBeVisible();
  const startX =
    (await preview.boundingBox())!.x + (await scroll.evaluate((element) => element.scrollLeft));
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(
      async () =>
        (await preview.boundingBox())!.x + (await scroll.evaluate((element) => element.scrollLeft))
    )
    .toBeGreaterThan(startX + 30);
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Статус *' })).toContainText(
    'Заплановано'
  );
});

test('pointer drag opens confirmation without prematurely changing persisted status', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openBoard(page);
  const handle = page.locator('[data-slot=kanban-item-handle]').first();
  const source = await handle.boundingBox();
  const destination = await page
    .getByRole('heading', { name: 'Заплановано', exact: true })
    .boundingBox();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + 10, source!.y + 10, { steps: 3 });
  await page.mouse.move(
    destination!.x + destination!.width / 2,
    destination!.y + destination!.height / 2,
    { steps: 15 }
  );
  await page.mouse.up();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Статус *' })).toContainText('Заплановано');
  await dialog.getByRole('button', { name: 'Закрити', exact: true }).click();
  await expect(
    page.locator('[data-slot=kanban-column]').first().locator('[data-slot=crm-board-card]')
  ).toHaveCount(11);
});
