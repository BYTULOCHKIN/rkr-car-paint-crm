import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { JSDOM } from 'jsdom';
import { inventoryExcelFile } from '@/features/inventory/lib/excel';
import type { StockItem } from '@/features/inventory/api/types';

test('Excel export preserves numeric quantities, unknown valuation and literal text in a real workbook', async () => {
  const base: StockItem = {
    id: 'paint',
    name: 'Фарба зелена',
    unit: 'л',
    notes: 'SKU: 00123 <фарба> & лак',
    tags: ['Фарба', 'Фарба_зелена'],
    archived: false,
    locked: true,
    balanceMilli: 125,
    totalCostCents: 12345,
    valuationRevision: 0
  };
  const blob = await inventoryExcelFile([
    base,
    { ...base, id: 'unknown', name: '=SUM(1,2)', totalCostCents: null, archived: true },
    { ...base, id: 'zero', balanceMilli: 0, totalCostCents: 0 }
  ]).toBlob();
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.ok(files['[Content_Types].xml']);
  const sheet = new JSDOM(strFromU8(files['xl/worksheets/sheet1.xml']), { contentType: 'text/xml' })
    .window.document;
  const shared = new JSDOM(strFromU8(files['xl/sharedStrings.xml']), { contentType: 'text/xml' })
    .window.document;
  const strings = [...shared.getElementsByTagName('si')].map((entry) => entry.textContent);
  function cell(reference: string): string | number | null {
    const element = sheet.querySelector(`c[r="${reference}"]`)!;
    const value = element.querySelector('v')!.textContent!;
    return element.getAttribute('t') === 's' ? strings[Number(value)] : Number(value);
  }
  assert.equal(sheet.getElementsByTagName('row').length, 4);
  assert.equal(cell('A2'), base.name);
  assert.equal(cell('C2'), 'Фарба, Фарба_зелена');
  assert.equal(cell('D2'), 0.125);
  assert.equal(cell('E2'), 123.45);
  assert.equal(cell('F2'), 987.6);
  assert.equal(cell('G2'), base.notes);
  assert.equal(cell('A3'), '=SUM(1,2)');
  assert.equal(cell('E3'), 'Не визначена');
  assert.equal(cell('F3'), 'Не визначена');
  assert.equal(cell('H3'), 'В архіві');
  assert.equal(cell('D4'), 0);
  assert.equal(cell('E4'), 0);
  assert.equal(cell('F4'), '—');
  assert.equal(sheet.getElementsByTagName('f').length, 0);
  assert.equal(sheet.querySelector('pane')?.getAttribute('ySplit'), '1');
});
