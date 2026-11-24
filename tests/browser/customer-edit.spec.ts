import { expect, test } from '@playwright/test';

test('customer name opens editing; extra phones and email save and participate in search', async ({
  page
}, info) => {
  await page.goto('/dashboard/clients');
  const row = page.getByRole('table').locator('tbody tr').first();
  await row.getByRole('button', { name: /Редагувати клієнта/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Редагування клієнта', exact: true });
  await dialog.getByRole('textbox', { name: 'Ім’я клієнта *' }).fill('Микола Оновлений');
  await dialog.getByRole('button', { name: 'Додати телефон', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Телефон 2 *' }).fill('+380 (67) 765-43-21');
  await dialog.getByRole('button', { name: 'Додати email', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Email 3 *' }).fill('mykola@example.com');
  await dialog.getByRole('button', { name: 'Зберегти клієнта', exact: true }).click();
  await expect(dialog).toBeHidden();
  const search = page.getByRole('textbox', {
    name: 'Пошук за клієнтом, автомобілем, VIN або роботами'
  });
  await search.fill('380677654321');
  await expect(
    page.getByRole('button', { name: 'Редагувати клієнта Микола Оновлений', exact: true })
  ).toBeVisible();
  await search.fill('mykola@example.com');
  const updated = page.getByRole('table').locator('tbody tr').first();
  await expect(updated).toContainText('Микола Оновлений');
  await updated.getByRole('button', { name: 'Контакти клієнта', exact: true }).click();
  const popup = page.locator('[data-slot=popover-content]');
  await expect(popup.getByRole('link', { name: 'mykola@example.com' })).toHaveAttribute(
    'href',
    'mailto:mykola@example.com'
  );
  await expect(popup.getByRole('link', { name: '+380 67 765 4321', exact: true })).toHaveAttribute(
    'href',
    'tel:+380677654321'
  );
  await page.keyboard.press('Escape');
  await updated
    .getByRole('button', { name: 'Редагувати клієнта Микола Оновлений', exact: true })
    .click();
  await expect(dialog.getByRole('textbox', { name: 'Email 3 *' })).toHaveValue(
    'mykola@example.com'
  );
  await dialog.getByRole('button', { name: 'Видалити контакт 2', exact: true }).click();
  await dialog.getByRole('button', { name: 'Зберегти клієнта', exact: true }).click();
  await expect(dialog).toBeHidden();
  await search.fill('380677654321');
  await expect(page.getByRole('table')).toContainText('За цим пошуком записів не знайдено.');
  await search.fill('mykola@example.com');
  await page.screenshot({ path: info.outputPath('customer-contacts.png'), animations: 'disabled' });
});

test('editing protects unsaved changes and rejects duplicate contacts', async ({ page }) => {
  await page.goto('/dashboard/clients');
  await page
    .getByRole('table')
    .locator('tbody tr')
    .first()
    .getByRole('button', { name: /Редагувати клієнта/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Редагування клієнта', exact: true });
  const first = await dialog.getByRole('textbox', { name: 'Телефон 1 *' }).inputValue();
  await dialog.getByRole('button', { name: 'Додати телефон', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Телефон 2 *' }).fill(first);
  await dialog.getByRole('button', { name: 'Зберегти клієнта', exact: true }).click();
  await expect(dialog.getByText('Цей контакт уже додано', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрити', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
});

test('customer can be created using only an email', async ({ page }) => {
  await page.goto('/dashboard/clients');
  await page.getByRole('button', { name: 'Додати клієнта', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Новий клієнт', exact: true });
  await dialog.getByRole('textbox', { name: 'Ім’я клієнта *' }).fill('Лише Email');
  await dialog.getByRole('button', { name: 'Додати email', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Email 2 *' }).fill('only@example.com');
  await dialog.getByRole('button', { name: 'Видалити контакт 1', exact: true }).click();
  await dialog.getByRole('button', { name: 'Створити клієнта', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole('textbox', { name: 'Пошук за клієнтом, автомобілем, VIN або роботами' })
    .fill('only@example.com');
  await expect(page.getByRole('table').locator('tbody tr').first()).toContainText('Лише Email');
});

test('phone country updates immediately, invalid numbers cannot save and international contacts persist', async ({
  page
}, info) => {
  await page.goto('/dashboard/clients');
  await page.getByRole('button', { name: 'Додати клієнта', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Новий клієнт', exact: true });
  await dialog.getByRole('textbox', { name: 'Ім’я клієнта *' }).fill('Міжнародні телефони');
  const phone = dialog.getByRole('textbox', { name: 'Телефон 1 *' });
  await phone.fill('+380');
  await expect(phone).toHaveValue('+380');
  await expect(dialog.getByText('Україна · +380', { exact: true })).toBeVisible();
  await phone.fill('+48');
  await expect(dialog.getByText('Польща · +48', { exact: true })).toBeVisible();
  await phone.fill('+1');
  await expect(dialog.getByText(/Спільний код кількох країн/)).toBeVisible();
  await phone.fill('+380000000000');
  await dialog.getByRole('button', { name: 'Створити клієнта', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(phone).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText(/Вкажіть коректний номер/).first()).toBeVisible();
  await phone.fill('0501234567');
  await phone.blur();
  await expect(phone).toHaveValue('+380 50 123 4567');
  await expect(phone).toHaveAttribute('aria-invalid', 'false');
  await dialog.getByRole('button', { name: 'Додати телефон', exact: true }).click();
  const other = dialog.getByRole('textbox', { name: 'Телефон 2 *' });
  await other.fill('0048600123456');
  await expect(dialog.getByText('Польща · +48', { exact: true })).toBeVisible();
  await other.blur();
  await expect(other).toHaveValue('+48 600 123 456');
  await page.screenshot({
    path: info.outputPath('international-customer-phones.png'),
    animations: 'disabled'
  });
  await dialog.getByRole('button', { name: 'Створити клієнта', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole('button', { name: 'Редагувати клієнта Міжнародні телефони', exact: true })
    .click();
  const edit = page.getByRole('dialog', { name: 'Редагування клієнта', exact: true });
  await expect(edit.getByRole('textbox', { name: 'Телефон 1 *' })).toHaveValue('+380 50 123 4567');
  await expect(edit.getByRole('textbox', { name: 'Телефон 2 *' })).toHaveValue('+48 600 123 456');
});
