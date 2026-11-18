import { expect, test } from '@playwright/test';

test('large board keeps typing responsive and searches records beyond the first batch', async ({
  page
}, info) => {
  test.setTimeout(60000);
  await page.goto('/dashboard/kanban?largeBoard');
  const cards = page.locator('[data-slot=crm-board-card]');
  await expect(cards.first()).toBeVisible();
  const initialCards = await cards.count();
  expect(initialCards).toBe(150);
  await expect(page.getByText('Знайдено 1200 із 1200', { exact: true })).toBeVisible();
  await expect(page.getByText('Замовлення №1000', { exact: true })).toHaveCount(0);
  const initialCommits = await page.evaluate(
    () => (window as unknown as { boardProfile: unknown[] }).boardProfile.length
  );
  const search = page.getByRole('searchbox', { name: 'Пошук на дошці' });
  const started = Date.now();
  await search.pressSequentially('Ремонт', { delay: 35 });
  await expect(search).toHaveValue('Ремонт');
  await expect(search).toHaveAttribute('aria-busy', 'false');
  const renders = await page.evaluate(
    (offset) =>
      (
        window as unknown as { boardProfile: { phase: string; duration: number }[] }
      ).boardProfile.slice(offset),
    initialCommits
  );
  await info.attach('search-profile.json', {
    body: JSON.stringify({
      initialCards,
      elapsed: Date.now() - started,
      renders,
      totalRenderMs: renders.reduce((sum, render) => sum + render.duration, 0)
    }),
    contentType: 'application/json'
  });
  await search.fill('RareNeedle');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Замовлення №1000');
});

test('one shared button reveals all columns and search resets the shared batch size', async ({
  page
}) => {
  await page.goto('/dashboard/kanban?largeBoard');
  const backlog = page
    .locator('[data-slot=kanban-column]')
    .filter({ has: page.getByRole('heading', { name: 'Backlog', exact: true }) });
  const cards = backlog.locator('[data-slot=crm-board-card]');
  await expect(cards).toHaveCount(25);
  await expect(backlog.locator('[data-slot=crm-column-header]')).toContainText('100');
  const more = page.getByRole('button', { name: 'Показати ще', exact: true });
  await expect(more).toHaveCount(1);
  await expect(more).not.toBeInViewport();
  const board = page.locator('[data-slot=crm-board-scroll]');
  const boardBounds = (await board.boundingBox())!;
  const buttonBounds = (await more.boundingBox())!;
  expect(buttonBounds.y).toBeGreaterThanOrEqual(boardBounds.y + boardBounds.height);
  await expect(
    page
      .locator('[data-slot=crm-board-footer]')
      .getByRole('button', { name: 'Показати ще', exact: true })
  ).toHaveCount(1);
  await more.scrollIntoViewIfNeeded();
  await expect(more).toBeInViewport({ ratio: 1 });
  await board.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const scrollLeft = await board.evaluate((element) => element.scrollLeft);
  await expect(backlog.getByRole('button', { name: /Показати ще/ })).toHaveCount(0);
  await more.click();
  await expect(cards).toHaveCount(50);
  expect(await board.evaluate((element) => element.scrollLeft)).toBe(scrollLeft);
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(300);
  for (const column of await page.locator('[data-slot=kanban-column]').all()) {
    await expect(column.locator('[data-slot=crm-board-card]')).toHaveCount(50);
  }
  await expect(page.getByText('Показано 300 із 1200', { exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Пошук на дошці' });
  await search.fill('Ремонт');
  await expect(search).toHaveAttribute('aria-busy', 'false');
  await expect(cards).toHaveCount(25);
  await search.fill('no-such-record');
  await expect(
    page.getByText('За вашим пошуком записів не знайдено.', { exact: true })
  ).toBeVisible();
  // Cancel a newer, still-debounced query when clearing the empty-state results.
  await search.fill('RareNeedle');
  await page.getByRole('button', { name: 'Очистити пошук', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(150);
  await expect(search).toHaveAttribute('aria-busy', 'false');
  await expect(more).toBeVisible();
  // A shared limit stops adding to exhausted columns and disappears once all records are visible.
  for (let batch = 0; batch < 9; batch++) await more.click();
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(1200);
  await expect(cards).toHaveCount(100);
  await expect(more).toHaveCount(0);
  await expect(page.getByText('Показано 1200 із 1200', { exact: true })).toBeVisible();
});

test('workers search all orders in batches without receiving request columns or drag handles', async ({
  page
}) => {
  await page.goto('/dashboard/kanban?largeBoard&role=worker');
  await expect(page.locator('[data-slot=kanban-column]')).toHaveCount(4);
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(100);
  await expect(page.getByText('Знайдено 1000 із 1000', { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot=kanban-item-handle]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Показати ще', exact: true }).click();
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(200);
  await page.getByRole('searchbox', { name: 'Пошук на дошці' }).fill('RareNeedle');
  await expect(page.locator('[data-slot=crm-board-card]')).toHaveCount(1);
  await expect(page.locator('[data-slot=crm-board-card]')).toContainText('Замовлення №1000');
});

test('load more keeps its chevron and text aligned on a single line', async ({ page }, info) => {
  await page.goto('/dashboard/kanban?largeBoard');
  const more = page.getByRole('button', { name: 'Показати ще', exact: true });
  await more.scrollIntoViewIfNeeded();
  const icon = (await more.locator('svg').boundingBox())!;
  const text = (await more.getByText('Показати ще', { exact: true }).boundingBox())!;
  const button = (await more.boundingBox())!;
  expect(Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2)).toBeLessThan(1);
  expect(icon.x + icon.width).toBeLessThan(text.x);
  expect(text.y).toBeGreaterThan(button.y);
  expect(text.y + text.height).toBeLessThan(button.y + button.height);
  await more.screenshot({ path: info.outputPath('load-more.png') });
});
