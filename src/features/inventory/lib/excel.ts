import writeExcelFile, { type Cell, type SheetData } from 'write-excel-file/browser';
import type { StockItem } from '../api/types';
import { roundedRatio } from '@/features/order-economics/lib/integers';

const moneyFormat = '#,##0.00';

function text(value: string): Cell {
  return { value, type: String, format: '@', wrap: true, alignVertical: 'top' };
}

/** Keep quantities and known costs numeric so Excel can sort and sum them. */
export function inventoryExcelData(items: StockItem[]): SheetData {
  return [
    [
      'Назва матеріалу',
      'Одиниця виміру',
      'Теги',
      'Залишок',
      'Вартість залишку, грн',
      'Середня за одиницю, грн',
      'Примітка',
      'Статус'
    ].map((value) => ({
      value,
      type: String,
      fontWeight: 'bold',
      backgroundColor: '#1f2937',
      textColor: '#ffffff',
      wrap: true,
      height: 30
    })),
    ...items.map((item): Cell[] => [
      text(item.name),
      text(item.accountingMode === 'amount' ? 'За сумою' : item.unit),
      text(item.tags.join(', ')),
      item.accountingMode === 'amount'
        ? text('Без контролю залишку')
        : { value: item.balanceMilli / 1000, type: Number, format: '0.###' },
      item.accountingMode === 'amount'
        ? text('—')
        : item.totalCostCents === null
          ? text('Не визначена')
          : { value: item.totalCostCents / 100, type: Number, format: moneyFormat },
      item.accountingMode === 'amount'
        ? text('—')
        : item.totalCostCents === null
          ? text('Не визначена')
          : item.balanceMilli === 0
            ? text('—')
            : {
                value:
                  roundedRatio(
                    BigInt(item.totalCostCents) * BigInt(1000),
                    BigInt(item.balanceMilli)
                  ) / 100,
                type: Number,
                format: moneyFormat
              },
      text(item.notes),
      text(item.archived ? 'В архіві' : 'Активна')
    ])
  ];
}

export function inventoryExcelFile(items: StockItem[]): ReturnType<typeof writeExcelFile> {
  return writeExcelFile(
    inventoryExcelData(items),
    {
      sheet: 'Склад',
      stickyRowsCount: 1,
      stickyColumnsCount: 1,
      columns: [48, 12, 36, 16, 24, 28, 80, 14].map((width) => ({ width }))
    },
    { fontFamily: 'Calibri', fontSize: 11 }
  );
}
