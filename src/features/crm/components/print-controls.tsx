'use client';

import { Button } from '@/components/ui/button';

export function PrintControls() {
  return (
    <Button type='button' onClick={() => window.print()}>
      Роздрукувати / зберегти PDF
    </Button>
  );
}
