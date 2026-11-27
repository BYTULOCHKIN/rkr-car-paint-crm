import { beforeEach, expect, test, vi } from 'vitest';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockItemCards } from '@/features/inventory/components/stock-item-cards';
import { useInventoryLayout } from '@/features/inventory/lib/use-inventory-layout';
import type { StockItem } from '@/features/inventory/api/types';

const base: StockItem = {
  id: 'paint',
  name: 'Фарба',
  unit: 'л',
  accountingMode: 'quantity',
  tags: ['Фарба'],
  notes: 'Для бампера',
  archived: false,
  locked: true,
  balanceMilli: 1000,
  totalCostCents: 10000,
  valuationRevision: 1
};
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

test('cards show availability only for quantity accounting and open the selected item', async () => {
  const onDetails = vi.fn();
  render(
    <StockItemCards
      items={[
        base,
        { ...base, id: 'empty', name: 'Лак', balanceMilli: 0, totalCostCents: 0 },
        {
          ...base,
          id: 'amount',
          name: 'Фарба за сумою',
          unit: '',
          accountingMode: 'amount',
          balanceMilli: 0,
          totalCostCents: 0
        }
      ]}
      actions={() => null}
      onDetails={onDetails}
    />
  );
  expect(screen.getAllByText('В наявності')).toHaveLength(1);
  expect(screen.getAllByText('Немає залишку')).toHaveLength(1);
  const amount = screen.getByRole('heading', { name: 'Фарба за сумою' }).closest('li')!;
  expect(within(amount).queryByText('В наявності')).toBeNull();
  expect(within(amount).queryByText('Немає залишку')).toBeNull();
  expect(within(amount).getByText('За сумою')).toBeDefined();
  expect(screen.getAllByRole('img', { name: 'Зображення відсутнє' })).toHaveLength(3);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Деталі позиції Фарба' }));
  expect(onDetails).toHaveBeenCalledWith(base);
});

test('layout defaults to table, persists and isolates users and organizations', () => {
  const hook = renderHook(({ user, org }) => useInventoryLayout(user, org), {
    initialProps: { user: 'a', org: 'one' }
  });
  expect(hook.result.current[0]).toBe('table');
  act(() => hook.result.current[1]('cards'));
  expect(hook.result.current[0]).toBe('cards');
  hook.rerender({ user: 'b', org: 'one' });
  expect(hook.result.current[0]).toBe('table');
  hook.rerender({ user: 'a', org: 'two' });
  expect(hook.result.current[0]).toBe('table');
  hook.rerender({ user: 'a', org: 'one' });
  expect(hook.result.current[0]).toBe('cards');
  hook.unmount();
  const restored = renderHook(() => useInventoryLayout('a', 'one'));
  expect(restored.result.current[0]).toBe('cards');
  act(() => {
    localStorage.setItem('crm:inventory-layout:one:a', 'table');
    window.dispatchEvent(new StorageEvent('storage', { key: 'crm:inventory-layout:one:a' }));
  });
  expect(restored.result.current[0]).toBe('table');
});

test('blocked storage does not disable layout switching', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage blocked');
  });
  const hook = renderHook(() => useInventoryLayout('blocked', 'org'));
  expect(hook.result.current[0]).toBe('table');
  act(() => hook.result.current[1]('cards'));
  expect(hook.result.current[0]).toBe('cards');
  act(() => hook.result.current[1]('table'));
  expect(hook.result.current[0]).toBe('table');
});
