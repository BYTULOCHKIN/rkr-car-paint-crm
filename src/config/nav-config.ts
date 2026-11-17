import { NavGroup } from '@/types';

/**
 * Navigation configuration with RBAC support
 *
 * This configuration is used for both the sidebar navigation and Cmd+K bar.
 * Items are organized into groups, each rendered with a SidebarGroupLabel.
 *
 * RBAC Access Control:
 * Each navigation item can have an `access` property that controls visibility
 * based on permissions, plans, features, roles, and organization context.
 *
 * Examples:
 *
 * 1. Require organization:
 *    access: { requireOrg: true }
 *
 * 2. Require specific permission:
 *    access: { requireOrg: true, permission: 'org:teams:manage' }
 *
 * 3. Require specific plan:
 *    access: { plan: 'pro' }
 *
 * 4. Require specific feature:
 *    access: { feature: 'premium_access' }
 *
 * 5. Require specific role:
 *    access: { role: 'admin' }
 *
 * 6. Multiple conditions (all must be true):
 *    access: { requireOrg: true, permission: 'org:teams:manage', plan: 'pro' }
 *
 * Note: The `visible` function is deprecated but still supported for backward compatibility.
 * Use the `access` property for new items.
 */
export const navGroups: NavGroup[] = [
  {
    label: 'Автомалярка',
    items: [
      {
        title: 'Огляд',
        access: { requireOrg: true, role: 'org:admin' },
        url: '/dashboard/overview',
        icon: 'dashboard',
        shortcut: ['d', 'd'],
        items: []
      },
      {
        title: 'Клієнти та автомобілі',
        access: { requireOrg: true, role: 'org:admin' },
        url: '#',
        icon: 'customers',
        items: [
          { title: 'Клієнти', url: '/dashboard/clients', icon: 'customers' },
          { title: 'Автомобілі', url: '/dashboard/vehicles', icon: 'car' }
        ]
      },
      {
        title: 'Заявки',
        url: '/dashboard/requests',
        icon: 'requests',
        items: [],
        access: { requireOrg: true, role: 'org:admin' }
      },
      { title: 'Замовлення', url: '/dashboard/orders', icon: 'orders', items: [] },
      {
        title: 'Склад',
        url: '/dashboard/inventory',
        icon: 'inventory',
        items: [],
        access: { requireOrg: true }
      },
      { title: 'Автомалярки', url: '/dashboard/workspaces', icon: 'garage', items: [] },
      {
        title: 'Команда',
        url: '/dashboard/workspaces/team',
        icon: 'teams',
        items: [],
        access: { requireOrg: true }
      },
      { title: 'Дошка робіт', url: '/dashboard/kanban', icon: 'kanban', items: [] }
    ]
  },
  {
    label: 'Overview',
    items: [
      {
        title: 'Product',
        url: '/dashboard/product',
        icon: 'product',
        shortcut: ['p', 'p'],
        isActive: false,
        items: []
      },
      {
        title: 'Users',
        url: '/dashboard/users',
        icon: 'teams',
        shortcut: ['u', 'u'],
        isActive: false,
        items: []
      },
      {
        title: 'Chat',
        url: '/dashboard/chat',
        icon: 'chat',
        shortcut: ['c', 'c'],
        isActive: false,
        items: []
      },
      {
        title: 'AI Chat',
        url: '/dashboard/ai-chat',
        icon: 'sparkles',
        shortcut: ['a', 'i'],
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: 'Elements',
    items: [
      {
        title: 'Forms',
        url: '#',
        icon: 'forms',
        isActive: true,
        items: [
          {
            title: 'Basic Form',
            url: '/dashboard/forms/basic',
            icon: 'forms',
            shortcut: ['f', 'f']
          },
          {
            title: 'Multi-Step Form',
            url: '/dashboard/forms/multi-step',
            icon: 'forms'
          },
          {
            title: 'Sheet & Dialog',
            url: '/dashboard/forms/sheet-form',
            icon: 'forms'
          },
          {
            title: 'Advanced Patterns',
            url: '/dashboard/forms/advanced',
            icon: 'forms'
          }
        ]
      },
      {
        title: 'React Query',
        url: '/dashboard/react-query',
        icon: 'code',
        isActive: false,
        items: []
      },
      {
        title: 'Icons',
        url: '/dashboard/elements/icons',
        icon: 'palette',
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: '',
    items: [
      {
        title: 'Pro',
        url: '#',
        icon: 'pro',
        isActive: false,
        items: [
          {
            title: 'Exclusive',
            url: '/dashboard/exclusive',
            icon: 'exclusive',
            shortcut: ['e', 'e']
          }
        ]
      },
      {
        title: 'Account',
        url: '#',
        icon: 'account',
        isActive: true,
        items: [
          {
            title: 'Profile',
            url: '/dashboard/profile',
            icon: 'profile',
            shortcut: ['m', 'm']
          },
          {
            title: 'Notifications',
            url: '/dashboard/notifications',
            icon: 'notification',
            shortcut: ['n', 'n']
          },
          {
            title: 'Billing',
            url: '/dashboard/billing',
            icon: 'billing',
            shortcut: ['b', 'b'],
            access: { requireOrg: true }
          },
          {
            title: 'Login',
            shortcut: ['l', 'l'],
            url: '/',
            icon: 'login'
          }
        ]
      }
    ]
  }
];
