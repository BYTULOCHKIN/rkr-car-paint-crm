import { expect, test } from '@playwright/test';

test('admin adds and selects a missing model inside the vehicle dialog', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dashboard/vehicles');
  await page.getByRole('button', { name: 'Додати автомобіль', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Новий автомобіль', exact: true });
  await dialog.getByRole('combobox', { name: 'Марка *', exact: true }).click();
  await page.getByRole('option', { name: 'BMW', exact: true }).click();
  await dialog.getByRole('button', { name: 'Додати модель', exact: true }).click();
  const saveVehicle = dialog.getByRole('button', { name: 'Додати автомобіль', exact: true });
  await expect(saveVehicle).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Назва моделі *', exact: true }).fill('001');
  await dialog.getByRole('button', { name: 'Додати й вибрати', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Модель *', exact: true })).toContainText(
    '001'
  );
  await expect(saveVehicle).toBeEnabled();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Модель *', exact: true }).click();
  await expect(page.getByRole('option', { name: '001', exact: true })).toBeVisible();
  await page.getByRole('option', { name: '001', exact: true }).click();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await page.screenshot({ path: info.outputPath('custom-model.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});
