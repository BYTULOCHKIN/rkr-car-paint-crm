'use client';

import type { StockTag } from '../constants/tags';
import { StockTagPicker } from './tag-picker';

export function StockTagFilterControl({
  value,
  onChange
}: {
  value: StockTag[];
  onChange: (tags: StockTag[]) => void;
}) {
  return (
    <div className='w-full min-w-0 sm:w-80'>
      <StockTagPicker
        value={value}
        onChange={onChange}
        inputProps={{
          'aria-label': 'Фільтр за тегом',
          placeholder: value.length ? 'Додати тег…' : 'Усі теги'
        }}
      />
    </div>
  );
}
