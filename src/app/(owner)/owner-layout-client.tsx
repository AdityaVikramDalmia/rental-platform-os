"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { USER_STATUS, USER_TYPE } from "../../../lib/constants";
import { PortalShell } from "@/components/layout/PortalShell";
import { PersonaSwitcher } from "@/components/shared/PersonaSwitcher";

export function OwnerLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useQuery(api.users.getCurrentUser);
  const multiPersonaEnabled = useQuery(api.users.isMultiPersonaEnabled);
  const hasOwnerPersona =
    currentUser?.user_types?.includes(USER_TYPE.OWNER) ??
    currentUser?.user_type === USER_TYPE.OWNER;
  const hasGuardPersona =
    currentUser?.user_types?.includes(USER_TYPE.GUARD) ??
    currentUser?.user_type === USER_TYPE.GUARD;
  const hasBackofficePersona =
    (currentUser?.user_types?.some(
      (persona) => persona === USER_TYPE.ADMIN || persona === USER_TYPE.OPS,
    ) ??
      currentUser?.user_type === USER_TYPE.ADMIN) ||
    currentUser?.user_type === USER_TYPE.OPS;
  const isLoading = currentUser === undefined;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!currentUser) {
      router.replace("/admin/login");
      return;
    }

    if (!hasOwnerPersona) {
      if (hasGuardPersona) {
        router.replace("/guard/dashboard");
        return;
      }

      if (hasBackofficePersona) {
        router.replace("/admin/dashboard");
        return;
      }

      router.replace("/homepage");
    }
  }, [currentUser, hasBackofficePersona, hasGuardPersona, hasOwnerPersona, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !hasOwnerPersona) {
    return null;
  }

  if (currentUser.status !== USER_STATUS.ACTIVE) {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="mx-auto w-full max-w-md px-4 py-6">
          <div className="rounded-xl border border-stone-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-stone-900">Access denied</h2>
            <p className="mt-2 text-sm text-stone-600">
              Your owner account is not active. Please contact support for help.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PortalShell
      portalId="owner"
      portalLabel="Owner Portal"
      brandLabel="Rental Platform OS"
      userName={currentUser.name}
      headerRightSlot={
        multiPersonaEnabled ? (
          <PersonaSwitcher
            userTypes={currentUser.user_types ?? [currentUser.user_type]}
            activePersona={currentUser.active_persona ?? currentUser.user_type}
          />
        ) : null
      }
      pathname={pathname}
      accentClassName="text-indigo-700"
      navActiveClassName="bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white"
    >
      {children}
    </PortalShell>
  );
}
