import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getOrderDocument } from '@/features/crm/api/service';
import { OrderDocument } from '@/features/crm/components/order-document';
import { PrintControls } from '@/features/crm/components/print-controls';

export const metadata: Metadata = {
  title: 'Друк замовлення · Автомалярка',
  robots: { index: false, follow: false }
};

export default async function OrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await auth.protect();
  const { id } = await params;
  const document = await getOrderDocument(id);
  if (!document) notFound();
  return (
    <main className='min-h-svh bg-muted py-6 print:bg-white print:py-0'>
      <div className='mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 print:hidden'>
        <p className='text-muted-foreground text-sm'>
          Збережене замовлення №{document.order.number}
        </p>
        <PrintControls />
      </div>
      <OrderDocument document={document} />
    </main>
  );
}
