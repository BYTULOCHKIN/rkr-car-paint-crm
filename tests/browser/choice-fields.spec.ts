import { test, expect, type Page } from '@playwright/test';

async function createVehicle(page: Page) {
  await page.goto('/dashboard/vehicles');
  await page.getByRole('button', { name: 'Додати автомобіль', exact: true }).first().click();
  await page.getByRole('dialog').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
}

async function openField(page: Page, name: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  const popup = page.locator('[data-slot=combobox-content][data-open]');
  await expect(popup).toBeVisible();
  await popup.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  return popup;
}

test('year dropdown has bounded height, one scroller and a fixed search field', async ({
  page
}, info) => {
  await createVehicle(page);
  const popup = await openField(page, 'Рік *');
  const search = popup.getByRole('combobox', { name: 'Пошук: Рік', exact: true });
  await expect(search).toBeFocused();
  const bounds = await popup.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(120);
  expect(bounds!.height).toBeLessThanOrEqual(info.project.name === 'mobile' ? 280 : 320);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  const searchBefore = await search.boundingBox();
  const body = page.locator('[data-slot=crm-dialog-body]');
  const bodyScroll = await body.evaluate((element) => element.scrollTop);
  const list = popup.getByRole('listbox');
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await list.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('thin');
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole('option', { name: '1900', exact: true })).toBeInViewport();
  expect((await search.boundingBox())!.y).toBeCloseTo(searchBefore!.y, 0);
  expect(await body.evaluate((element) => element.scrollTop)).toBe(bodyScroll);
  expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  expect(await popup.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(
    true
  );
  await page.screenshot({ path: info.outputPath('year-bounded.png'), animations: 'allow' });
  await search.fill('2020');
  await expect(list.getByRole('option')).toHaveCount(1);
  await expect(list.getByRole('option')).toHaveText('2020');
  await search.press('Enter');
  await expect(popup).toBeHidden();
  const trigger = page.getByRole('combobox', { name: 'Рік *', exact: true });
  await expect(trigger).toContainText('2020');
  await expect(trigger).toBeFocused();
  await openField(page, 'Рік *');
  await expect(page.getByRole('option', { name: '1900', exact: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slot=combobox-content][data-open]')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Новий автомобіль', exact: true })).toBeVisible();
});

test('client labels wrap, search accepts formatted phone numbers, and selection can be cleared', async ({
  page
}, info) => {
  await createVehicle(page);
  const popup = await openField(page, 'Клієнт (необов’язково)');
  const first = popup.getByRole('option', { name: /Тестовий клієнт із довгим/ });
  await expect(first).toBeVisible();
  const overflowing = await popup
    .getByRole('option')
    .evaluateAll(
      (options) => options.filter((option) => option.scrollWidth > option.clientWidth + 1).length
    );
  expect(overflowing).toBe(0);
  if (info.project.name === 'mobile')
    expect((await first.boundingBox())!.height).toBeGreaterThan(60);
  await page.screenshot({ path: info.outputPath('customer-wrapped.png'), animations: 'allow' });
  const search = popup.getByRole('combobox', { name: 'Пошук: Клієнт (необов’язково)' });
  await search.fill('+38 (000) 000-00-00');
  await expect(popup.getByRole('option')).toHaveCount(24);
  await search.fill('клієнт із довгим');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await popup.getByRole('option').click();
  const trigger = page.getByRole('combobox', { name: 'Клієнт (необов’язково)', exact: true });
  await expect(trigger).toContainText('Тестовий клієнт із довгим');
  expect(await trigger.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  const again = await openField(page, 'Клієнт (необов’язково)');
  await again.getByRole('button', { name: 'Очистити вибір' }).click();
  await expect(trigger).toContainText('Без клієнта');
  await expect(trigger).toBeFocused();
});

test('unmatched searches keep a stable empty panel and do not change the selected value', async ({
  page
}) => {
  await createVehicle(page);
  let popup = await openField(page, 'Марка *');
  await popup.getByRole('option', { name: 'BMW', exact: true }).click();
  popup = await openField(page, 'Марка *');
  const search = popup.getByRole('combobox', { name: 'Пошук: Марка' });
  await search.fill('zzzz-no-such-make');
  await expect(popup.getByRole('status')).toHaveText('За вашим пошуком нічого не знайдено.');
  expect((await popup.boundingBox())!.height).toBeGreaterThanOrEqual(120);
  await search.press('Enter');
  await expect(popup).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Новий автомобіль', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Марка *', exact: true })).toContainText('BMW');
});

test('vehicle search finds VINs and changing a customer clears the vehicle', async ({ page }) => {
  await page.goto('/dashboard/requests');
  await page.getByRole('button', { name: 'Нова заявка', exact: true }).first().click();
  let popup = await openField(page, 'Клієнт *');
  await popup.getByRole('option', { name: /Тестовий клієнт із довгим/ }).click();
  popup = await openField(page, 'Автомобіль *');
  await popup.getByRole('combobox', { name: 'Пошук: Автомобіль' }).fill('wvwzzz1jzxw000010');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await popup.getByRole('option').click();
  await expect(page.getByRole('combobox', { name: 'Автомобіль *', exact: true })).toContainText(
    'Passat Alltrack'
  );
  popup = await openField(page, 'Клієнт *');
  await popup.getByRole('combobox', { name: 'Пошук: Клієнт' }).fill('Тестовий клієнт 2');
  await popup.getByRole('option', { name: 'Тестовий клієнт 2 +380000000000', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Автомобіль *', exact: true })).toContainText(
    'Виберіть автомобіль'
  );
  await expect(page.getByRole('button', { name: 'Зберегти заявку', exact: true })).toBeDisabled();
});

test('dropdown stays inside a short viewport and short statuses stay compact', async ({
  page
}, info) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 460 });
  await createVehicle(page);
  const popup = await openField(page, 'Рік *');
  const bounds = (await popup.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(461);
  expect(bounds.height).toBeLessThanOrEqual(info.project.name === 'mobile' ? 280 : 320);
  await page.screenshot({ path: info.outputPath('short-viewport.png'), animations: 'allow' });
  await page.keyboard.press('Escape');
  await page.goto('/dashboard/kanban');
  await page.getByRole('button', { name: 'Статус і дати', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Статус *', exact: true }).click();
  const select = page.locator('[data-slot=select-content][data-open]');
  await expect(select).toBeVisible();
  expect((await select.boundingBox())!.height).toBeLessThan(120);
  await expect(select.locator('input')).toHaveCount(0);
});

test('keyboard arrows select an option and Tab leaves the popup inside the form', async ({
  page
}) => {
  await createVehicle(page);
  let popup = await openField(page, 'Марка *');
  const search = popup.getByRole('combobox', { name: 'Пошук: Марка' });
  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', /.+/);
  const activeId = await search.getAttribute('aria-activedescendant');
  const highlighted = await page.locator(`[id="${activeId}"]`).textContent();
  await search.press('Enter');
  await expect(popup).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Марка *', exact: true })).toContainText(
    highlighted!
  );
  popup = await openField(page, 'Марка *');
  await popup.getByRole('combobox', { name: 'Пошук: Марка' }).press('Tab');
  await expect(popup).toBeHidden();
  const dialog = page.getByRole('dialog', { name: 'Новий автомобіль', exact: true });
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
});
