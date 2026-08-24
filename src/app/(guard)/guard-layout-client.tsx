"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Component, type ReactNode, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { Banknote, Calendar, FileText, Gift, Home, Loader2, Plus, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "../../../convex/_generated/api";
import {
  isFieldWorkerUserType,
  LANGUAGE_PREFERENCE,
  USER_TYPE,
  VISIT_STATUS,
  type LanguagePreference,
} from "../../../lib/constants";
import { getFieldWorkerNavItems, type FieldWorkerNavIcon } from "@/config/navigation";
import { GuardOnboarding } from "@/components/guard/GuardOnboarding";
import { PersonaSwitcher } from "@/components/shared/PersonaSwitcher";
import { RuleBanner } from "@/components/shared/rule-banner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GuardNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function resolveNavIcon(icon: FieldWorkerNavIcon): React.ComponentType<{ className?: string }> {
  switch (icon) {
    case "home":
      return Home;
    case "submitLead":
      return Plus;
    case "leads":
      return FileText;
    case "visits":
      return Calendar;
    case "bounties":
      return Gift;
    case "earnings":
      return Banknote;
    default:
      return Home;
  }
}

type FieldWorkerErrorBoundaryProps = {
  children: ReactNode;
  pathname: string;
  isOpsUser: boolean;
};

type FieldWorkerErrorBoundaryState = {
  errorMessage: string | null;
};

class FieldWorkerErrorBoundary extends Component<
  FieldWorkerErrorBoundaryProps,
  FieldWorkerErrorBoundaryState
> {
  state: FieldWorkerErrorBoundaryState = {
    errorMessage: null,
  };

  static getDerivedStateFromError(error: unknown): FieldWorkerErrorBoundaryState {
    return {
      errorMessage: error instanceof Error ? error.message : "Unexpected error",
    };
  }

  componentDidUpdate(prevProps: FieldWorkerErrorBoundaryProps): void {
    if (prevProps.pathname !== this.props.pathname && this.state.errorMessage) {
      this.setState({ errorMessage: null });
    }
  }

  render() {
    if (!this.state.errorMessage) {
      return this.props.children;
    }

    const isFieldWorkerAccessError =
      this.state.errorMessage.includes("Feature not enabled") ||
      this.state.errorMessage.includes("Not authorized as field worker");

    if (this.props.isOpsUser && isFieldWorkerAccessError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
            <h2 className="text-base font-semibold text-amber-900">
              Field-worker access not enabled
            </h2>
            <p className="mt-2 text-sm text-amber-800">
              Your OPS account is not in the active rollout yet.
            </p>
            <Button
              asChild
              className="mt-4 h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold"
            >
              <Link href="/guard/unauthorized">Open access details</Link>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-center">
          <h2 className="text-base font-semibold text-slate-900">Unable to load this page</h2>
          <p className="mt-2 text-sm text-slate-600">Please try again from the dashboard.</p>
          <Button asChild className="mt-4 h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold">
            <Link href="/guard/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }
}

function isLanguagePreference(value: string): value is LanguagePreference {
  return Object.values(LANGUAGE_PREFERENCE).includes(value as LanguagePreference);
}

function getLocaleFromCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookieValue = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("locale="));

  if (!cookieValue) {
    return null;
  }

  return decodeURIComponent(cookieValue.slice("locale=".length));
}

function persistLocale(locale: LanguagePreference): void {
  if (typeof window === "undefined") {
    return;
  }

  document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  window.localStorage.setItem("locale", locale);
}

function resolveLocale(locale: string | undefined): LanguagePreference {
  const value = locale ?? LANGUAGE_PREFERENCE.en;
  return isLanguagePreference(value) ? value : LANGUAGE_PREFERENCE.en;
}

export function GuardLayoutInner({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useQuery(api.users.getCurrentUser);
  // P44-CONFLICT-RISK: Field-worker access checks are shared with P44 rollout logic.
  const hasFieldWorkerPersona =
    currentUser?.user_types?.some((persona) => isFieldWorkerUserType(persona)) ??
    isFieldWorkerUserType(currentUser?.user_type);
  const isGuardUser =
    currentUser?.user_types?.includes(USER_TYPE.GUARD) ??
    currentUser?.user_type === USER_TYPE.GUARD;
  const isOpsUser =
    currentUser?.user_types?.includes(USER_TYPE.OPS) ?? currentUser?.user_type === USER_TYPE.OPS;
  const isActive = currentUser?.status === "ACTIVE";
  const todayVisits = useQuery(
    api.visits.getMyTodayVisits,
    isGuardUser && isActive ? undefined : "skip",
  );
  const recordFingerprint = useMutation(api.guards.recordFingerprint);
  const isLoading = currentUser === undefined;

  const visitBadgeCount = todayVisits
    ? todayVisits.filter(
        (v) =>
          v.status !== VISIT_STATUS.COMPLETED &&
          v.status !== VISIT_STATUS.CANCELLED &&
          v.status !== VISIT_STATUS.NO_SHOW,
      ).length
    : 0;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!currentUser || !hasFieldWorkerPersona) {
      router.replace("/guard/login");
      return;
    }

    if (currentUser.status === "BANNED") {
      router.replace("/guard/login?error=banned");
      return;
    }

    if (currentUser.must_change_password && pathname !== "/guard/change-password") {
      router.replace("/guard/change-password");
    }
  }, [currentUser, hasFieldWorkerPersona, isLoading, pathname, router]);

  useEffect(() => {
    if (isLoading || !currentUser || !isGuardUser) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const sessionKey = `guard-fingerprint-recorded:${currentUser._id}`;

    if (window.sessionStorage.getItem(sessionKey) === "1") {
      return;
    }

    const screenSize = `${window.screen.width}x${window.screen.height}`;
    const fingerprint = `${window.navigator.userAgent}|${screenSize}`;
    const deviceLabel = `${window.navigator.platform || "Unknown"}|${screenSize}`;

    window.sessionStorage.setItem(sessionKey, "1");

    void recordFingerprint({
      fingerprint,
      device_label: deviceLabel,
    }).catch(() => {
      window.sessionStorage.removeItem(sessionKey);
    });
  }, [currentUser, isGuardUser, isLoading, recordFingerprint]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !hasFieldWorkerPersona) {
    return null;
  }

  if (currentUser.status === "BANNED") {
    return null;
  }

  if (currentUser.must_change_password && pathname !== "/guard/change-password") {
    return null;
  }

  return (
    <FieldWorkerErrorBoundary pathname={pathname} isOpsUser={isOpsUser}>
      <GuardLayoutShell
        currentUser={currentUser}
        pathname={pathname}
        visitBadgeCount={visitBadgeCount}
      >
        {children}
      </GuardLayoutShell>
    </FieldWorkerErrorBoundary>
  );
}

type GuardLayoutShellProps = {
  currentUser: {
    user_type: string;
    user_types?: string[];
    active_persona?: string;
  };
  pathname: string;
  visitBadgeCount: number;
  children: ReactNode;
};

function GuardLayoutShell({
  currentUser,
  pathname,
  visitBadgeCount,
  children,
}: GuardLayoutShellProps) {
  const t = useTranslations("guard");
  const router = useRouter();
  const hasFieldWorkerPersona =
    currentUser.user_types?.some((persona) => isFieldWorkerUserType(persona)) ??
    isFieldWorkerUserType(currentUser.user_type);
  const activePersona = currentUser.active_persona ?? currentUser.user_type;
  const fieldWorkerPersona = isFieldWorkerUserType(activePersona)
    ? activePersona
    : (currentUser.user_types?.find((persona) => isFieldWorkerUserType(persona)) ??
      currentUser.user_type);
  const guardProfile = useQuery(api.guards.getMyProfile, hasFieldWorkerPersona ? {} : "skip");
  const multiPersonaEnabled = useQuery(api.users.isMultiPersonaEnabled);

  useEffect(() => {
    if (typeof window === "undefined" || !guardProfile) {
      return;
    }

    const serverLocale = resolveLocale(guardProfile.language_preference);
    const cookieLocaleValue = getLocaleFromCookie();
    const cookieLocale = isLanguagePreference(cookieLocaleValue ?? "") ? cookieLocaleValue : null;
    const localStorageLocaleValue = window.localStorage.getItem("locale");
    const localStorageLocale = isLanguagePreference(localStorageLocaleValue ?? "")
      ? localStorageLocaleValue
      : null;

    const cookieChanged = cookieLocale !== serverLocale;
    const localStorageChanged = localStorageLocale !== serverLocale;

    if (!cookieChanged && !localStorageChanged) {
      return;
    }

    persistLocale(serverLocale);

    if (cookieChanged) {
      router.refresh();
    }
  }, [guardProfile, router]);

  const guardLocale = resolveLocale(guardProfile?.language_preference);
  const visibleNavItems: GuardNavItem[] = getFieldWorkerNavItems(fieldWorkerPersona).map(
    (item) => ({
      href: item.href,
      label: item.label ?? (item.labelKey ? t(item.labelKey) : item.href),
      icon: resolveNavIcon(item.icon),
    }),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Rental Platform OS
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {activePersona === USER_TYPE.OPS ? "Field Portal" : "Guard Portal"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {multiPersonaEnabled && (
              <PersonaSwitcher
                userTypes={currentUser.user_types ?? [currentUser.user_type]}
                activePersona={currentUser.active_persona ?? currentUser.user_type}
              />
            )}
            <Link
              href="/guard/profile"
              className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
            >
              <User className="size-4" />
              <span>Profile</span>
            </Link>
          </div>
        </div>
      </header>

      <RuleBanner language={guardLocale} />

      <main className="mx-auto w-full max-w-md px-4 py-4 pb-28 text-base">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-2 pb-safe backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-6 gap-1 py-2">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Button
                key={item.href}
                asChild
                variant="ghost"
                className={cn(
                  "h-14 min-h-11 min-w-11 flex-col gap-1 rounded-xl px-1 py-2 text-base",
                  isActive
                    ? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Link href={item.href}>
                  <div className="relative">
                    <Icon className="size-4" />
                    {item.href === "/guard/visits" && visitBadgeCount > 0 && (
                      <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[10px] font-bold leading-none text-white">
                        {visitBadgeCount > 9 ? "9+" : visitBadgeCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-medium leading-none">{item.label}</span>
                </Link>
              </Button>
            );
          })}
        </div>
      </nav>
      {(currentUser.user_types?.includes(USER_TYPE.GUARD) ??
        currentUser.user_type === USER_TYPE.GUARD) &&
        guardProfile &&
        !guardProfile.has_seen_onboarding && <GuardOnboarding />}
    </div>
  );
}
