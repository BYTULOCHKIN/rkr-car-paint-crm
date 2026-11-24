import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { InventorySearch } from '@/features/inventory/components/inventory-search';
import { expect, test, vi } from 'vitest';
import { useDebounce } from '@/hooks/use-debounce';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

test('inventory input stays local and preserves newer typing when an earlier query is acknowledged', async () => {
  vi.useFakeTimers();
  try {
    const onSearch = vi.fn();
    const onPendingChange = vi.fn();
    const view = render(
      <InventorySearch
        search=''
        fetching={false}
        onSearch={onSearch}
        onPendingChange={onPendingChange}
      />
    );
    const input = screen.getByRole('textbox', {
      name: 'Пошук складських позицій'
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Фарба' } });
    expect(input.value).toBe('Фарба');
    expect(onSearch).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('Фарба');
    fireEvent.change(input, { target: { value: 'Фарба зелена' } });
    view.rerender(
      <InventorySearch
        search='Фарба'
        fetching
        onSearch={onSearch}
        onPendingChange={onPendingChange}
      />
    );
    expect(input.value).toBe('Фарба зелена');
    await act(() => vi.advanceTimersByTime(299));
    expect(onSearch).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenLastCalledWith('Фарба зелена');
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test('external search navigation cancels an obsolete local draft', async () => {
  vi.useFakeTimers();
  try {
    const onSearch = vi.fn();
    const onPendingChange = vi.fn();
    const view = render(
      <InventorySearch
        search=''
        fetching={false}
        onSearch={onSearch}
        onPendingChange={onPendingChange}
      />
    );
    const input = screen.getByRole('textbox', {
      name: 'Пошук складських позицій'
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Застарілий' } });
    view.rerender(
      <InventorySearch
        search='Із посилання'
        fetching={false}
        onSearch={onSearch}
        onPendingChange={onPendingChange}
      />
    );
    expect(input.value).toBe('Із посилання');
    await act(() => vi.advanceTimersByTime(500));
    expect(onSearch).not.toHaveBeenCalled();
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test('external navigation between an unacknowledged query and another URL restores the actual URL value', async () => {
  vi.useFakeTimers();
  try {
    const onSearch = vi.fn();
    const onPendingChange = vi.fn();
    const view = render(
      <InventorySearch
        search=''
        fetching={false}
        onSearch={onSearch}
        onPendingChange={onPendingChange}
      />
    );
    const input = screen.getByRole('textbox', {
      name: 'Пошук складських позицій'
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Фарба' } });
    await act(() => vi.advanceTimersByTime(300));
    view.rerender(
      <InventorySearch
        search='Лак'
        fetching={false}
        onSearch={onSearch}
        onPendingChange={onPendingChange}
      />
    );
    expect(input.value).toBe('Лак');
    view.rerender(
      <InventorySearch
        search='Фарба'
        fetching={false}
        onSearch={onSearch}
        onPendingChange={onPendingChange}
      />
    );
    expect(input.value).toBe('Фарба');
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test('debounced search preserves initial URL value and applies only the latest input after the pause', async () => {
  vi.useFakeTimers();
  try {
    const { result, rerender, unmount } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'Фарба' }
    });
    expect(result.current).toBe('Фарба');
    rerender({ value: 'Лак' });
    await act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('Фарба');
    rerender({ value: 'Лак Sprint' });
    await act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('Фарба');
    await act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('Лак Sprint');
    rerender({ value: 'Застарілий пошук' });
    rerender({ value: '' });
    await act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('');
    await act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe('');
    unmount();
  } finally {
    vi.useRealTimers();
  }
});

test('shared callback uses current consumer state and cancels scheduled work on unmount', async () => {
  vi.useFakeTimers();
  try {
    const first = vi.fn();
    const current = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ callback }) => useDebouncedCallback(callback, 300),
      { initialProps: { callback: first } }
    );
    const callback = result.current;
    act(() => result.current('Матеріал'));
    rerender({ callback: current });
    expect(result.current).toBe(callback);
    await act(() => vi.advanceTimersByTime(300));
    expect(first).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledExactlyOnceWith('Матеріал');
    act(() => result.current('Не застосовувати'));
    unmount();
    await act(() => vi.advanceTimersByTime(500));
    expect(current).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
