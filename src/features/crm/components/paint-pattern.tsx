'use client';

import { useId, type ReactElement } from 'react';
import type { PaintMode } from '../constants/paint-plan';

/** Opaque SVG fills work in PDF and with browser background printing disabled. */
export function PaintPatternDefs({ prefix }: { prefix: string }): ReactElement {
  return (
    <defs>
      <pattern id={`${prefix}-one_side`} width='10' height='10' patternUnits='userSpaceOnUse'>
        <rect width='10' height='10' fill='var(--paint-paper, var(--background, white))' />
        <path
          d='M-2 2 L2 -2 M0 10 L10 0 M8 12 L12 8'
          stroke='var(--paint-ink, currentColor)'
          strokeWidth='1.8'
        />
      </pattern>
      <pattern id={`${prefix}-both_sides`} width='12' height='12' patternUnits='userSpaceOnUse'>
        <rect width='12' height='12' fill='var(--paint-paper, var(--background, white))' />
        <path
          d='M-2 2 L2 -2 M0 12 L12 0 M10 14 L14 10 M-2 10 L2 14 M0 0 L12 12 M10 -2 L14 2'
          stroke='var(--paint-ink, currentColor)'
          strokeWidth='1.8'
        />
      </pattern>
      <pattern id={`${prefix}-partial`} width='9' height='9' patternUnits='userSpaceOnUse'>
        <rect width='9' height='9' fill='var(--paint-paper, var(--background, white))' />
        <circle cx='4.5' cy='4.5' r='1.9' fill='var(--paint-ink, currentColor)' />
      </pattern>
    </defs>
  );
}

export function PaintSwatch({ mode }: { mode?: PaintMode }): ReactElement {
  const prefix = useId().replaceAll(':', '');
  return (
    <svg width='48' height='30' viewBox='0 0 48 30' aria-hidden='true' className='shrink-0'>
      <PaintPatternDefs prefix={prefix} />
      <rect
        x='1'
        y='1'
        width='46'
        height='28'
        rx='4'
        fill={mode ? `url(#${prefix}-${mode})` : 'var(--paint-paper, var(--background, white))'}
        stroke={mode ? 'var(--paint-ink, currentColor)' : 'var(--paint-outline, currentColor)'}
        strokeWidth={mode ? 2 : 1}
      />
    </svg>
  );
}
