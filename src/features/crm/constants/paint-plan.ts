export const bodyParts = [
  { id: 'hood', label: 'Капот' },
  { id: 'roof', label: 'Дах' },
  { id: 'trunk', label: 'Кришка багажника' },
  { id: 'front_bumper', label: 'Передній бампер' },
  { id: 'rear_bumper', label: 'Задній бампер' },
  ...(['left', 'right'] as const).flatMap((side) => {
    const suffix = side === 'left' ? 'ліва сторона' : 'права сторона';
    return [
      { id: `${side}_front_fender`, label: `Переднє крило · ${suffix}` },
      { id: `${side}_rear_fender`, label: `Заднє крило · ${suffix}` },
      { id: `${side}_front_door`, label: `Передні двері · ${suffix}` },
      { id: `${side}_rear_door`, label: `Задні двері · ${suffix}` },
      { id: `${side}_sill`, label: `Поріг · ${suffix}` },
      { id: `${side}_pillar_a`, label: `Стійка A · ${suffix}` },
      { id: `${side}_pillar_b`, label: `Стійка B · ${suffix}` },
      { id: `${side}_pillar_c`, label: `Стійка C · ${suffix}` },
      { id: `${side}_mirror`, label: `Дзеркало · ${suffix}` }
    ];
  })
];

export const paintModes = [
  { value: 'both_sides', label: 'Фарбування з двох сторін', short: 'Дві сторони' },
  { value: 'one_side', label: 'Фарбування з однієї сторони', short: 'Одна сторона' },
  { value: 'partial', label: 'Часткове фарбування', short: 'Частково' }
] as const;

export type PaintMode = (typeof paintModes)[number]['value'];
export interface PaintSelection {
  partId: string;
  mode: PaintMode;
}
export function partLabel(id: string): string {
  return bodyParts.find((part) => part.id === id)?.label ?? id;
}
export function paintModeLabel(mode: PaintMode): string {
  return paintModes.find((option) => option.value === mode)!.label;
}
