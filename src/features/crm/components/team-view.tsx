'use client';

import { OrganizationProfile } from '@clerk/nextjs';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { crmQueries } from '../api/queries';

interface TeamViewProps {
  userId: string;
  orgId: string;
}
export function TeamView({ userId, orgId }: TeamViewProps) {
  const { data } = useSuspenseQuery(crmQueries.team(userId, orgId));
  const admin = data.access.role === 'admin';
  return (
    <div className='flex min-w-0 flex-col gap-5'>
      <Alert>
        <AlertDescription>
          Адміністратор керує командою, замовленнями, цінами та призначеннями. Виконавець бачить усі
          замовлення автомалярки й може лише просувати їхні статуси вперед. Ціни доступні виконавцю
          лише для читання.
        </AlertDescription>
      </Alert>
      <section className='min-w-0 rounded-xl border p-4'>
        <h2 className='mb-3 text-base font-semibold'>Активні учасники</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Учасник</TableHead>
              <TableHead>Роль у CRM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.team.map((member) => (
              <TableRow key={member.id}>
                <TableCell className='whitespace-normal [overflow-wrap:anywhere]'>
                  <p className='font-medium'>{member.name}</p>
                  <p className='text-xs text-muted-foreground'>{member.identifier}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                    {member.role === 'admin' ? 'Адміністратор' : 'Виконавець'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      {admin ? (
        <section className='min-w-0'>
          <h2 className='mb-2 text-base font-semibold'>Запрошення та керування</h2>
          <p className='mb-4 text-sm text-muted-foreground'>
            У Clerk роль Admin відповідає адміністратору, Member — виконавцю. Запрошена людина
            з’явиться серед доступних виконавців після приєднання до автомалярки.
          </p>
          <OrganizationProfile routing='hash' />
        </section>
      ) : (
        <p className='text-sm text-muted-foreground'>
          Запрошувати учасників і змінювати ролі може адміністратор.
        </p>
      )}
    </div>
  );
}
