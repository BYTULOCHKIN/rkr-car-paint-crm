'use client';

import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

export function useSettlementFilters() {
  return useQueryStates(
    {
      settlementSearch: parseAsString.withDefault(''),
      settlementKind: parseAsStringLiteral(['all', 'worker', 'contractor'] as const).withDefault(
        'all'
      )
    },
    { shallow: true }
  );
}
