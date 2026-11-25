import { mutationOptions } from '@tanstack/react-query';
import { saveOrderLabor } from './service';
import type { SaveOrderLaborInput } from '../schemas/labor';

export const laborMutations = {
  save: () =>
    mutationOptions({
      mutationFn: async (input: SaveOrderLaborInput) => {
        const result = await saveOrderLabor(input);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      }
    })
};
