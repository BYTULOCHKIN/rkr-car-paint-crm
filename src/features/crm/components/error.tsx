'use client';

import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { Button } from './action-button';

interface CrmErrorViewProps {
  reset: () => void;
}

export function CrmErrorView({ reset }: CrmErrorViewProps) {
  const query = useQueryErrorResetBoundary();
  return (
    <div role='alert' className='flex flex-col items-start gap-4 p-6'>
      <p>Не вдалося завантажити CRM. Спробуйте ще раз.</p>
      <Button
        onClick={() => {
          query.reset();
          reset();
        }}
      >
        Повторити
      </Button>
    </div>
  );
}
