import { mutationOptions } from '@tanstack/react-query';
import type { ActionResult } from '@/features/crm/api/types';
import {
  recordSettlement,
  reverseSettlement,
  previewFinancialCorrection,
  applyFinancialCorrection,
  updateDefaultShare
} from './finance-service';
function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
export const financeMutations = {
  cash: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof recordSettlement>[0]) =>
        unwrap(await recordSettlement(input))
    }),
  reversal: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof reverseSettlement>[0]) =>
        unwrap(await reverseSettlement(input))
    }),
  preview: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof previewFinancialCorrection>[0]) =>
        unwrap(await previewFinancialCorrection(input))
    }),
  correct: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof applyFinancialCorrection>[0]) =>
        unwrap(await applyFinancialCorrection(input))
    }),
  settings: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof updateDefaultShare>[0]) =>
        unwrap(await updateDefaultShare(input))
    })
};
