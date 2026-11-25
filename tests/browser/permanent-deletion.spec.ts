import { expect, test } from '@playwright/test';

test('deleting the only order on the last trash page returns to the previous page', async ({
  page
}) => {
  await page.goto('/dashboard/orders?flowDemo');
  await page.getByRole('button', { name: 'Дії із замовленням №1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Перемістити в кошик', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Перемістити в кошик', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.evaluate(() => {
    const value = JSON.parse(sessionStorage.getItem('workshop-flow')!) as {
      orders: { deletedAt?: string | null; workflowRevision?: number }[];
    };
    for (const order of value.orders.slice(0, 11)) {
      order.deletedAt = new Date().toISOString();
      order.workflowRevision = (order.workflowRevision ?? 0) + 1;
    }
    sessionStorage.setItem('workshop-flow', JSON.stringify(value));
  });
  await page.goto('/dashboard/orders?flowDemo&ordersScope=trash&page=2');
  const table = page.getByRole('table', { name: 'Кошик замовлень', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.getByRole('button', { name: /^Дії із замовленням у кошику/ }).click();
  await page.getByRole('menuitem', { name: 'Видалити назавжди', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Видалити назавжди', exact: true })
    .click();
  await expect(table.locator('tbody tr')).toHaveCount(10);
  await expect(page).not.toHaveURL(/[?&]page=2(?:&|$)/);
});

test('permanent order deletion is confirmed from trash and remains deleted after reload', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?flowDemo');
  await page.getByRole('button', { name: 'Дії із замовленням №1', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Видалити назавжди', exact: true })).toHaveCount(
    0
  );
  await page.getByRole('menuitem', { name: 'Перемістити в кошик', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Перемістити в кошик', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Кошик', exact: true }).click();
  const actions = page.getByRole('button', { name: 'Дії із замовленням у кошику №1', exact: true });
  await actions.click();
  await page.getByRole('menuitem', { name: 'Видалити назавжди', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Видалити замовлення №1 назавжди', exact: true });
  await expect(dialog).toContainText('Відновити замовлення буде неможливо');
  await dialog.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Відновити замовлення №1', exact: true })
  ).toBeVisible();
  await actions.click();
  await page.getByRole('menuitem', { name: 'Видалити назавжди', exact: true }).click();
  await page.screenshot({
    path: info.outputPath('permanent-order-confirmation.png'),
    animations: 'disabled'
  });
  await dialog.getByRole('button', { name: 'Видалити назавжди', exact: true }).click();
  await expect(page.getByText('Кошик порожній', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Кошик порожній', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'До замовлень', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Відкрити замовлення №2', exact: true })
  ).toBeVisible();
});

for (const archived of [false, true])
  test(`unused material can be permanently removed from ${archived ? 'archive' : 'active stock'} while used materials explain the blocker`, async ({
    page
  }, info) => {
    await page.goto('/dashboard/inventory');
    const used = page.getByRole('row').filter({ hasText: 'Фарба_зелена' });
    await used.getByRole('button', { name: 'Дії з позицією Фарба', exact: true }).click();
    await expect(
      page.getByRole('menuitem', { name: 'Видалити назавжди', exact: true })
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByText('Є історія операцій — позицію можна архівувати.', { exact: true })
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Нова позиція', exact: true }).click();
    const create = page.getByRole('dialog');
    await create.getByRole('textbox', { name: 'Назва позиції' }).fill('Помилкова фарба');
    await create.getByRole('combobox', { name: 'Облік матеріалу' }).click();
    await page.getByRole('option', { name: 'За сумою', exact: true }).click();
    await create.getByRole('button', { name: 'Створити позицію', exact: true }).click();
    await expect(create).toBeHidden();
    const row = page.getByRole('row').filter({ hasText: 'Помилкова фарба' });
    const actions = row.getByRole('button', {
      name: 'Дії з позицією Помилкова фарба',
      exact: true
    });
    if (archived) {
      await actions.click();
      await page.getByRole('menuitem', { name: 'В архів', exact: true }).click();
      await expect(row).toHaveCount(0);
      await page.getByRole('button', { name: 'Показати архів', exact: true }).click();
    }
    await actions.click();
    await page.getByRole('menuitem', { name: 'Видалити назавжди', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Видалення позиції назавжди', exact: true });
    await expect(dialog).toContainText('«Помилкова фарба»');
    await expect(dialog).toContainText('Відновити позицію буде неможливо');
    await dialog.getByRole('button', { name: 'Скасувати', exact: true }).click();
    await expect(row).toBeVisible();
    await actions.click();
    await page.getByRole('menuitem', { name: 'Видалити назавжди', exact: true }).click();
    await page.screenshot({
      path: info.outputPath('permanent-stock-confirmation.png'),
      animations: 'disabled'
    });
    await dialog.getByRole('button', { name: 'Видалити назавжди', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);
    await page.reload();
    await expect(row).toHaveCount(0);
    if (archived) await page.getByRole('button', { name: 'Показати активні', exact: true }).click();
    await expect(used).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    );
  });
