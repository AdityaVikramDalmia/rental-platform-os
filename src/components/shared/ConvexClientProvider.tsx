"use client";

import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { ReferralAttributionCapture } from "@/components/shared/ReferralAttributionCapture";
import { refreshLocalAuthSession } from "@/actions/local-auth";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const localAuthClientEnabled =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_LOCAL_AUTH === "true";

function useAuthFromAuthKit() {
  const { user, loading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!localAuthClientEnabled || !user) {
      return;
    }

    const refreshLocalSession = async () => {
      accessTokenRef.current = await refreshLocalAuthSession();
    };

    void refreshLocalSession();
    const interval = window.setInterval(() => void refreshLocalSession(), 20 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [user]);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        if (localAuthClientEnabled) {
          accessTokenRef.current = await refreshLocalAuthSession();
        } else if (forceRefreshToken) {
          const refreshResult = await refresh();
          accessTokenRef.current = refreshResult ?? null;
        } else {
          accessTokenRef.current = (await getAccessToken()) ?? null;
        }
      } catch {
        accessTokenRef.current = accessTokenRef.current ?? null;
      }
      return accessTokenRef.current;
    },
    [getAccessToken, refresh],
  );

  return useMemo(
    () => ({
      isLoading: loading,
      isAuthenticated: !!user,
      fetchAccessToken,
    }),
    [loading, user, fetchAccessToken],
  );
}

type InitialAuth = Omit<
  Awaited<ReturnType<typeof import("@workos-inc/authkit-nextjs").withAuth>>,
  "accessToken"
>;

export function ConvexClientProvider({
  children,
  initialAuth,
}: {
  children: ReactNode;
  initialAuth?: InitialAuth;
}) {
  return (
    <AuthKitProvider initialAuth={initialAuth}>
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
        <ReferralAttributionCapture />
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}

export default ConvexClientProvider;
