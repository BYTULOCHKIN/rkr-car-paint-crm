export async function getInventory(orgId: string) {
  return {
    access: { userId: 'user_test', orgId, role: 'worker' as const },
    items: [],
    movements: []
  };
}

export const getOrderInventory = getInventory;
export async function getInventoryAccess(orgId: string) {
  return { access: (await getInventory(orgId)).access };
}
