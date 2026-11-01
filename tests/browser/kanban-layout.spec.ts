import { test, expect } from '@playwright/test';

test('production sidebar layout contains the board and keeps Delivered reachable', async ({
  page
}, info) => {
  await page.goto('/dashboard/kanban');
  await expect(page.locator('[data-slot=kanban-column]')).toHaveCount(5);
  const main = page.locator('[data-slot=sidebar-inset]');
  const board = page.locator('[data-slot=crm-board-scroll]');
  const widths = await page.evaluate(() => {
    const main = document.querySelector('[data-slot=sidebar-inset]')!;
    const board = document.querySelector('[data-slot=crm-board-scroll]')!;
    return {
      screen: innerWidth,
      page: document.documentElement.scrollWidth,
      main: main.getBoundingClientRect().width,
      mainRight: main.getBoundingClientRect().right,
      board: board.clientWidth,
      content: board.scrollWidth
    };
  });
  await info.attach('widths.json', {
    body: JSON.stringify(widths),
    contentType: 'application/json'
  });
  await page.screenshot({
    path: info.outputPath('sidebar-layout.png'),
    fullPage: true,
    animations: 'disabled'
  });
  expect(widths.main).toBeLessThanOrEqual(widths.screen);
  expect(widths.mainRight).toBeLessThanOrEqual(widths.screen + 1);
  expect(widths.board).toBeLessThan(widths.content);
  expect(widths.page).toBeLessThanOrEqual(widths.screen + 1);
  await board.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(page.getByRole('heading', { name: 'Видано', exact: true })).toBeInViewport({
    ratio: 1
  });
  await expect(main).toBeVisible();
});

test('visible navigation buttons reach Delivered and return to Backlog', async ({ page }, info) => {
  await page.goto('/dashboard/kanban');
  const board = page.locator('[data-slot=crm-board-scroll]');
  const next = page.getByRole('button', { name: 'Прокрутити дошку праворуч', exact: true });
  const previous = page.getByRole('button', { name: 'Прокрутити дошку ліворуч', exact: true });
  await expect(next).toBeEnabled();
  await expect(previous).toBeDisabled();
  for (let step = 0; step < 8 && (await next.isEnabled()); step++) {
    const before = await board.evaluate((element) => element.scrollLeft);
    await next.click();
    await expect
      .poll(() => board.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(before);
  }
  await expect(next).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Видано', exact: true })).toBeInViewport({
    ratio: 1
  });
  await page.evaluate(() => document.fonts.ready);
  const beforeCapture = await board.evaluate((element) => element.scrollLeft);
  await page.screenshot({
    path: info.outputPath('delivered.png'),
    fullPage: false,
    animations: 'allow'
  });
  const afterCapture = await board.evaluate((element) => element.scrollLeft);
  await info.attach('scroll-position.json', {
    body: JSON.stringify({ beforeCapture, afterCapture }),
    contentType: 'application/json'
  });
  await expect(page.getByRole('heading', { name: 'Видано', exact: true })).toBeInViewport({
    ratio: 1
  });
  for (let step = 0; step < 8 && (await previous.isEnabled()); step++) {
    const before = await board.evaluate((element) => element.scrollLeft);
    await previous.click();
    await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeLessThan(before);
  }
  await expect(previous).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Backlog', exact: true })).toBeInViewport({
    ratio: 1
  });
});

test('open and collapsed sidebars never expand the page at common desktop widths', async ({
  page
}) => {
  for (const width of [768, 1024, 1280, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const sidebar of ['open', 'closed']) {
      await page.goto(`/dashboard/kanban?sidebar=${sidebar}`);
      await expect(page.locator('[data-slot=kanban-column]')).toHaveCount(5);
      const bounds = await page.locator('[data-slot=sidebar-inset]').boundingBox();
      expect(bounds!.x + bounds!.width, `${width}px, sidebar ${sidebar}`).toBeLessThanOrEqual(
        width + 1
      );
      const board = page.locator('[data-slot=crm-board-scroll]');
      const box = await board.boundingBox();
      expect(box!.x + box!.width, `${width}px, board ${sidebar}`).toBeLessThanOrEqual(width + 1);
      await board.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      const last = await page.getByRole('heading', { name: 'Видано', exact: true }).boundingBox();
      expect(last!.x + last!.width).toBeLessThanOrEqual(width + 1);
    }
  }
});

test('navigation adapts when sidebar or viewport changes and disables when all columns fit', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard/kanban');
  await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
  await expect(page.locator('[data-slot=sidebar][data-state]')).toHaveAttribute(
    'data-state',
    'collapsed'
  );
  await page.getByRole('button', { name: 'Прокрутити дошку праворуч', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Видано', exact: true })).toBeInViewport({
    ratio: 1
  });
  await page.setViewportSize({ width: 2560, height: 1200 });
  await expect(
    page.getByRole('button', { name: 'Прокрутити дошку праворуч', exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Прокрутити дошку ліворуч', exact: true })
  ).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Видано', exact: true })).toBeInViewport({
    ratio: 1
  });
});
