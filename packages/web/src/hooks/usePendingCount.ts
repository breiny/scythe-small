import { useState, useEffect } from 'react';
import { useAuth } from '@web/lib/AuthContext';
import { getPendingCount } from '@web/lib/apiClient';

export function usePendingCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    getPendingCount()
      .then((r) => setCount(r.count))
      .catch(() => {});
  }, [user]);

  return count;
}
