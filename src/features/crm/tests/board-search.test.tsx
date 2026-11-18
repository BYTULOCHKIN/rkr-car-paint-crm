import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { BoardSearch } from '../components/board-search';

test('typing updates immediately and applies only the latest query after the debounce', async () => {
  vi.useFakeTimers();
  try {
    const onSearch = vi.fn();
    const view = render(<BoardSearch search='' onSearch={onSearch} />);
    const input = screen.getByRole('searchbox', { name: 'Пошук на дошці' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ford' } });
    expect(input.value).toBe('Ford');
    await act(() => vi.advanceTimersByTime(200));
    fireEvent.change(input, { target: { value: 'Ford Focus' } });
    expect(input.value).toBe('Ford Focus');
    await act(() => vi.advanceTimersByTime(249));
    expect(onSearch).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('Ford Focus');
    view.rerender(<BoardSearch search='Ford Focus' onSearch={onSearch} />);
    expect(input.getAttribute('aria-busy')).toBe('false');
  } finally {
    vi.useRealTimers();
  }
});

test('clearing replaces a pending search and unmount cancels pending work', async () => {
  vi.useFakeTimers();
  try {
    const onSearch = vi.fn();
    const view = render(<BoardSearch search='' onSearch={onSearch} />);
    const input = screen.getByRole('searchbox', { name: 'Пошук на дошці' });
    fireEvent.change(input, { target: { value: 'obsolete' } });
    fireEvent.change(input, { target: { value: '' } });
    await act(() => vi.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('');
    fireEvent.change(input, { target: { value: 'unmounted' } });
    view.unmount();
    await act(() => vi.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
