import { Metadata } from 'next';
import SignUpViewPage from '@/features/auth/components/sign-up-view';

export const metadata: Metadata = {
  title: 'Реєстрація',
  description: 'Створіть акаунт PaintAuto та керуйте клієнтами, замовленнями й складом автомалярки.'
};

export default function Page() {
  return <SignUpViewPage />;
}
