import { expect, test, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

test('typing remains immediate while an earlier server search is slow and stale results cannot replace the latest response', async ({
  page
}) => {
  const { promise: gate, resolve: release } = Promise.withResolvers<void>();
  const { promise: completed, resolve: complete } = Promise.withResolvers<void>();
  await page.route('**/api/inventory/items?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('search') !== 'Лак') {
      await route.continue();
      return;
    }
    await gate;
    // The client may already have aborted this obsolete request.
    await route.fulfill({ json: { items: [] } }).catch(() => undefined);
    complete();
  });
  try {
    await page.goto('/dashboard/inventory');
    const paint = page.getByRole('row').filter({ hasText: 'Фарба_зелена' });
    const lacquer = page.getByRole('row').filter({ hasText: 'Лак (старий залишок)' });
    await expect(paint).toBeVisible();
    await expect(lacquer).toBeVisible();
    const input = page.getByRole('textbox', { name: 'Пошук складських позицій' });
    const slowRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/inventory/items?') &&
        new URL(request.url()).searchParams.get('search') === 'Лак'
    );
    await input.fill('Лак');
    await slowRequest;
    const latestResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/inventory/items?') &&
        new URL(response.url()).searchParams.get('search') === 'Фарба'
    );
    await input.fill('Фарба');
    await expect(input).toHaveValue('Фарба');
    expect((await latestResponse).status()).toBe(200);
    await expect(lacquer).toBeHidden();
    await expect(paint).toBeVisible();
    release();
    await completed;
    await expect(paint).toBeVisible();
    await expect(input).toHaveValue('Фарба');
  } finally {
    release();
  }
});

test('warehouse search updates input immediately and filters only after a 300ms pause', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-11-24T12:00:00Z') });
  await page.goto('/dashboard/inventory');
  const paint = page.getByRole('row').filter({ hasText: 'Фарба_зелена' });
  const lacquer = page.getByRole('row').filter({ hasText: 'Лак (старий залишок)' });
  await expect(paint).toBeVisible();
  await expect(lacquer).toBeVisible();
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/inventory/items?')) requests.push(request.url());
  });
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 10_000));
  const input = page.getByRole('textbox', { name: 'Пошук складських позицій' });
  const exportButton = page.getByRole('button', {
    name: 'Експортувати склад в Excel',
    exact: true
  });
  await input.fill('Лак');
  await expect(input).toHaveValue('Лак');
  await expect(input).toHaveAttribute('aria-busy', 'true');
  await expect(exportButton).toBeDisabled();
  await page.clock.runFor(200);
  await expect(paint).toBeVisible();
  await input.fill('Фарба');
  await page.clock.runFor(299);
  await expect(lacquer).toBeVisible();
  expect(requests).toHaveLength(0);
  const response = page.waitForResponse(
    (response) =>
      response.url().includes('/api/inventory/items?') &&
      new URL(response.url()).searchParams.get('search') === 'Фарба'
  );
  await page.clock.runFor(1);
  const received = await response;
  expect(received.status()).toBe(200);
  await received.finished();
  await page.clock.runFor(20);
  await expect(lacquer).toBeHidden();
  await expect(paint).toBeVisible();
  await expect(input).toHaveAttribute('aria-busy', 'false');
  await expect(exportButton).toBeEnabled();
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.get('search')).toBe('Фарба');
  await input.fill('Застарілий пошук');
  await page.getByRole('button', { name: 'Скинути пошук і теги', exact: true }).click();
  await page.clock.runFor(700);
  await expect(input).toHaveValue('');
  await expect(paint).toBeVisible();
  await expect(lacquer).toBeVisible();
});

test('tags have their own column and the overflow popover shows only tags after the first two', async ({
  page
}, info) => {
  await page.goto('/dashboard/inventory');
  await expect(page.getByRole('columnheader', { name: 'Теги', exact: true })).toBeVisible();
  const existing = page.getByRole('row').filter({ hasText: 'Фарба_зелена' });
  await expect(existing.getByRole('cell').nth(0).locator('[data-stock-tag]')).toHaveCount(0);
  await expect(existing.getByRole('cell').nth(1).locator('[data-stock-tag]')).toHaveCount(2);
  await expect(existing.getByRole('button', { name: /Інші теги/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Нова позиція', exact: true }).click();
  const editor = page.getByRole('dialog');
  const name = 'Матеріал із чотирма тегами';
  await editor.getByRole('textbox', { name: 'Назва позиції' }).fill(name);
  const input = editor.getByRole('combobox', { name: 'Теги', exact: false });
  for (const tag of ['Фарба', 'Фарба_чорна', 'Фарба_зелена']) {
    await input.fill(tag);
    await page.getByRole('option', { name: tag, exact: true }).click();
  }
  await editor.getByRole('button', { name: 'Створити позицію', exact: true }).click();
  await expect(editor).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: name });
  const tags = row.getByRole('cell').nth(1);
  await expect(tags.locator('[data-stock-tag]')).toHaveCount(2);
  await expect(tags.locator('[data-stock-tag="Розхідник"]')).toBeVisible();
  await expect(tags.locator('[data-stock-tag="Фарба"]')).toBeVisible();
  await expect(tags.locator('[data-stock-tag="Фарба_чорна"]')).toHaveCount(0);
  const more = tags.getByRole('button', { name: `Інші теги позиції ${name}`, exact: true });
  await more.click();
  const popover = page.getByRole('dialog', { name: 'Інші теги', exact: true });
  await expect(popover).toBeVisible();
  await expect(popover.locator('[data-stock-tag]')).toHaveCount(2);
  await expect(popover.locator('[data-stock-tag="Фарба_чорна"]')).toBeVisible();
  await expect(popover.locator('[data-stock-tag="Фарба_зелена"]')).toBeVisible();
  await expect(popover.locator('[data-stock-tag="Розхідник"]')).toHaveCount(0);
  const bounds = await popover.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath('stock-tag-popover.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole('heading', { name: 'Склад', exact: true }).click();
  await expect(popover).toBeHidden();
  await page.getByRole('textbox', { name: 'Пошук складських позицій' }).fill(name);
  await page.getByRole('combobox', { name: 'Фільтр за тегом', exact: true }).fill('зелена');
  await page.getByRole('option', { name: 'Фарба_зелена', exact: true }).click();
  await expect(row).toBeVisible();
});

test('Excel icon downloads the filtered inventory with numeric values and handles empty results', async ({
  page
}, info) => {
  await page.goto('/dashboard/inventory');
  const button = page.getByRole('button', { name: 'Експортувати склад в Excel', exact: true });
  await expect(button).toBeVisible();
  await expect(button.locator('svg')).toHaveCount(1);
  await expect(button).toHaveText('');
  await page.getByRole('combobox', { name: 'Фільтр за тегом', exact: true }).fill('зел');
  await page.getByRole('option', { name: 'Фарба_зелена', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await button.click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^sklad-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const path = info.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const files = unzipSync(await readFile(path));
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  const strings = strFromU8(files['xl/sharedStrings.xml']);
  expect(sheet.match(/<row\b/g)).toHaveLength(2);
  expect(strings).toContain('Фарба_зелена');
  expect(strings).not.toContain('Лак (старий залишок)');
  expect(sheet).toContain('<v>1000</v>');
  await page.getByRole('textbox', { name: 'Пошук складських позицій' }).fill('немає такої позиції');
  await expect(button).toBeDisabled();
  await page.getByRole('button', { name: 'Скинути пошук і теги', exact: true }).click();
  await expect(button).toBeEnabled();
  await page.screenshot({ path: info.outputPath('inventory-export.png'), animations: 'disabled' });
});

test('multiple tag filters match either tag, survive reload and combine with text search', async ({
  page
}, info) => {
  await page.goto('/dashboard/inventory');
  const filter = page.getByRole('combobox', { name: 'Фільтр за тегом', exact: true });
  const paint = page.getByRole('row').filter({ hasText: 'Фарба_зелена' });
  const lacquer = page.getByRole('row').filter({ hasText: 'Лак (старий залишок)' });
  await filter.fill('зел');
  await page.getByRole('option', { name: 'Фарба_зелена', exact: true }).click();
  await expect(paint).toBeVisible();
  await expect(lacquer).toBeHidden();
  await filter.fill('розх');
  await page.getByRole('option', { name: 'Розхідник', exact: true }).click();
  await expect(paint).toBeVisible();
  await expect(lacquer).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Прибрати тег Фарба_зелена', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Прибрати тег Розхідник', exact: true })
  ).toBeVisible();
  await expect(paint).toBeVisible();
  await expect(lacquer).toBeVisible();
  await page.screenshot({ path: info.outputPath('multi-tag-filter.png'), animations: 'disabled' });
  await page.getByRole('textbox', { name: 'Пошук складських позицій' }).fill('лак');
  await expect(paint).toBeHidden();
  await expect(lacquer).toBeVisible();
  await page.getByRole('button', { name: 'Прибрати тег Розхідник', exact: true }).click();
  await expect(page.getByText('Позицій не знайдено', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Скинути пошук і теги', exact: true }).click();
  await expect(paint).toBeVisible();
  await expect(lacquer).toBeVisible();
  await expect(page.getByRole('button', { name: /Прибрати тег/ })).toHaveCount(0);
});

async function expectInlineIcon(button: Locator): Promise<void> {
  const layout = await button.evaluate((element) => {
    const icon = element.querySelector('svg')!.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent?.trim()) node = walker.nextNode();
    const range = document.createRange();
    range.selectNodeContents(node!);
    const label = range.getBoundingClientRect();
    return {
      centerDifference: Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2),
      iconRight: icon.right,
      labelLeft: label.left
    };
  });
  expect(layout.centerDifference).toBeLessThanOrEqual(2);
  expect(layout.iconRight).toBeLessThan(layout.labelLeft);
}

test('admin creates a position and receives fractional stock', async ({ page }) => {
  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Нова позиція', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Назва позиції' }).fill('Ґрунт');
  await dialog.getByRole('combobox', { name: 'Одиниця виміру' }).click();
  await expect(page.getByRole('option')).toHaveCount(4);
  await page.getByRole('option', { name: 'кг', exact: true }).click();
  await dialog.getByRole('button', { name: 'Створити позицію' }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: 'Ґрунт' });
  await row.getByRole('button', { name: 'Дії з позицією Ґрунт' }).click();
  await page.getByRole('menuitem', { name: 'Надходження', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Кількість' }).fill('0,250');
  await dialog.getByRole('textbox', { name: 'Загальна вартість надходження' }).fill('10');
  await dialog.getByRole('combobox', { name: 'Валюта' }).click();
  await page.getByRole('option', { name: 'Євро (EUR)', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Курс закупівлі, грн за 1 €' }).fill('48,4');
  await dialog.getByRole('button', { name: 'Додати надходження' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('0,25 кг');
  await expect(row).toContainText('484,00');
  await row.getByRole('button', { name: 'Дії з позицією Ґрунт' }).click();
  await page.getByRole('menuitem', { name: 'Коригувати', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Зміна залишку' }).fill('-0,050');
  await dialog.getByRole('textbox', { name: 'Причина коригування' }).fill('Інвентаризація');
  await dialog.getByRole('button', { name: 'Провести коригування' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('0,2 кг');
  await expect(row).toContainText('387,20');
  await row.getByRole('button', { name: 'Дії з позицією Ґрунт' }).click();
  await page.getByRole('menuitem', { name: 'В архів', exact: true }).click();
  await expect(row).toBeHidden();
  await page.getByRole('button', { name: 'Показати архів' }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Дії з позицією Ґрунт' }).click();
  await page.getByRole('menuitem', { name: 'Історія', exact: true }).click();
  await expect(dialog).toContainText('Інвентаризація');
});

test('material tags can be selected and searched together with text while operations use their own tab', async ({
  page
}, info) => {
  await page.goto('/dashboard/inventory');
  const search = page.getByRole('textbox', { name: 'Пошук складських позицій' });
  const tag = page.getByRole('combobox', { name: 'Фільтр за тегом', exact: true });
  const paint = page.getByRole('row').filter({ hasText: 'Фарба_зелена' });
  await expect(paint).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Останні операції', exact: true })).toBeHidden();
  await tag.click();
  await page.getByRole('combobox', { name: 'Фільтр за тегом', exact: true }).fill('зел');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.getByRole('option', { name: 'Фарба_зелена', exact: true }).click();
  await search.fill('ФАРБА');
  await expect(paint).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Лак (старий залишок)' })).toBeHidden();
  await search.fill('лак');
  await expect(page.getByText('Позицій не знайдено', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Скинути пошук і теги', exact: true }).click();
  await expect(paint).toBeVisible();
  await paint.getByRole('button', { name: 'Дії з позицією Фарба', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Редагувати', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'Назва позиції' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Прибрати тег Фарба_зелена', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Теги', exact: false }).fill('чор');
  await page.getByRole('option', { name: 'Фарба_чорна', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Примітка', exact: true }).fill('Для бампера');
  await dialog.getByRole('button', { name: 'Зберегти позицію', exact: true }).click();
  await expect(dialog).toBeHidden();
  await search.fill('БАМПЕРА');
  const black = page.getByRole('row').filter({ hasText: 'Фарба_чорна' });
  await expect(black).toContainText('1 л');
  await expect.poll(() => new URL(page.url()).searchParams.get('stockSearch')).toBe('БАМПЕРА');
  await expect(search).toHaveAttribute('aria-busy', 'false');
  await page.reload();
  await expect(search).toHaveValue('БАМПЕРА');
  await expect(black).toBeVisible();
  await page.screenshot({ path: info.outputPath('warehouse-tags.png'), animations: 'disabled' });
  await page.getByRole('tab', { name: 'Останні операції', exact: true }).click();
  await expect(search).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Останні операції', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Останні операції', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await page.getByRole('tab', { name: 'Матеріали', exact: true }).click();
  await expect(search).toHaveValue('БАМПЕРА');
  await expect(black).toBeVisible();
});

test('new materials require a tag and fixed catalog offers no creation controls', async ({
  page
}) => {
  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Нова позиція', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Назва позиції' }).fill('Емаль тестова');
  await dialog.getByRole('button', { name: 'Прибрати тег Розхідник', exact: true }).click();
  await dialog.getByRole('button', { name: 'Створити позицію', exact: true }).click();
  await expect(dialog.getByText('Оберіть хоча б один тег', { exact: true })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Теги', exact: false }).fill('Фарба');
  await page.getByRole('option', { name: 'Фарба', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Теги', exact: false }).fill('чор');
  await page.getByRole('option', { name: 'Фарба_чорна', exact: true }).click();
  await dialog.getByRole('button', { name: 'Створити позицію', exact: true }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: 'Емаль тестова' });
  await expect(row).toContainText('Фарба_чорна');
  await page.getByRole('combobox', { name: 'Фільтр за тегом', exact: true }).click();
  await page.getByRole('combobox', { name: 'Фільтр за тегом', exact: true }).fill('Вигаданий');
  await expect(page.getByText('Тегів не знайдено', { exact: true })).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Додати тег|Створити тег/ })).toHaveCount(0);
});

test('worker can filter warehouse and read operations without material editing', async ({
  page
}) => {
  await page.goto('/dashboard/inventory?role=worker');
  await expect(page.getByRole('button', { name: 'Нова позиція', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Фільтр за тегом', exact: true }).click();
  await page.getByRole('option', { name: 'Розхідник', exact: true }).click();
  await page.keyboard.press('Escape');
  const row = page.getByRole('row').filter({ hasText: 'Лак (старий залишок)' });
  await expect(row).toBeVisible();
  await row
    .getByRole('button', { name: 'Дії з позицією Лак (старий залишок)', exact: true })
    .click();
  await expect(page.getByRole('menuitem', { name: 'Історія', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Редагувати', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Останні операції', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Останні операції', exact: true })).toBeVisible();
});

for (const dark of [false, true]) {
  test(`multiple tag selection supports keyboard, removable chips and readable fixed colors (${dark ? 'dark' : 'light'})`, async ({
    page
  }, info) => {
    await page.goto(`/dashboard/inventory${dark ? '?dark=1' : ''}`);
    const greenBadge = page
      .getByRole('row')
      .filter({ hasText: 'Фарба_зелена' })
      .locator('[data-stock-tag="Фарба_зелена"]');
    const tableColor = await greenBadge.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    await page.getByRole('combobox', { name: 'Фільтр за тегом', exact: true }).click();
    const greenOption = page.getByRole('option', { name: 'Фарба_зелена', exact: true });
    expect(
      await greenOption
        .locator('[data-stock-tag]')
        .evaluate((element) => getComputedStyle(element).backgroundColor)
    ).toBe(tableColor);
    await greenOption.click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Нова позиція', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Назва позиції' }).fill('Тест палітри');
    const input = dialog.getByRole('combobox', { name: 'Теги', exact: false });
    await input.fill('зелена');
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(
      dialog.getByRole('button', { name: 'Прибрати тег Фарба_зелена', exact: true })
    ).toBeVisible();
    expect(
      await dialog
        .locator('[data-stock-tag="Фарба_зелена"]')
        .evaluate((element) => getComputedStyle(element).backgroundColor)
    ).toBe(tableColor);
    await input.fill('біла');
    await page.getByRole('option', { name: 'Фарба_біла', exact: true }).click();
    await input.fill('чорна');
    await page.getByRole('option', { name: 'Фарба_чорна', exact: true }).click();
    await dialog.getByRole('button', { name: 'Показати теги', exact: true }).click();
    await expect(page.getByRole('option')).toHaveCount(16);
    const colors = await page
      .getByRole('listbox')
      .locator('[data-stock-tag]')
      .evaluateAll((elements) => {
        return elements.map((element) => {
          const style = getComputedStyle(element);
          const [background, foreground] = [style.backgroundColor, style.color].map((color) => {
            const channels = color
              .match(/\d+/g)!
              .slice(0, 3)
              .map(Number)
              .map((value) => {
                const channel = value / 255;
                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
              });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          });
          return {
            tag: element.textContent,
            background: style.backgroundColor,
            contrast:
              (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
          };
        });
      });
    for (const color of colors)
      expect(color.contrast, `${color.tag} text contrast`).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({
      path: info.outputPath(`tag-colors-${dark ? 'dark' : 'light'}.png`),
      animations: 'disabled'
    });
    await input.press('Escape');
    await dialog.getByRole('button', { name: 'Прибрати тег Розхідник', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Прибрати тег Розхідник', exact: true })
    ).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Створити позицію', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: 'Тест палітри' });
    await expect(row).toContainText('Фарба_зелена');
    await expect(row).toContainText('Фарба_біла');
    await expect(row).not.toContainText('Розхідник');
    await row.getByRole('button', { name: 'Інші теги позиції Тест палітри', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Інші теги', exact: true })).toContainText(
      'Фарба_чорна'
    );
    await page.keyboard.press('Escape');
  });
}

test('order consumption validates remaining stock and cancellation preserves history', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  const materials = page.getByRole('region', { name: 'Матеріали замовлення' });
  await materials.getByRole('button', { name: 'Додати списання' }).click();
  const dialog = page.getByRole('dialog', { name: 'Нове списання', exact: true });
  await dialog.getByRole('combobox', { name: 'Матеріал зі складу', exact: false }).click();
  await page.getByRole('option', { name: /^Фарба/ }).click();
  const materialChoice = dialog.getByRole('combobox', { name: 'Матеріал зі складу', exact: false });
  await materialChoice.click();
  await page
    .getByRole('combobox', { name: 'Пошук: Матеріал зі складу', exact: true })
    .fill('неіснуючий матеріал');
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(materialChoice).toContainText('Фарба');
  await dialog.getByRole('textbox', { name: 'Кількість', exact: false }).fill('2');
  await expect(dialog.getByRole('button', { name: 'Списати', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('перевищує');
  await dialog.getByRole('textbox', { name: 'Кількість', exact: false }).fill('0,250');
  await dialog.getByRole('button', { name: 'Списати', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(materials).toContainText('250,00');
  await materials.getByRole('button', { name: 'Редагувати списання: Фарба', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Редагувати списання', exact: true });
  await expect(edit.getByRole('textbox', { name: 'Кількість', exact: false })).toHaveValue('0.25');
  await edit.getByRole('textbox', { name: 'Кількість', exact: false }).fill('0,4');
  await edit.getByRole('button', { name: 'Полірування', exact: true }).click();
  await edit.getByRole('button', { name: 'Зберегти списання', exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(materials).toContainText('400,00');
  await expect(materials.getByText('Полірування', { exact: true })).toBeVisible();
  await materials.getByRole('button', { name: 'Редагувати списання: Фарба', exact: true }).click();
  await edit.getByRole('button', { name: 'Скасувати списання', exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(
    materials.getByRole('button', { name: 'Редагувати списання: Фарба', exact: true })
  ).toHaveCount(0);
  await materials.getByText('Журнал складських операцій', { exact: true }).click();
  await expect(materials.getByText('Скасовано', { exact: true })).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('order-materials.png'), animations: 'disabled' });
});

test('legacy balance is valued explicitly with an audit entry', async ({ page }) => {
  await page.goto('/dashboard/inventory');
  const row = page.getByRole('row').filter({ hasText: 'Лак (старий залишок)' });
  await expect(row).toContainText('Не визначена');
  await row.getByRole('button', { name: 'Дії з позицією Лак (старий залишок)' }).click();
  await page.getByRole('menuitem', { name: 'Оцінити залишок', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Вартість усього залишку, грн' }).fill('2000');
  await dialog.getByRole('textbox', { name: 'Підстава оцінювання' }).fill('Звірено за накладною');
  await dialog.getByRole('button', { name: 'Зберегти оцінку' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('2\u00a0000,00');
  await page.getByRole('tab', { name: 'Останні операції', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Історія складських операцій' })).toContainText(
    'Звірено за накладною'
  );
});

test('admin searches materials and saves separate painting and polishing consumptions', async ({
  page
}) => {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  const materials = page.getByRole('region', { name: 'Матеріали замовлення' });
  await expectInlineIcon(materials.getByRole('button', { name: 'Додати списання' }));
  for (const [quantity, purpose] of [
    ['0,2', 'Фарбування'],
    ['0,3', 'Полірування']
  ]) {
    await materials.getByRole('button', { name: 'Додати списання' }).click();
    const form = page.getByRole('dialog', { name: 'Нове списання', exact: true });
    await form.getByRole('combobox', { name: 'Матеріал зі складу', exact: false }).click();
    await page
      .getByRole('combobox', { name: 'Пошук: Матеріал зі складу', exact: true })
      .fill('фар');
    await page.getByRole('option', { name: /^Фарба/ }).click();
    await form.getByRole('textbox', { name: 'Кількість', exact: false }).fill(quantity);
    await form.getByRole('button', { name: purpose, exact: true }).click();
    await form.getByRole('button', { name: 'Списати', exact: true }).click();
    await expect(form).toBeHidden();
  }
  await expect(
    materials.getByRole('button', { name: 'Редагувати списання: Фарба', exact: true })
  ).toHaveCount(2);
  await expect(materials).toContainText('200,00');
  await expect(materials).toContainText('300,00');
  expect(
    await materials.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true);
});

test('worker can inspect stock with no write controls', async ({ page }) => {
  await page.goto('/dashboard/inventory?role=worker');
  await expect(page.getByRole('row').filter({ hasText: 'Фарба' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Нова позиція' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Надходження', exact: true })).toHaveCount(0);
  await page.goto('/dashboard/orders?role=worker');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  const materials = page.getByRole('region', { name: 'Матеріали замовлення' });
  await expect(materials).toBeVisible();
  await expect(materials.getByRole('button')).toHaveCount(0);
});
