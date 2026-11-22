import type {
  EconomicsAdjustmentPreview,
  OrderEconomicsInput,
  OrderEconomicsResult
} from '../api/types';
import { EconomicsError, integer, roundedRatio, sumIntegers } from './integers';

export const DEFAULT_EMPLOYEE_SHARE_BPS = 6000;

function accrual(baseCents: number, rateBps: number): number {
  return roundedRatio(BigInt(baseCents) * BigInt(rateBps), BigInt(10000));
}

export function calculateOrderEconomics(input: OrderEconomicsInput): OrderEconomicsResult {
  integer(input.paintingPriceCents, 'Ціна фарбування');
  integer(input.polishingPriceCents, 'Частина полірування');
  integer(input.assemblyPriceCents, 'Ціна розбірки-збірки');
  integer(input.paintingMaterialsCents, 'Матеріали маляра');
  integer(input.polishingMaterialsCents, 'Матеріали полірувальника');
  integer(input.employeeShareBps, 'Ставка');
  if (input.employeeShareBps > 10000) throw new EconomicsError('Ставка перевищує 100%');

  // Subtract sequentially: never sum untrusted amounts before overflow validation.
  if (input.polishingPriceCents > input.paintingPriceCents) {
    throw new EconomicsError('Частина полірування перевищує ціну фарбування');
  }
  const paintingServiceCents = input.paintingPriceCents - input.polishingPriceCents;
  if (input.paintingMaterialsCents > paintingServiceCents) {
    throw new EconomicsError('Матеріали маляра перевищують його частину вартості робіт');
  }
  if (input.polishingMaterialsCents > input.polishingPriceCents) {
    throw new EconomicsError('Матеріали полірувальника перевищують ціну полірування');
  }
  for (const subcontract of input.subcontracts) {
    if (!['color_matching', 'soldering', 'other'].includes(subcontract.kind)) {
      throw new EconomicsError('Невідомий вид субпідряду');
    }
    integer(subcontract.priceCents, 'Ціна субпідряду для клієнта');
    integer(subcontract.costCents, 'Вартість субпідряду');
    if (subcontract.kind === 'color_matching' && subcontract.priceCents !== subcontract.costCents) {
      throw new EconomicsError('Сума підбору фарби повністю належить колористу');
    }
  }

  const painterBaseCents = paintingServiceCents - input.paintingMaterialsCents;
  const polisherBaseCents = input.polishingPriceCents - input.polishingMaterialsCents;
  const assemblerBaseCents = input.assemblyPriceCents;
  const painterAccrualCents = accrual(painterBaseCents, input.employeeShareBps);
  const polisherAccrualCents = accrual(polisherBaseCents, input.employeeShareBps);
  const assemblerAccrualCents = accrual(assemblerBaseCents, input.employeeShareBps);
  const employeeAccrualsCents = sumIntegers([
    painterAccrualCents,
    polisherAccrualCents,
    assemblerAccrualCents
  ]);
  const checkCents = sumIntegers([
    input.paintingPriceCents,
    input.assemblyPriceCents,
    ...input.subcontracts.map((entry) => entry.priceCents)
  ]);
  const materialsCents = sumIntegers([input.paintingMaterialsCents, input.polishingMaterialsCents]);
  const subcontractCostsCents = sumIntegers(input.subcontracts.map((entry) => entry.costCents));
  const workshopRemainderCents = sumIntegers([
    checkCents,
    -materialsCents,
    -employeeAccrualsCents,
    -subcontractCostsCents
  ]);
  return {
    checkCents,
    materialsCents,
    painterBaseCents,
    polisherBaseCents,
    assemblerBaseCents,
    painterAccrualCents,
    polisherAccrualCents,
    assemblerAccrualCents,
    employeeAccrualsCents,
    subcontractCostsCents,
    workshopRemainderCents
  };
}

/** Preview only: posting a correction and tracking revisions belong to the repository. */
export function previewEconomicsAdjustment(
  beforeInput: OrderEconomicsInput,
  afterInput: OrderEconomicsInput
): EconomicsAdjustmentPreview {
  const before = calculateOrderEconomics(beforeInput);
  const after = calculateOrderEconomics(afterInput);
  const difference = (key: keyof OrderEconomicsResult): number =>
    sumIntegers([after[key], -before[key]]);
  const delta: OrderEconomicsResult = {
    checkCents: difference('checkCents'),
    materialsCents: difference('materialsCents'),
    painterBaseCents: difference('painterBaseCents'),
    polisherBaseCents: difference('polisherBaseCents'),
    assemblerBaseCents: difference('assemblerBaseCents'),
    painterAccrualCents: difference('painterAccrualCents'),
    polisherAccrualCents: difference('polisherAccrualCents'),
    assemblerAccrualCents: difference('assemblerAccrualCents'),
    employeeAccrualsCents: difference('employeeAccrualsCents'),
    subcontractCostsCents: difference('subcontractCostsCents'),
    workshopRemainderCents: difference('workshopRemainderCents')
  };
  return { before, after, delta };
}
