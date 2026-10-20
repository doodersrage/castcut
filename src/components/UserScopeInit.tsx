'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { reloadGalleryForActiveUser } from '@/lib/gallery/db-store';
import { USER_SCOPE_CHANGED_EVENT } from '@/lib/user-scope';
import { scheduleUserAnalyticsSync } from '@/lib/user-analytics-sync';

export default function UserScopeInit() {
  const auth = useAuth();
  const { user, loading } = auth ?? { user: null, loading: true };

  useEffect(() => {
    if (loading) {
      return;
    }

    void reloadGalleryForActiveUser();
    scheduleUserAnalyticsSync();
  }, [loading, user?.id]);

  useEffect(() => {
    const onScopeSync = () => {
      void reloadGalleryForActiveUser();
    };
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScopeSync);
    return () => window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScopeSync);
  }, []);

  return null;
}
