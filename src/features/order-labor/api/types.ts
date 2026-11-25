export const laborRoles = ['painter', 'polisher', 'assembler'] as const;
export type LaborRole = (typeof laborRoles)[number];

export interface LaborAssignment {
  workerId: string;
  workerName: string;
  shareBps: number;
}

/** Internal service budgets are already included in the client check. */
export interface OrderLabor {
  painter: LaborAssignment;
  polisher: LaborAssignment;
  assembler: LaborAssignment;
  polishingCents: number;
  assemblyCents: number;
}
