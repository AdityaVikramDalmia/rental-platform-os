"use client";

import { useMutation } from "convex/react";
import {
  Briefcase,
  ChevronDown,
  Home,
  Loader2,
  Search,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import {
  getPortalRoot,
  PERSONA_DISPLAY_CONFIG,
  USER_TYPE,
  type UserType,
} from "../../../lib/constants";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PersonaSwitcherProps = {
  userTypes: string[];
  activePersona: string;
};

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

export function PersonaSwitcher({ userTypes, activePersona }: PersonaSwitcherProps) {
  const router = useRouter();
  const setActivePersona = useMutation(api.users.setActivePersona);
  const [isSwitching, setIsSwitching] = useState(false);

  const personas = useMemo(
    () =>
      Array.from(
        new Set(userTypes.filter((userType): userType is UserType => isUserType(userType))),
      ),
    [userTypes],
  );

  if (personas.length < 2) {
    return null;
  }

  const currentPersona =
    isUserType(activePersona) && personas.includes(activePersona) ? activePersona : personas[0];
  const currentConfig = PERSONA_DISPLAY_CONFIG[currentPersona];
  const CurrentIcon = ICON_MAP[currentConfig.iconName] ?? Shield;

  const handleSwitch = async (nextPersona: string) => {
    if (!isUserType(nextPersona) || !personas.includes(nextPersona)) {
      return;
    }

    if (nextPersona === currentPersona || isSwitching) {
      return;
    }

    setIsSwitching(true);

    try {
      await setActivePersona({ persona: nextPersona });
      window.localStorage.setItem("preferred_persona", nextPersona);
      router.push(getPortalRoot(nextPersona));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to switch persona";
      toast.error(message);
      setIsSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isSwitching} className="gap-1.5">
          {isSwitching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CurrentIcon className="size-4" />
          )}
          <span>{currentConfig.label}</span>
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch Persona</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={currentPersona}
          onValueChange={(value) => {
            void handleSwitch(value);
          }}
        >
          {personas.map((persona) => {
            const config = PERSONA_DISPLAY_CONFIG[persona];
            const Icon = ICON_MAP[config.iconName] ?? Shield;

            return (
              <DropdownMenuRadioItem key={persona} value={persona} disabled={isSwitching}>
                <Icon className="size-4" />
                <span>{config.label}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
