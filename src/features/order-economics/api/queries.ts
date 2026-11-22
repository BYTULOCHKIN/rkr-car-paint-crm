import { mutationOptions } from '@tanstack/react-query';
import { saveOrderEconomics } from './service';
import type { SaveEconomicsInput } from '../schemas/details';

export const economicsMutations = {
  save: () =>
    mutationOptions({
      mutationFn: async (input: SaveEconomicsInput) => {
        const result = await saveOrderEconomics(input);
        if (!result.ok) throw new Error(result.error);
      }
    })
};
