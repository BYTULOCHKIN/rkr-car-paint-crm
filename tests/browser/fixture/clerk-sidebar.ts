const organization = { id: 'org_test', name: 'Тестова автомалярка', hasImage: false };
const user = {
  id: 'user_owner',
  fullName: 'Олена Адміністратор',
  emailAddresses: [{ emailAddress: 'owner@example.com' }]
};
const permissions: string[] = [];
const userMemberships = { data: [{ id: 'membership_test', organization, role: 'org:admin' }] };

export function useUser() {
  return { user };
}
export function useOrganization() {
  return {
    organization,
    membership: {
      role:
        new URLSearchParams(location.search).get('role') === 'worker' ? 'org:member' : 'org:admin',
      permissions
    }
  };
}
export function useClerk() {
  return { signOut: async () => {} };
}
export function useAuth() {
  return { orgId: organization.id, isLoaded: true };
}
export function useOrganizationList() {
  return { isLoaded: true, userMemberships, setActive: async () => {} };
}
