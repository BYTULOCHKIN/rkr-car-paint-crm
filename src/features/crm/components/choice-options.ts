import type { ChoiceOption } from '@/components/forms/fields/choice-options';
import type { Customer } from '../api/types';

export function customerChoices(customers: Customer[]): ChoiceOption[] {
  return customers.map((customer) => ({
    value: customer.id,
    label: customer.name,
    description: customer.phone
  }));
}
