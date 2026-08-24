"use client";

import { useMutation, useQuery } from "convex/react";
import { Briefcase, Home, Loader2, Search, Settings, Shield, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import {
  getPortalRoot,
  PERSONA_DISPLAY_CONFIG,
  USER_TYPE,
  type UserType,
} from "../../../../lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  Shield,
  Settings,
  Briefcase,
  Home,
  Search,
};

function isUserType(value: string): value is UserType {
  return Object.values(USER_TYPE).includes(value as UserType);
}

export default function PersonaPickerPage() {
  const router = useRouter();
  const setActivePersona = useMutation(api.users.setActivePersona);
  const user = useQuery(api.users.getCurrentUser);
  const multiPersonaEnabled = useQuery(api.users.isMultiPersonaEnabled);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const autoRedirectAttemptedRef = useRef(false);

  const personas = useMemo(() => {
    if (!user) {
      return [] as UserType[];
    }

    const rawPersonas = user.user_types ?? [user.user_type];
    return rawPersonas.filter((persona): persona is UserType => isUserType(persona));
  }, [user]);

  const activePersona = useMemo(() => {
    if (!user) {
      return null;
    }

    const currentPersona = user.active_persona ?? user.user_type;
    return isUserType(currentPersona) ? currentPersona : null;
  }, [user]);

  const handleSelectPersona = useCallback(
    async (persona: UserType, persistPreference: boolean) => {
      if (isSwitching) {
        return;
      }

      setIsSwitching(true);

      try {
        await setActivePersona({ persona });

        if (persistPreference) {
          window.localStorage.setItem("preferred_persona", persona);
        } else {
          window.localStorage.removeItem("preferred_persona");
        }

        router.push(getPortalRoot(persona));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to switch persona";
        toast.error(message);
        setIsSwitching(false);
      }
    },
    [isSwitching, router, setActivePersona],
  );

  useEffect(() => {
    if (user === null) {
      router.replace("/admin/login");
      return;
    }

    if (
      !user ||
      multiPersonaEnabled === undefined ||
      isSwitching ||
      autoRedirectAttemptedRef.current
    ) {
      return;
    }

    if (!multiPersonaEnabled) {
      autoRedirectAttemptedRef.current = true;
      const fallbackPersona = activePersona ?? (isUserType(user.user_type) ? user.user_type : null);

      if (!fallbackPersona) {
        router.replace("/admin/login");
        return;
      }

      router.replace(getPortalRoot(fallbackPersona));
      return;
    }

    if (personas.length === 1) {
      autoRedirectAttemptedRef.current = true;
      router.replace(getPortalRoot(personas[0]));
      return;
    }

    const preferredPersona = window.localStorage.getItem("preferred_persona");

    if (preferredPersona && isUserType(preferredPersona) && personas.includes(preferredPersona)) {
      autoRedirectAttemptedRef.current = true;
      // Auto-redirect side effect once the user/persona queries have resolved; the
      // setIsSwitching(true) inside handleSelectPersona runs synchronously as part of
      // this legitimate mount/data-ready reaction, not a per-render state sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void handleSelectPersona(preferredPersona, true);
    }
  }, [
    activePersona,
    handleSelectPersona,
    isSwitching,
    multiPersonaEnabled,
    personas,
    router,
    user,
  ]);

  if (
    user === undefined ||
    user === null ||
    multiPersonaEnabled === undefined ||
    !multiPersonaEnabled ||
    personas.length <= 1
  ) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 via-white to-amber-50 p-4 sm:p-6">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col justify-center gap-6 sm:min-h-[calc(100dvh-3rem)]">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Choose your persona
          </h1>
          <p className="text-sm text-slate-600 sm:text-base">
            Select where you want to continue for this session.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => {
            const config = PERSONA_DISPLAY_CONFIG[persona];
            const Icon = ICON_MAP[config.iconName] ?? Shield;
            const isActive = activePersona === persona;

            return (
              <Card
                key={persona}
                role="button"
                tabIndex={0}
                onClick={() => void handleSelectPersona(persona, rememberChoice)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void handleSelectPersona(persona, rememberChoice);
                  }
                }}
                className={cn(
                  "cursor-pointer border-slate-200 transition hover:border-amber-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-amber-400",
                  isActive && "border-amber-500 bg-amber-50/40 shadow-sm",
                  isSwitching && "pointer-events-none opacity-70",
                )}
              >
                <CardHeader>
                  <div className="mb-2 inline-flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle>{config.label}</CardTitle>
                  <CardDescription>{config.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={isSwitching}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleSelectPersona(persona, rememberChoice);
                    }}
                  >
                    {isSwitching ? <Loader2 className="size-4 animate-spin" /> : null}
                    Continue as {config.label}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <Checkbox
            id="remember-persona"
            checked={rememberChoice}
            disabled={isSwitching}
            onCheckedChange={(checked) => setRememberChoice(checked === true)}
          />
          <label htmlFor="remember-persona" className="text-sm font-medium text-slate-700">
            Remember my choice
          </label>
        </div>
      </div>
    </div>
  );
}
