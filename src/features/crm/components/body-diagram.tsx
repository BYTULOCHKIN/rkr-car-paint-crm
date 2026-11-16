'use client';

import { useId, type ReactElement } from 'react';
import { PaintPatternDefs } from './paint-pattern';
import { bodyParts, paintModes, type PaintSelection } from '../constants/paint-plan';

interface BodyDiagramProps {
  value: PaintSelection[];
  onPartClick?: (id: string) => void;
}

/** Shared geometry for the editable plan and its printed snapshot. */
export function BodyDiagram({ value, onPartClick }: BodyDiagramProps): ReactElement {
  const prefix = useId().replaceAll(':', '');
  function panel(id: string, d: string, x: number, y: number): ReactElement {
    const number = bodyParts.findIndex((part) => part.id === id) + 1;
    const label = bodyParts[number - 1].label;
    const mode = value.find((part) => part.partId === id)?.mode;
    const title = `${label}${mode ? ': ' + paintModes.find((option) => option.value === mode)!.short : ''}`;
    return (
      <g key={id}>
        <path
          d={d}
          fill={mode ? `url(#${prefix}-${mode})` : 'var(--background, white)'}
          stroke={mode ? 'var(--paint-ink, currentColor)' : 'var(--paint-outline, currentColor)'}
          strokeWidth={mode ? 2.8 : 1.2}
          vectorEffect='non-scaling-stroke'
          role={onPartClick ? 'button' : undefined}
          tabIndex={onPartClick ? 0 : undefined}
          aria-label={title}
          aria-pressed={onPartClick ? !!mode : undefined}
          onClick={onPartClick ? () => onPartClick(id) : undefined}
          onKeyDown={
            onPartClick
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPartClick(id);
                  }
                }
              : undefined
          }
          className={
            onPartClick
              ? 'cursor-pointer outline-none hover:stroke-primary focus:stroke-primary focus:stroke-[4]'
              : undefined
          }
        >
          <title>{title}</title>
        </path>
        <text
          x={x}
          y={y}
          textAnchor='middle'
          dominantBaseline='middle'
          fontSize='11'
          stroke='var(--background, white)'
          strokeWidth='2.5'
          paintOrder='stroke'
          fill={mode ? 'var(--paint-ink, currentColor)' : 'var(--paint-outline, currentColor)'}
          fontWeight={mode ? 700 : 400}
          pointerEvents='none'
        >
          {number}
        </text>
      </g>
    );
  }
  function side(side: 'left' | 'right', offsetY: number): ReactElement {
    return (
      <g transform={`translate(235 ${offsetY})`}>
        <text x='210' y='14' textAnchor='middle' fontSize='13' fill='currentColor'>
          {side === 'left' ? 'Лівий бік' : 'Правий бік'}
        </text>
        <path
          d='M20 110 L28 76 L105 68 L157 27 Q215 16 282 30 L335 65 L388 75 L410 112 L410 135 L20 135 Z'
          fill='var(--paint-body, var(--muted, #eee))'
          stroke='var(--paint-outline, currentColor)'
        />
        <circle
          cx='90'
          cy='129'
          r='27'
          fill='var(--background, white)'
          stroke='var(--paint-outline, currentColor)'
          strokeWidth='2'
        />
        <circle
          cx='344'
          cy='129'
          r='27'
          fill='var(--background, white)'
          stroke='var(--paint-outline, currentColor)'
          strokeWidth='2'
        />
        <circle cx='90' cy='129' r='14' fill='none' stroke='var(--paint-outline, currentColor)' />
        <circle cx='344' cy='129' r='14' fill='none' stroke='var(--paint-outline, currentColor)' />
        <path
          d='M142 65 L166 35 L209 31 L209 65 Z M225 31 L274 36 L307 65 L225 65 Z'
          fill='var(--background, white)'
          stroke='var(--paint-outline, currentColor)'
        />
        {panel(
          `${side}_front_fender`,
          'M28 77 L108 70 L125 82 L125 127 L120 127 Q117 95 90 95 Q61 95 59 126 L22 126 Z',
          47,
          93
        )}
        {panel(
          `${side}_rear_fender`,
          'M305 72 L384 79 L404 112 L404 127 L375 127 Q372 95 344 95 Q319 95 314 124 L305 124 Z',
          382,
          96
        )}
        {panel(`${side}_front_door`, 'M132 74 L212 74 L212 126 L132 126 Z', 173, 100)}
        {panel(`${side}_rear_door`, 'M219 74 L299 74 L299 126 L219 126 Z', 258, 100)}
        {panel(`${side}_sill`, 'M125 132 L309 132 L309 145 L125 145 Z', 216, 139)}
        {panel(`${side}_pillar_a`, 'M111 66 L155 30 L163 34 L133 66 Z', 139, 49)}
        {panel(`${side}_pillar_b`, 'M213 30 L221 30 L221 68 L213 68 Z', 217, 49)}
        {panel(`${side}_pillar_c`, 'M281 32 L290 34 L327 66 L312 66 Z', 300, 49)}
        {panel(`${side}_mirror`, 'M111 59 Q97 48 99 43 Q116 40 128 52 L128 59 Z', 113, 50)}
        <path
          d='M184 84 h15 M267 84 h15'
          fill='none'
          stroke='var(--paint-outline, currentColor)'
          strokeWidth='2'
        />
      </g>
    );
  }
  return (
    <svg
      viewBox='0 0 680 520'
      className='h-auto w-full text-foreground'
      aria-label='Схема кузова автомобіля'
      role='group'
    >
      <PaintPatternDefs prefix={prefix} />
      <g transform='translate(20 25)'>
        <text x='95' y='5' textAnchor='middle' fontSize='13' fill='currentColor'>
          Вигляд зверху · перед ↑
        </text>
        <path
          d='M45 32 Q95 15 145 32 Q175 70 169 265 Q160 320 144 331 Q95 347 46 331 Q23 302 21 265 Q15 70 45 32 Z'
          fill='var(--paint-body, var(--muted, #eee))'
          stroke='var(--paint-outline, currentColor)'
        />
        <path
          d='M46 134 L143 134 L135 161 L54 161 Z M54 242 L135 242 L143 269 L46 269 Z'
          fill='var(--background, white)'
          stroke='var(--paint-outline, currentColor)'
        />
        {panel('front_bumper', 'M47 35 Q95 23 143 35 L150 49 L40 49 Z', 95, 40)}
        {panel('hood', 'M40 56 L150 56 L145 127 L45 127 Z', 95, 90)}
        {panel('roof', 'M54 168 L135 168 L135 235 L54 235 Z', 95, 201)}
        {panel('trunk', 'M45 276 L145 276 L150 310 L40 310 Z', 95, 293)}
        {panel('rear_bumper', 'M40 317 L150 317 L142 329 Q95 343 48 329 Z', 95, 326)}
        <text x='95' y='370' textAnchor='middle' fontSize='11' fill='currentColor'>
          Універсальна схема
        </text>
        <text x='95' y='387' textAnchor='middle' fontSize='11' fill='currentColor'>
          Сторони — за ходом авто
        </text>
      </g>
      {side('left', 20)}
      {side('right', 202)}
      {(['front', 'rear'] as const).map((end, index) => (
        <g key={end} transform={`translate(${255 + index * 218} 398)`}>
          <text x='95' y='4' textAnchor='middle' fontSize='13' fill='currentColor'>
            {end === 'front' ? 'Перед' : 'Зад'}
          </text>
          <path
            d='M14 61 L38 22 Q95 11 152 22 L176 61 L182 97 L8 97 Z'
            fill='var(--paint-body, var(--muted, #eee))'
            stroke='var(--paint-outline, currentColor)'
          />
          <path
            d='M47 28 L143 28 L159 55 L31 55 Z'
            fill='var(--background, white)'
            stroke='var(--paint-outline, currentColor)'
          />
          <path
            d='M19 62 h28 v9 H19 Z M143 62 h28 v9 h-28 Z'
            fill='var(--background, white)'
            stroke='var(--paint-outline, currentColor)'
          />
          {panel(`${end}_bumper`, 'M12 78 L178 78 L179 95 L11 95 Z', 95, 87)}
        </g>
      ))}
    </svg>
  );
}
