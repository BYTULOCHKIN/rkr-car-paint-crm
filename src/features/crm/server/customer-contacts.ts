import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { normalizeContact } from '../lib/customer-contacts';
import type { CustomerContactValue } from '../api/types';

export function migrateCustomerContacts(db: DatabaseSync): void {
  if (
    !db
      .prepare('PRAGMA table_info(crm_customers)')
      .all()
      .some((column) => column.name === 'revision')
  )
    db.exec('ALTER TABLE crm_customers ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_customer_contacts (
      id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES crm_customers(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('phone','email')), value TEXT NOT NULL,
      normalizedValue TEXT NOT NULL, position INTEGER NOT NULL,
      UNIQUE(customerId, type, normalizedValue)
    );
    CREATE INDEX IF NOT EXISTS crm_contacts_customer ON crm_customer_contacts(customerId, position);
  `);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO crm_customer_contacts VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const row of db
    .prepare(`
    SELECT id, phone FROM crm_customers c WHERE phone != '' AND NOT EXISTS (
      SELECT 1 FROM crm_customer_contacts contact
      WHERE contact.customerId=c.id AND contact.type='phone'
    )
  `)
    .all()) {
    insert.run(
      randomUUID(),
      row.id,
      'phone',
      row.phone,
      normalizeContact('phone', row.phone as string),
      0
    );
  }
}

export function replaceCustomerContacts(
  db: DatabaseSync,
  customerId: string,
  contacts: CustomerContactValue[]
): void {
  const existing = db
    .prepare('SELECT id, type, normalizedValue FROM crm_customer_contacts WHERE customerId=?')
    .all(customerId);
  const keys = new Set(
    contacts.map((contact) => `${contact.type}:${normalizeContact(contact.type, contact.value)}`)
  );
  for (const row of existing)
    if (!keys.has(`${row.type}:${row.normalizedValue}`))
      db.prepare('DELETE FROM crm_customer_contacts WHERE id=? AND customerId=?').run(
        row.id,
        customerId
      );
  contacts.forEach((contact, position) => {
    const normalized = normalizeContact(contact.type, contact.value);
    const match = existing.find(
      (row) => row.type === contact.type && row.normalizedValue === normalized
    );
    if (match)
      db.prepare(
        'UPDATE crm_customer_contacts SET value=?, position=? WHERE id=? AND customerId=?'
      ).run(contact.value, position, match.id, customerId);
    else
      db.prepare('INSERT INTO crm_customer_contacts VALUES (?, ?, ?, ?, ?, ?)').run(
        randomUUID(),
        customerId,
        contact.type,
        contact.value,
        normalized,
        position
      );
  });
}
