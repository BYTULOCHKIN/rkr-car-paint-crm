import type { Customer, CustomerContactValue } from '../api/types';
import { parseCustomerPhone } from '@/lib/phone-number';

export function normalizeContact(type: CustomerContactValue['type'], value: string): string {
  if (type === 'email') return value.trim().toLowerCase();
  const parsed = parseCustomerPhone(value);
  if (parsed?.isValid()) return parsed.number.slice(1);
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('0')) digits = `38${digits}`;
  return digits;
}

export function customerContacts(
  customer?: Pick<Customer, 'phone' | 'contacts'>
): CustomerContactValue[] {
  if (!customer) return [];
  return customer.contacts ?? (customer.phone ? [{ type: 'phone', value: customer.phone }] : []);
}
export function primaryContact(customer?: Pick<Customer, 'phone' | 'contacts'>): string {
  const contacts = customerContacts(customer);
  return (contacts.find((contact) => contact.type === 'phone') ?? contacts[0])?.value ?? '';
}
export function contactHref(contact: CustomerContactValue): string {
  return contact.type === 'phone'
    ? `tel:${contact.value.replace(/[^+\d]/g, '')}`
    : `mailto:${contact.value}`;
}
export function contactSearchValues(customer?: Pick<Customer, 'phone' | 'contacts'>): string[] {
  return customerContacts(customer).flatMap((contact) => [
    contact.value,
    normalizeContact(contact.type, contact.value),
    contact.type === 'phone' ? contact.value.replace(/\D/g, '') : contact.value
  ]);
}
