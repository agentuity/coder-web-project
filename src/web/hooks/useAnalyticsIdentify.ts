import { useEffect, useRef } from 'react';
import { useAnalytics } from '@agentuity/react';

/**
 * Identifies the authenticated user for analytics.
 * Runs once per user session — idempotent.
 */
export function useAnalyticsIdentify(user: { name?: string; email?: string } | undefined) {
  const { identify, ready } = useAnalytics();
  const identifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !user?.email) return;
    // Don't re-identify the same user
    if (identifiedRef.current === user.email) return;

    identify(user.email, {
      ...(user.name && { name: user.name }),
      ...(user.email && { email: user.email }),
    });
    identifiedRef.current = user.email;
  }, [ready, user?.email, user?.name, identify]);
}
