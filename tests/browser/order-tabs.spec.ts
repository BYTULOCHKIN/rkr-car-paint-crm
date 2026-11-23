import { expect, test } from '@playwright/test';

async function openOrder(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Основне', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
}

test('order tabs retain drafts, save in place, and keep summary and actions stationary', async ({
  page
}, info) => {
  await openOrder(page);
  const dialog = page.getByRole('dialog', { name: 'Замовлення №1', exact: true });
  const tabs = dialog.getByRole('tablist', { name: 'Розділи замовлення' });
  await expect(tabs.getByRole('tab')).toHaveCount(6);
  await expect(dialog.getByRole('tabpanel')).toHaveCount(1);
  await dialog.getByRole('textbox', { name: 'Опис замовлення' }).fill('Чернетка фарбування капота');
  await tabs.getByRole('tab', { name: 'Роботи', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Робота 1', exact: false })
    .first()
    .fill('Фарбування капота');
  await tabs.getByRole('tab', { name: 'Основне', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Опис замовлення' })).toHaveValue(
    'Чернетка фарбування капота'
  );
  await tabs.getByRole('tab', { name: 'Роботи', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Робота 1', exact: false }).first()).toHaveValue(
    'Фарбування капота'
  );
  const summary = dialog.getByRole('region', { name: 'Зведення замовлення' });
  const footer = dialog.locator('[data-slot=crm-dialog-footer]');
  const top = (await summary.boundingBox())!.y;
  const bottom = (await footer.boundingBox())!.y;
  await dialog.locator('[data-slot=crm-dialog-body]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect((await summary.boundingBox())!.y).toBeCloseTo(top, 0);
  expect((await footer.boundingBox())!.y).toBeCloseTo(bottom, 0);
  await dialog.getByRole('button', { name: 'Зберегти замовлення', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(tabs.locator('[data-dirty]')).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Матеріали', exact: true }).click();
  await dialog.getByRole('button', { name: 'Додати списання', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Матеріал', exact: false }).click();
  await page.getByRole('option', { name: /^Фарба/ }).click();
  await dialog.getByRole('textbox', { name: 'Кількість', exact: false }).fill('0,25');
  await tabs.getByRole('tab', { name: 'Історія', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Списати матеріали', exact: true })).toHaveCount(
    0
  );
  await tabs.getByRole('tab', { name: 'Матеріали', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Кількість', exact: false })).toHaveValue(
    '0,25'
  );
  await dialog.getByRole('button', { name: 'Закрити', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Продовжити редагування', exact: true }).click();
  await dialog.getByRole('button', { name: 'Списати матеріали', exact: true }).click();
  await expect(dialog.getByRole('form', { name: 'Списання матеріалів' })).toBeHidden();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await page.screenshot({
    path: info.outputPath('order-tabs-materials.png'),
    animations: 'disabled'
  });
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`tab transition respects reduced motion: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await openOrder(page);
    const samples = await page.evaluate(async () => {
      (document.querySelector('[role=tab][aria-label="Роботи"]') as HTMLButtonElement).click();
      const samples: { opacity: number; transform: string }[] = [];
      for (let frame = 0; frame < 15; frame++) {
        await new Promise(requestAnimationFrame);
        const element = document.querySelector(
          '[data-order-tab="works"] [data-slot=order-tab-animation]'
        )!;
        samples.push({
          opacity: Number(getComputedStyle(element).opacity),
          transform: getComputedStyle(element).transform
        });
      }
      return samples;
    });
    expect(samples.at(-1)!.opacity).toBeCloseTo(1, 2);
    if (reducedMotion === 'reduce')
      expect(samples.every((sample) => sample.opacity === 1)).toBe(true);
    else expect(samples.some((sample) => sample.opacity > 0 && sample.opacity < 1)).toBe(true);
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
  });
}

test('new order validates across tabs and opens all sections after creation', async ({ page }) => {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Нове замовлення', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab', { name: 'Матеріали', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  await dialog.getByRole('combobox', { name: 'Клієнт', exact: false }).click();
  await page.getByRole('option').first().click();
  await dialog.getByRole('combobox', { name: 'Автомобіль', exact: false }).click();
  await page.getByRole('option').first().click();
  await dialog.getByRole('combobox', { name: 'Відповідальний', exact: false }).click();
  await page.getByRole('option', { name: /Маляр Андрій/ }).click();
  await dialog
    .getByRole('textbox', { name: 'Опис замовлення', exact: false })
    .fill('Новий ремонт із вкладок');
  await dialog.getByRole('button', { name: 'Створити замовлення', exact: true }).click();
  await expect(dialog.getByRole('tab', { name: 'Роботи', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await dialog.getByRole('textbox', { name: 'Робота 1', exact: false }).fill('Фарбування дверей');
  await dialog.getByRole('spinbutton', { name: 'Ціна за одиницю, грн', exact: false }).fill('9000');
  await dialog.getByRole('button', { name: 'Створити замовлення', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Замовлення №25', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Зведення замовлення' })).toContainText(
    '9\u00a0000,00'
  );
  await expect(dialog.getByRole('tab', { name: 'Матеріали', exact: true })).toHaveAttribute(
    'aria-disabled',
    'false'
  );
});

test('row actions open the relevant order tab directly', async ({ page }, info) => {
  await page.goto('/dashboard/orders');
  await page
    .getByRole('table')
    .locator('tbody tr')
    .first()
    .getByRole('button', { name: /^Дії/ })
    .click();
  await page.getByRole('menuitem', { name: 'Оплати клієнта', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Оплати', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByRole('button', { name: 'Додати оплату', exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('order-tabs-payments.png'),
    animations: 'disabled'
  });
});
