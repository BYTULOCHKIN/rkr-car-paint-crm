import type { PeriodReport, EconomicsTotals, SettlementTotals } from '../api/types';

interface CsvNumber {
  numeric: string;
}
type CsvCell = string | number | CsvNumber | null;
export type ReportTab = 'postings' | 'orders' | 'materials' | 'settlements';

function decimal(value: number | null, scale = 2): CsvNumber | null {
  if (value === null) return null;
  const magnitude = BigInt(Math.abs(value));
  const factor = BigInt(10) ** BigInt(scale);
  return {
    numeric: `${value < 0 ? '-' : ''}${magnitude / factor},${String(magnitude % factor).padStart(scale, '0')}`
  };
}
export function encodeCsv(rows: CsvCell[][]): string {
  const encode = (value: CsvCell): string => {
    let text =
      value === null ? 'Не визначено' : typeof value === 'object' ? value.numeric : String(value);
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${rows.map((row) => row.map(encode).join(';')).join('\r\n')}\r\n`;
}
const economicsHeaders = [
  'Чек, грн',
  'Матеріали, грн',
  'Працівникам, грн',
  'Субпідряд, грн',
  'Залишок після прямих витрат, грн'
];
function economicsCells(value: EconomicsTotals | null): CsvCell[] {
  return value
    ? [
        value.checkCents,
        value.materialsCents,
        value.employeeAccrualsCents,
        value.subcontractCostsCents,
        value.workshopRemainderCents
      ].map((entry) => decimal(entry))
    : economicsHeaders.map(() => null);
}
const settlementHeaders = [
  'На початок, грн',
  'Нарахування, грн',
  'Коригування, грн',
  'Виплати, грн',
  'Повернення, грн',
  'Скасування (вплив на баланс), грн',
  'Баланс на кінець, грн',
  'До виплати по авто, грн',
  'Аванси по авто, грн'
];
function settlementCells(row: SettlementTotals): CsvCell[] {
  return [
    row.openingCents,
    row.accrualCents,
    row.adjustmentCents,
    row.payoutCents,
    row.returnCents,
    row.reversalCents,
    row.closingCents,
    row.payableCents,
    row.advanceCents
  ].map((entry) => decimal(entry));
}

/** Export the exact role-scoped response displayed on screen. */
export function reportCsv(report: PeriodReport, tab: ReportTab): string {
  const rows: CsvCell[][] = [
    ['Період', report.filters.from, report.filters.to],
    ['Сформовано', report.generatedAt]
  ];
  if (report.access.role === 'worker') tab = 'settlements';
  if (tab === 'postings') {
    rows.push(
      ['Проведення за датою запису; коригування — тільки різниця'],
      ['Дата (UTC)', 'Замовлення', 'Авто', 'Вид', 'Версія', ...economicsHeaders, 'Причина', 'Автор']
    );
    for (const row of report.postings)
      rows.push([
        row.createdAt,
        row.order.number,
        row.order.vehicle,
        row.kind === 'initial' ? 'Початковий розрахунок' : 'Коригування',
        row.revision,
        ...economicsCells(row.delta),
        row.note,
        row.actor.name
      ]);
    rows.push(
      ['Разом', '', '', '', '', ...economicsCells(report.economics)],
      [],
      ['Рух клієнтських коштів за датою запису'],
      ['Дата (UTC)', 'Замовлення', 'Авто', 'Вид', 'Сума зі знаком, грн', 'Примітка']
    );
    for (const row of report.cash?.rows ?? [])
      rows.push([
        row.createdAt,
        row.order.number,
        row.order.vehicle,
        row.kind,
        decimal(row.amountCents),
        row.note
      ]);
    rows.push(['Разом рух коштів', '', '', '', decimal(report.cash?.netCents ?? 0)]);
  } else if (tab === 'orders') {
    rows.push(
      ['Відбір авто', report.filters.orderDate, 'Проведені суми станом на кінець періоду'],
      ['Замовлення', 'Авто', 'Клієнт', 'Дата відбору', 'Версія', ...economicsHeaders]
    );
    for (const row of report.orders)
      rows.push([
        row.number,
        row.vehicle,
        row.customer,
        row.date,
        row.revision,
        ...economicsCells(row.economics)
      ]);
  } else if (tab === 'materials') {
    rows.push(
      ['Списання мінус повернення за датою складського руху; відбір авто не застосовується'],
      [
        'Матеріал',
        'Одиниця',
        ...report.materials.orders.flatMap((order) => [
          `№${order.number} ${order.vehicle} · кількість`,
          `№${order.number} · вартість, грн`
        ]),
        'Разом кількість',
        'Разом вартість, грн'
      ]
    );
    for (const row of report.materials.rows)
      rows.push([
        row.name,
        row.unit,
        ...report.materials.orders.flatMap((order) => {
          const cell = row.cells[order.id];
          return [decimal(cell?.quantityMilli ?? 0, 3), decimal(cell ? cell.costCents : 0)];
        }),
        decimal(row.quantityMilli, 3),
        decimal(row.costCents)
      ]);
  } else {
    rows.push(
      [
        'Баланс на початок + нарахування + коригування − виплати + повернення + скасування = баланс на кінець'
      ],
      ['Одержувач', 'Вид', ...settlementHeaders]
    );
    for (const row of report.settlements.payees)
      rows.push([
        row.payee.name,
        row.payee.kind === 'worker' ? 'Працівник' : 'Підрядник',
        ...settlementCells(row)
      ]);
    rows.push(
      [],
      ['Баланс по авто; аванси між замовленнями не зараховуються'],
      ['Одержувач', 'Замовлення', 'Авто', ...settlementHeaders]
    );
    for (const row of report.settlements.orders)
      rows.push([row.payee.name, row.order.number, row.order.vehicle, ...settlementCells(row)]);
    rows.push(
      [],
      ['Історія за датою операції'],
      [
        'Дата (UTC)',
        'Замовлення',
        'Одержувач',
        'Вид',
        'Сума, грн',
        'Зміна балансу, грн',
        'Причина',
        'Автор'
      ]
    );
    for (const row of report.settlements.events)
      rows.push([
        row.createdAt,
        row.order.number,
        row.payee.name,
        row.kind,
        decimal(row.amountCents),
        decimal(row.balanceDeltaCents),
        row.note,
        row.actor.name
      ]);
  }
  return encodeCsv(rows);
}
