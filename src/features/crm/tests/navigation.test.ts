import test from 'node:test';
import assert from 'node:assert/strict';
import { navGroups } from '@/config/nav-config';
import { resolveNavigation } from '@/lib/nav-access';
import type { NavItem } from '@/types';

test('worker sees disabled administrative entries and cannot reach their children through shortcuts', () => {
  const context = { hasOrg: true, role: 'org:member', permissions: [] };
  const items = navGroups[0].items;
  const sidebar = resolveNavigation(items, context, true);
  assert.deepEqual(
    sidebar.filter((item) => item.disabled).map((item) => item.title),
    ['Огляд', 'Клієнти та автомобілі']
  );
  assert.ok(
    sidebar
      .find((item) => item.title === 'Клієнти та автомобілі')!
      .items!.every((item) => item.disabled)
  );
  const shortcuts = resolveNavigation(items, context);
  assert.deepEqual(
    shortcuts.map((item) => item.title),
    [
      'Замовлення',
      'Зарплати',
      'Зведення за період',
      'Склад',
      'Автомалярки',
      'Команда',
      'Дошка робіт'
    ]
  );
});

test('administrator retains all CRM navigation; unavailable session and permissions fail closed', () => {
  const admin = { hasOrg: true, role: 'org:admin', permissions: [] };
  assert.equal(resolveNavigation(navGroups[0].items, admin).length, navGroups[0].items.length);
  const item: NavItem = {
    title: 'Закритий розділ',
    url: '/secret',
    access: { permission: 'org:custom:read' }
  };
  assert.deepEqual(resolveNavigation([item], admin), []);
  assert.deepEqual(
    resolveNavigation([item], { ...admin, permissions: ['org:custom:read'], hasOrg: false }),
    []
  );
  assert.equal(resolveNavigation([item], { ...admin, permissions: ['org:custom:read'] }).length, 1);
  assert.ok(
    resolveNavigation(navGroups[0].items, { hasOrg: false, permissions: [] }, true).find(
      (item) => item.title === 'Огляд'
    )!.disabled
  );
});
