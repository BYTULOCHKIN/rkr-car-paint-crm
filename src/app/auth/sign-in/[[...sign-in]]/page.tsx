import { Metadata } from 'next';
import SignInViewPage from '@/features/auth/components/sign-in-view';

export const metadata: Metadata = {
  title: 'Вхід',
  description: 'Увійдіть у PaintAuto — CRM для керування роботою автомалярки.'
};

export default async function Page() {
  return <SignInViewPage />;
}
