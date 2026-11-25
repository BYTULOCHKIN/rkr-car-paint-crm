'use client';

import { useEffect, useState } from 'react';
import { businessToday } from '@/features/crm/lib/workflow';

export function useBusinessToday(initialToday: string): string {
  const [today, setToday] = useState(initialToday);
  useEffect(() => {
    const refreshDate = () => setToday(businessToday());
    refreshDate();
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener('focus', refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshDate);
    };
  }, []);
  return today;
}
