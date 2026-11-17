import { Icons } from '@/components/icons';
import { TableCellPopover } from '@/components/data-table/table-cell-preview';
import type { Customer } from '../api/types';
import { contactHref, customerContacts, primaryContact } from '../lib/customer-contacts';

export function CustomerContacts({ customer }: { customer: Customer }) {
  const contacts = customerContacts(customer);
  return (
    <ul className='flex min-w-0 flex-col gap-2 text-sm'>
      {contacts.map((contact, index) => {
        const Icon = contact.type === 'phone' ? Icons.phone : Icons.mail;
        return (
          <li key={`${contact.type}-${index}`} className='flex min-w-0 items-start gap-2'>
            <Icon className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-hidden />
            <a
              href={contactHref(contact)}
              className='min-w-0 break-words underline underline-offset-4 [overflow-wrap:anywhere]'
            >
              {contact.value}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function CustomerContactsPreview({ customer }: { customer: Customer }) {
  const contacts = customerContacts(customer);
  if (!contacts.length) return <span className='text-muted-foreground'>Контактів немає</span>;
  return (
    <TableCellPopover
      label='Контакти клієнта'
      summary={
        <span className='flex min-w-0 flex-col'>
          <span className='truncate'>{primaryContact(customer)}</span>
          {contacts.length > 1 && (
            <span className='text-xs text-muted-foreground'>
              Ще контактів: {contacts.length - 1}
            </span>
          )}
        </span>
      }
    >
      <CustomerContacts customer={customer} />
    </TableCellPopover>
  );
}
