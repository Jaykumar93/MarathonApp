import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getUnreadNotificationCount } from "../data/notifications";

interface NotificationsContextValue {
  unreadCount: number;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

/**
 * Just the unread count, kept as light as AuthContext's own hasActiveGoal
 * pattern - the actual list is fetched fresh by app/notifications.tsx
 * itself. refresh() is exposed so both the place that can create new
 * notifications (usePlanData, right after markPastPendingAsMissed) and the
 * place that clears them (the notifications screen, after marking read)
 * can update the bell's badge without a polling loop.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!session?.user?.id) {
      setUnreadCount(0);
      return;
    }
    const count = await getUnreadNotificationCount(session.user.id);
    setUnreadCount(count);
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id && profile?.status === "approved") {
      refresh().catch(() => {});
    } else {
      setUnreadCount(0);
    }
  }, [session?.user?.id, profile?.status, refresh]);

  return <NotificationsContext.Provider value={{ unreadCount, refresh }}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
