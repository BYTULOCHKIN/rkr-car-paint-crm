import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppForm } from '@/lib/form';
import type { ChoiceOption } from '@/components/forms/fields/choice-options';

const options: ChoiceOption[] = [
  { value: 'locked', label: 'Недоступний автомобіль', disabled: true },
  { value: 'customer-id', label: 'Олена', description: '+38 (050) 123-45-67' }
];

function ChoiceForm({
  kind = 'combobox',
  loading = false,
  errorMessage,
  onRetry,
  choices = options
}: {
  kind?: 'select' | 'combobox';
  loading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  choices?: ChoiceOption[];
}) {
  const form = useAppForm({ defaultValues: { choice: '' } });
  return (
    <form.AppField name='choice'>
      {(field) =>
        kind === 'select' ? (
          <field.SelectField label='Вибір' options={choices} recentValues={['locked']} />
        ) : (
          <field.ComboboxField
            label='Вибір'
            options={choices}
            recentValues={['locked']}
            description='Оберіть наявний запис'
            loading={loading}
            errorMessage={errorMessage}
            onRetry={onRetry}
          />
        )
      }
    </form.AppField>
  );
}

for (const kind of ['select', 'combobox'] as const) {
  test(`${kind}: a disabled recent option remains unavailable`, async () => {
    render(<ChoiceForm kind={kind} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Вибір' }));
    const locked = await screen.findByRole('option', { name: 'Недоступний автомобіль' });
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    await user.click(locked);
    expect(screen.getByRole('combobox', { name: 'Вибір' }).textContent).not.toContain(
      'Недоступний автомобіль'
    );
  });
}

test('combobox searches human labels and formatted phones, preserving the record ID', async () => {
  const { container } = render(<ChoiceForm />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Вибір' }));
  const search = await screen.findByRole('combobox', { name: 'Пошук: Вибір' });
  await user.type(search, '0501234567');
  await user.click(await screen.findByRole('option', { name: /Олена/ }));
  await waitFor(() => {
    expect((container.querySelector('input[name=choice]') as HTMLInputElement).value).toBe(
      'customer-id'
    );
  });
  const trigger = screen.getByRole('combobox', { name: 'Вибір' });
  expect(trigger.textContent).toContain('Олена');
  const helpId = trigger.getAttribute('aria-describedby');
  expect(document.getElementById(helpId!)?.textContent).toBe('Оберіть наявний запис');
});

test('repeated field names have distinct control IDs and accessible labels', () => {
  render(
    <>
      <ChoiceForm />
      <ChoiceForm />
    </>
  );
  const fields = screen.getAllByRole('combobox', { name: 'Вибір' });
  expect(fields[0].id).not.toBe(fields[1].id);
  for (const field of fields) {
    expect(document.getElementById(field.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Вибір'
    );
  }
});

test('empty catalog loading and failures show distinct feedback with a working retry', async () => {
  const retry = vi.fn();
  const { rerender } = render(<ChoiceForm choices={[]} loading />);
  const trigger = screen.getByRole('combobox', { name: 'Вибір' }) as HTMLButtonElement;
  expect(trigger.disabled).toBe(true);
  expect(trigger.getAttribute('aria-busy')).toBe('true');
  expect(screen.getAllByText('Завантаження…').length).toBeGreaterThan(0);
  rerender(<ChoiceForm choices={[]} errorMessage='Каталог недоступний' onRetry={retry} />);
  expect(screen.getByRole('alert').textContent).toContain('Каталог недоступний');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Повторити' }));
  expect(retry).toHaveBeenCalledOnce();
});
