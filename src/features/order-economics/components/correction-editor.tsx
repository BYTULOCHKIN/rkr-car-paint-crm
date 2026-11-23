'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/features/crm/components/action-button';
import type { CrmWorkspace, RepairOrder } from '@/features/crm/api/types';
import type { FormState } from '@/features/crm/components/form-status';
import { crmQueries } from '@/features/crm/api/queries';
import { inventoryQueries } from '@/features/inventory/api/queries';
import { materialCategoryOptions, stockQuantity } from '@/features/inventory/lib/format';
import { money } from '@/features/crm/lib/format';
import type { CorrectionPreview, OrderEconomicsDetails } from '../api/types';
import { correctionSchema, type CorrectionInput } from '../schemas/finance';
import { financeMutations } from '../api/finance-queries';
import DetailedCheckForm from './detailed-check-form';
import { DialogActions } from '@/features/crm/components/dialog-form';

const planSchema = z.object({
  note: z.string().trim().min(1, 'Вкажіть причину коригування').max(1000),
  materials: z
    .array(
      z.object({
        kind: z.enum(['consume', 'reverse']),
        itemId: z.string(),
        quantity: z.string(),
        category: z.enum(['painting', 'polishing']),
        movementId: z.string()
      })
    )
    .max(20)
});
interface CorrectionEditorProps {
  order: RepairOrder;
  data: CrmWorkspace;
  onSaved: () => void;
  onCancel: () => void;
  onStateChange?: (state: FormState) => void;
}
export default function CorrectionEditor({
  order,
  data,
  onSaved,
  onCancel,
  onStateChange
}: CorrectionEditorProps) {
  const access = data.access!;
  const finance = data.finance!;
  const [expected] = useState(() => ({
    order: order.workflowRevision ?? 0,
    posting: finance.postings.filter((entry) => entry.orderId === order.id).at(-1)?.revision ?? 0
  }));
  const { data: inventory } = useSuspenseQuery(
    inventoryQueries.workspace(access.userId, access.orgId)
  );
  const [operationId] = useState(() => crypto.randomUUID());
  const [review, setReview] = useState<{
    input: CorrectionInput;
    preview: CorrectionPreview;
  } | null>(null);
  const [error, setError] = useState('');
  const client = useQueryClient();
  const prepare = useMutation(financeMutations.preview());
  const post = useMutation({
    ...financeMutations.correct(),
    onSuccess: () => {
      toast.success('Фінансове коригування проведено');
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: crmQueries.all() }),
        client.invalidateQueries({ queryKey: inventoryQueries.all() })
      ])
  });
  const pending = prepare.isPending || post.isPending;
  useEffect(() => {
    onStateChange?.({ dirty: true, pending });
    return () => onStateChange?.({ dirty: false, pending: false });
  }, [pending, onStateChange]);
  const plan = useAppForm({
    defaultValues: { note: '', materials: [] } as z.infer<typeof planSchema>,
    validators: { onSubmit: planSchema }
  });
  async function preview(details: OrderEconomicsDetails): Promise<void> {
    setError('');
    try {
      const value = planSchema.parse(plan.state.values);
      const input = correctionSchema.parse({
        orgId: access.orgId,
        orderId: order.id,
        operationId,
        expectedRevision: expected.order,
        expectedPostingRevision: expected.posting,
        // Preview uses current stock; the reviewed input retains this revision until posting.
        expectedInventoryRevision: finance.inventoryRevision,
        details,
        note: value.note,
        materials: value.materials.map((material) =>
          material.kind === 'consume'
            ? {
                kind: material.kind,
                itemId: material.itemId,
                quantity: material.quantity,
                category: material.category
              }
            : { kind: material.kind, movementId: material.movementId }
        )
      });
      const result = await prepare.mutateAsync(input);
      setReview({ input, preview: result });
    } catch (failure) {
      setError(
        failure instanceof z.ZodError
          ? failure.issues.map((issue) => issue.message).join('; ')
          : failure instanceof Error
            ? failure.message
            : 'Перевірте коригування'
      );
    }
  }
  return (
    <div className='flex min-w-0 flex-col gap-4' aria-label='Фінансове коригування'>
      <p className='text-muted-foreground text-sm'>
        Початкові нарахування та виплати збережуться. Після перегляду підтвердіть різницю.
        Матеріальні зміни проводяться разом із коригуванням.
      </p>
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset disabled={pending || !!review} className='min-w-0'>
          <FieldGroup>
            <plan.AppField name='note'>
              {(field) => <field.TextareaField label='Причина фінансового коригування' required />}
            </plan.AppField>
            <plan.Field name='materials' mode='array'>
              {(array) => (
                <FieldGroup>
                  {array.state.value.map((material, index) => (
                    <fieldset key={index} className='flex flex-col gap-2 rounded-lg border p-3'>
                      <legend>
                        {material.kind === 'consume' ? 'Додаткове списання' : 'Скасування списання'}{' '}
                        {index + 1}
                      </legend>
                      {material.kind === 'consume' ? (
                        <>
                          <plan.AppField name={`materials[${index}].itemId`}>
                            {(field) => (
                              <field.SelectField
                                label={`Матеріал ${index + 1}`}
                                required
                                options={inventory.items
                                  .filter((item) => !item.archived)
                                  .map((item) => ({
                                    value: item.id,
                                    label: `${item.name} · ${stockQuantity(item.balanceMilli)} ${item.unit}`
                                  }))}
                              />
                            )}
                          </plan.AppField>
                          <plan.AppField name={`materials[${index}].quantity`}>
                            {(field) => (
                              <field.TextField
                                label={`Кількість матеріалу ${index + 1}`}
                                inputMode='decimal'
                                required
                              />
                            )}
                          </plan.AppField>
                          <plan.AppField name={`materials[${index}].category`}>
                            {(field) => (
                              <field.SelectField
                                label={`Вид робіт матеріалу ${index + 1}`}
                                options={materialCategoryOptions}
                                required
                              />
                            )}
                          </plan.AppField>
                        </>
                      ) : (
                        <plan.AppField name={`materials[${index}].movementId`}>
                          {(field) => (
                            <field.SelectField
                              label={`Списання ${index + 1}`}
                              required
                              options={inventory.movements
                                .filter(
                                  (movement) =>
                                    movement.orderId === order.id &&
                                    movement.kind === 'consumption' &&
                                    !movement.reversed
                                )
                                .map((movement) => ({
                                  value: movement.id,
                                  label: `${movement.itemName} · ${stockQuantity(-movement.deltaMilli)} ${movement.unit} · ${movement.createdAt}`
                                }))}
                            />
                          )}
                        </plan.AppField>
                      )}
                      <Button
                        type='button'
                        variant='ghost'
                        onClick={() => array.removeValue(index)}
                      >
                        Прибрати матеріальну зміну {index + 1}
                      </Button>
                    </fieldset>
                  ))}
                  <div className='flex flex-wrap gap-2'>
                    {(['consume', 'reverse'] as const).map((kind) => (
                      <Button
                        key={kind}
                        type='button'
                        variant='outline'
                        disabled={array.state.value.length >= 20}
                        onClick={() =>
                          array.pushValue({
                            kind,
                            itemId: '',
                            quantity: '',
                            category: 'painting',
                            movementId: ''
                          })
                        }
                      >
                        {kind === 'consume'
                          ? 'Додати матеріал до коригування'
                          : 'Додати скасування списання'}
                      </Button>
                    ))}
                  </div>
                </FieldGroup>
              )}
            </plan.Field>
          </FieldGroup>
        </fieldset>
      </form>
      <div hidden={!!review} inert={!!review}>
        <DetailedCheckForm
          order={order}
          team={data.team ?? []}
          orgId={access.orgId}
          onSaved={onSaved}
          onCancel={onCancel}
          prepareCorrection={preview}
          disabled={pending || !!review}
          footerActions={!review}
        />
      </div>
      {(error || post.error) && (
        <Alert variant='destructive'>
          <AlertDescription>{error || post.error?.message}</AlertDescription>
        </Alert>
      )}
      {review && (
        <section className='flex flex-col gap-3' aria-label='Перегляд фінансового коригування'>
          <h4 className='font-semibold'>Перевірте зміни</h4>
          <p>
            Чек: {money(review.preview.before?.result.checkCents ?? order.totalCents)} →{' '}
            {money(review.preview.after.result.checkCents)}
          </p>
          <p>
            Матеріали: {money(review.preview.before?.result.materialsCents ?? 0)} →{' '}
            {money(review.preview.after.result.materialsCents)}
          </p>
          <p>
            Залишок автомалярки: {money(review.preview.before?.result.workshopRemainderCents ?? 0)}{' '}
            → {money(review.preview.after.result.workshopRemainderCents)}
          </p>
          <ul className='flex flex-col gap-2'>
            {review.preview.deltas.map((delta) => (
              <li key={`${delta.payee.kind}:${delta.payee.id}`}>
                {delta.payee.name}: {delta.amountCents > 0 ? '+' : ''}
                {money(delta.amountCents)}
              </li>
            ))}
          </ul>
          {!review.preview.deltas.length && <p>Нарахування одержувачам не зміняться.</p>}
          <p className='text-muted-foreground text-sm'>
            Записані виплати не зміняться. Можлива переплата відображатиметься окремо.
          </p>
          <DialogActions>
            <Button
              type='button'
              isLoading={post.isPending}
              onClick={() =>
                void post
                  .mutateAsync(review.input)
                  .then(onSaved)
                  .catch(() => undefined)
              }
            >
              Провести коригування
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={post.isPending}
              onClick={() => setReview(null)}
            >
              Повернутися до редагування
            </Button>
          </DialogActions>
        </section>
      )}
    </div>
  );
}
