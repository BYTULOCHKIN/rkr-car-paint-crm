import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { OrderEconomicsDetails } from '../api/types';
import { economicsDetailsSchema } from '../schemas/details';
import { detailedCheckFormSchema, formToEconomics } from '../schemas/form';
import { previewDetailedEconomics } from '../lib/details';

function example(): OrderEconomicsDetails {
  return {
    employeeShareBps: 6000,
    painterId: 'painter',
    polisherId: 'polisher',
    assemblerId: '',
    lines: [
      {
        id: randomUUID(),
        kind: 'painting',
        description: 'Бампер',
        quantity: 1,
        unitPriceCents: 1800000,
        polishingCents: 100000,
        subcontractCostCents: 0,
        contractorName: ''
      }
    ]
  };
}
test('unknown or unallocated material costs never become a zero-cost estimate', () => {
  const input = example();
  for (const costs of [
    { paintingCents: null, polishingCents: 0, unallocatedCents: 0, totalCents: null },
    { paintingCents: 0, polishingCents: 0, unallocatedCents: 100, totalCents: 100 },
    { paintingCents: 0, polishingCents: 0, unallocatedCents: null, totalCents: null }
  ]) {
    const preview = previewDetailedEconomics(input, costs);
    assert.equal(preview.result, null);
    assert.ok(preview.issues.length > 0);
  }
  const missing = previewDetailedEconomics(
    { ...input, painterId: '' },
    { paintingCents: 300000, polishingCents: 50000, unallocatedCents: 0, totalCents: 350000 }
  );
  assert.equal(missing.result!.painterAccrualCents, 840000);
  assert.ok(missing.issues.includes('Не призначено маляра.'));
});
test('invalid details reject excess polishing, duplicate lines, repeated assembly and colorist margin', () => {
  const input = example();
  for (const candidate of [
    { ...input, employeeShareBps: 10001 },
    { ...input, lines: [{ ...input.lines[0], polishingCents: 1800001 }] },
    { ...input, lines: [input.lines[0], input.lines[0]] },
    {
      ...input,
      lines: [1, 2].map(() => ({
        ...input.lines[0],
        id: randomUUID(),
        kind: 'assembly' as const,
        polishingCents: 0
      }))
    },
    {
      ...input,
      lines: [
        {
          ...input.lines[0],
          kind: 'color_matching' as const,
          polishingCents: 0,
          contractorName: 'Колорист',
          subcontractCostCents: 100
        }
      ]
    }
  ])
    assert.equal(economicsDetailsSchema.safeParse(candidate).success, false);
});
test('decimal form values normalize once; changing kind cannot retain hidden polishing or contractor costs', () => {
  const form = {
    painterId: '',
    polisherId: '',
    assemblerId: '',
    share: '60',
    lines: [
      {
        id: randomUUID(),
        kind: 'painting' as const,
        description: 'Бампер',
        quantity: 2,
        price: '123,45',
        polishing: '10,05',
        subcontractCost: '0',
        contractorName: ''
      }
    ]
  };
  assert.equal(formToEconomics(form).lines[0].unitPriceCents, 12345);
  assert.equal(formToEconomics(form).lines[0].polishingCents, 1005);
  const colorist = formToEconomics({
    ...form,
    lines: [{ ...form.lines[0], kind: 'color_matching', contractorName: 'Колорист' }]
  });
  assert.equal(colorist.lines[0].subcontractCostCents, 24690);
  assert.equal(colorist.lines[0].polishingCents, 0);
  assert.equal(
    detailedCheckFormSchema.safeParse({
      ...form,
      lines: [{ ...form.lines[0], kind: 'unclassified' }]
    }).success,
    false
  );
});
