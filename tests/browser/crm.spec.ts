import { test, expect, type Page } from '@playwright/test';

async function settledDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished)
    );
  });
  return dialog;
}

async function checkDialogBounds(page: Page) {
  const dialog = await settledDialog(page);
  const body = dialog.locator('[data-slot=crm-dialog-body]');
  const header = dialog.locator('[data-slot=dialog-header]');
  const footer = dialog.locator('[data-slot=crm-dialog-footer]');
  const before = await header.boundingBox();
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const after = await header.boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  await expect(header).toBeInViewport({ ratio: 1 });
  await expect(footer).toBeInViewport({ ratio: 1 });
  expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  const dimensions = await dialog.evaluate((element) => ({
    height: element.clientHeight,
    scroll: element.scrollHeight,
    children: [...element.children].map((child) => ({
      slot: child.getAttribute('data-slot'),
      tag: child.tagName,
      height: child.getBoundingClientRect().height,
      scroll: child.scrollHeight,
      position: getComputedStyle(child).position
    }))
  }));
  expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.height + 1);
}

for (const route of ['clients', 'orders', 'vehicles', 'requests']) {
  test(`${route}: table layout`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/dashboard/${route}?perPage=20`);
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`${route}.png`),
      fullPage: true
    });
    const firstRow = page.getByRole('table').locator('tbody tr').first();
    expect((await firstRow.boundingBox())!.height).toBeLessThan(220);
    const pinned = firstRow.locator('td').last();
    const before = await pinned.boundingBox();
    const scroll = page.locator('[data-slot=data-table] [data-slot=scroll-area-viewport]');
    await scroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    expect((await pinned.boundingBox())!.x).toBeCloseTo(before!.x, 0);
    await expect(pinned.getByRole('button')).toBeInViewport();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`${route}-right.png`),
      fullPage: true
    });
    const header = page.getByRole('table').locator('thead');
    const headerBefore = await header.boundingBox();
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect((await header.boundingBox())!.y).toBeCloseTo(headerBefore!.y, 0);
    expect(errors).toEqual([]);
  });

  test(`${route}: pagination, search and empty state`, async ({ page }) => {
    await page.goto(`/dashboard/${route}?page=3`);
    await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible();
    await page.getByRole('textbox').fill('no-such-record-999');
    await expect(
      page.getByRole('cell', { name: 'За цим пошуком записів не знайдено.' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Попередня сторінка', exact: true })
    ).toBeDisabled();
    await page.getByRole('textbox').clear();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(10);
    await page.getByRole('button', { name: 'Наступна сторінка', exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(10);
  });
}

test('long order modal scrolls its body while header and footer stay visible', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished)
    );
  });
  const body = dialog.locator('[data-slot=crm-dialog-body]');
  const header = dialog.locator('[data-slot=dialog-header]');
  const footer = dialog.locator('[data-slot=crm-dialog-footer]');
  const beforeHeader = await header.boundingBox();
  const beforeFooter = await footer.boundingBox();
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  const afterHeader = await header.boundingBox();
  const afterFooter = await footer.boundingBox();
  expect(afterHeader?.y).toBeCloseTo(beforeHeader!.y, 0);
  expect(afterFooter?.y).toBeCloseTo(beforeFooter!.y, 0);
  expect(afterFooter!.y + afterFooter!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(dialog.getByRole('button', { name: 'Зберегти замовлення' })).toBeInViewport();
  await page.screenshot({ animations: 'disabled', path: info.outputPath('order-modal.png') });
});

test('footer submits the associated form and a vehicle select stays inside the viewport', async ({
  page
}, info) => {
  await page.goto('/dashboard/clients');
  await page.getByRole('button', { name: 'Додати клієнта', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Ім’я клієнта *' }).fill('Браузерна перевірка');
  await dialog.getByRole('textbox', { name: 'Телефон *' }).fill('+380000000000');
  await dialog.getByRole('button', { name: 'Створити клієнта', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/dashboard/vehicles');
  await page.getByRole('button', { name: 'Додати автомобіль', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Марка *' }).click();
  await expect(page.getByRole('option', { name: 'BMW', exact: true })).toBeVisible();
  const popup = await page.locator('[data-slot=combobox-content]').boundingBox();
  expect(popup!.x).toBeGreaterThanOrEqual(0);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('vehicle-select.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(dialog).toBeVisible();
});

test('dark theme tables and menus remain readable', async ({ page }, info) => {
  for (const route of ['clients', 'orders', 'vehicles', 'requests']) {
    await page.goto(`/dashboard/${route}?dark`);
    await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible();
    const action = page
      .getByRole('table')
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: /^Дії/ });
    await action.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`${route}-dark.png`),
      fullPage: true
    });
    await page.keyboard.press('Escape');
    await expect(action).toBeFocused();
  }
});

test('creation dialogs fit a low viewport with stationary actions', async ({ page }, info) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 460 });
  for (const [route, label] of [
    ['clients', 'Додати клієнта'],
    ['vehicles', 'Додати автомобіль'],
    ['requests', 'Нова заявка'],
    ['orders', 'Нове замовлення']
  ]) {
    await page.goto(`/dashboard/${route}`);
    await page.getByRole('button', { name: label, exact: true }).first().click();
    await checkDialogBounds(page);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`${route}-low-dialog.png`)
    });
    await page.getByRole('dialog').getByRole('button', { name: 'Закрити', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }
});

test('customer history and request workflow keep complete content accessible', async ({
  page
}, info) => {
  await page.goto('/dashboard/clients');
  await page.getByRole('button', { name: 'Ще 5 · переглянути всі', exact: true }).click();
  await checkDialogBounds(page);
  await expect(page.getByRole('dialog').locator('section')).toHaveCount(7);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('customer-history.png') });
  await page.getByRole('button', { name: 'Закрити вікно', exact: true }).click();
  await page.goto('/dashboard/requests');
  await page
    .getByRole('table')
    .locator('tbody tr')
    .first()
    .getByRole('button', { name: /^Дії/ })
    .click();
  await page.getByRole('menuitem', { name: 'Переглянути · статус і дати', exact: true }).click();
  await checkDialogBounds(page);
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Потрібні роботи', exact: true })
  ).toBeAttached();
  await page.screenshot({ animations: 'disabled', path: info.outputPath('request-workflow.png') });
});

test('footer cancellation protects unsaved fields', async ({ page }) => {
  await page.goto('/dashboard/clients');
  await page.getByRole('button', { name: 'Додати клієнта', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Ім’я клієнта *' });
  await name.fill('Незбережений клієнт');
  await page.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Продовжити редагування' }).click();
  await expect(name).toHaveValue('Незбережений клієнт');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Скасувати зміни', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});
