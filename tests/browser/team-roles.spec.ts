import { expect, test } from '@playwright/test';

test('admin can select either active role as executor when creating an order', async ({ page }) => {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Нове замовлення', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Відповідальний *', exact: true }).click();
  await expect(page.getByRole('option', { name: /Олена Адміністратор/ })).toContainText(
    'Спеціалізацію не вказано'
  );
  await page.getByRole('option', { name: /Маляр Андрій/ }).click();
  await expect(page.getByRole('combobox', { name: 'Відповідальний *', exact: true })).toContainText(
    'Маляр Андрій'
  );
});

test('worker sees all orders as read-only and takes successive forward status steps', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?role=worker');
  await expect(page.getByRole('button', { name: 'Нове замовлення', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
  await expect(dialog.getByText('Олена Адміністратор', { exact: true })).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Позначити готовим', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('worker-read-only.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Позначити готовим', exact: true }).click();
  await expect(dialog.getByText('Замовлення готове.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Позначити виданим', exact: true })).toHaveCount(
    0
  );
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
});

test('team roles are readable and administration controls are not offered to workers', async ({
  page
}, info) => {
  await page.goto('/dashboard/team');
  await expect(page.getByText('Clerk invitation controls', { exact: true })).toBeVisible();
  await expect(page.getByText('Маляр Андрій', { exact: true })).toBeVisible();
  await page.goto('/dashboard/team?role=worker');
  await expect(page.getByText('Clerk invitation controls', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Маляр Андрій', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('team-worker.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
});

test('member specialties are configured in a keyboard-accessible modal and persist on reload', async ({
  page
}, info) => {
  await page.goto('/dashboard/team');
  const member = page.getByRole('button', {
    name: 'Налаштувати учасника Маляр Андрій',
    exact: true
  });
  await member.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Учасник команди — Маляр Андрій', exact: true });
  await dialog.getByRole('checkbox', { name: 'Маляр', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Розбірник-збірник', exact: true }).check();
  await page.screenshot({
    path: info.outputPath('member-specialties.png'),
    animations: 'disabled'
  });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await dialog.getByRole('button', { name: 'Зберегти налаштування', exact: true }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('row').filter({ has: member });
  await expect(row.getByText('Маляр', { exact: true })).toBeVisible();
  await expect(row.getByText('Розбірник-збірник', { exact: true })).toBeVisible();
  await page.reload();
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const order = page.getByRole('dialog', { name: 'Замовлення №1', exact: true });
  const responsible = order.getByRole('combobox', { name: 'Відповідальний', exact: false });
  await responsible.click();
  await page
    .getByRole('combobox', { name: 'Пошук: Відповідальний', exact: true })
    .fill('розбірник');
  const specialist = page.getByRole('option', { name: /^Маляр Андрій/ });
  await expect(specialist).toContainText('Маляр, Розбірник-збірник');
  await expect(page.getByRole('option')).toHaveCount(1);
  await specialist.click();
  await expect(responsible).toContainText('Маляр Андрій · Маляр, Розбірник-збірник');
  await order.getByRole('button', { name: 'Зберегти замовлення', exact: true }).click();
  await order.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  await order.getByRole('button', { name: 'Додати субпідряд', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Новий субпідряд', exact: true })
    .getByRole('combobox', { name: 'Субпідрядник', exact: false })
    .click();
  await page.getByRole('combobox', { name: 'Пошук: Субпідрядник', exact: true }).fill('розбірник');
  await expect(specialist).toContainText('Маляр, Розбірник-збірник');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath('specialties-in-worker-pickers.png'),
    animations: 'disabled'
  });
  await page.goto('/dashboard/team');
  await page
    .getByRole('button', { name: 'Налаштувати учасника Маляр Андрій', exact: true })
    .click();
  await expect(dialog.getByRole('checkbox', { name: 'Маляр', exact: true })).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Маляр', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Розбірник-збірник', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Зберегти налаштування', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText('Не вказано', { exact: true })).toBeVisible();
});

test('member modal preserves drafts when cancelling closure and is read-only for workers', async ({
  page
}) => {
  await page.goto('/dashboard/team');
  await page
    .getByRole('button', { name: 'Налаштувати учасника Маляр Андрій', exact: true })
    .click();
  let dialog = page.getByRole('dialog', { name: 'Учасник команди — Маляр Андрій', exact: true });
  await dialog.getByRole('checkbox', { name: 'Маляр', exact: true }).check();
  await page.keyboard.press('Escape');
  const discard = page.getByRole('alertdialog', { name: 'Відкинути зміни?', exact: true });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Продовжити редагування', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Маляр', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await discard.getByRole('button', { name: 'Відкинути зміни', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/dashboard/team?role=worker');
  await page
    .getByRole('button', { name: 'Переглянути учасника Маляр Андрій', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Учасник команди — Маляр Андрій', exact: true });
  await expect(dialog.getByRole('checkbox', { name: 'Маляр', exact: true })).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Зберегти налаштування', exact: true })
  ).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: 'Маляр', exact: true })).not.toBeChecked();
});

test('order responsible can be any active team member irrespective of specialty', async ({
  page
}) => {
  await page.goto('/dashboard/orders?economicsDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('combobox', { name: 'Відповідальний', exact: false }).click();
  await expect(page.getByRole('option', { name: /Маляр Андрій/ })).toBeVisible();
  await page.getByRole('option', { name: /Олена Адміністратор/ }).click();
  await page.getByRole('button', { name: 'Зберегти замовлення', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Відповідальний', exact: false })).toContainText(
    'Олена Адміністратор'
  );
  await page.getByRole('tab', { name: 'Команда і зарплата', exact: true }).click();
  await page.getByRole('textbox', { name: 'Частка: Маляр, %', exact: false }).fill('70');
  await page.getByRole('button', { name: 'Зберегти умови нарахування', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Команда і зарплата', exact: true })
  ).not.toHaveAttribute('data-dirty');
  await page.getByRole('tab', { name: 'Роботи', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Деталізувати чек', exact: true })).toHaveCount(0);
});
