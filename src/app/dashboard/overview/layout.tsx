import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';

export default async function OverviewLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return children;
}
