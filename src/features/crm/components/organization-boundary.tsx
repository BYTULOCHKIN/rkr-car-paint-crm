'use client';

import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

/** Hide the previous shop immediately while the new server tree is loading. */
export function OrganizationBoundary({
  orgId,
  children
}: {
  orgId: string | null;
  children: ReactNode;
}): ReactElement {
  const { orgId: activeOrgId, isLoaded } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const previous = useRef(orgId);
  const matches = isLoaded && (activeOrgId ?? null) === orgId;
  useEffect(() => {
    if (isLoaded && previous.current !== (activeOrgId ?? null)) {
      previous.current = activeOrgId ?? null;
      client.clear();
      router.refresh();
    }
  }, [activeOrgId, isLoaded, client, router]);
  return matches ? (
    <>{children}</>
  ) : (
    <p role='status' className='p-4 text-sm text-muted-foreground'>
      Завантажуємо автомалярку…
    </p>
  );
}
