import type { ReactElement } from 'react';
import { paintModes } from '../constants/paint-plan';
import { PaintSwatch } from './paint-pattern';

export function PaintLegend(): ReactElement {
  return (
    <div role='group' aria-label='Легенда схеми' className='flex flex-wrap gap-x-5 gap-y-3 text-xs'>
      {paintModes.map((option) => (
        <div key={option.value} className='flex items-center gap-2'>
          <PaintSwatch mode={option.value} />
          <span>{option.short}</span>
        </div>
      ))}
      <div className='flex items-center gap-2'>
        <PaintSwatch />
        <span>Не позначено</span>
      </div>
    </div>
  );
}
