export async function getInventory(orgId: string) {
  return {
    access: { userId: 'user_test', orgId, role: 'worker' as const },
    items: [],
    movements: []
  };
}
