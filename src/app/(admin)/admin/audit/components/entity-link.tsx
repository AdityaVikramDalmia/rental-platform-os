import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const ENTITY_LABELS: Record<string, string> = {
  users: "User",
  guard_profiles: "Guard Profile",
  guard_shifts: "Guard Shift",
  leads: "Lead",
  owner_verifications: "Verification",
  listings: "Listing",
  visits: "Visit",
  closures: "Closure",
  payouts: "Payout",
  incentive_cards: "Incentive",
  roles: "Role",
  user_role_assignments: "Role Assignment",
  system_config: "Config",
  societies: "Society",
  buildings: "Building",
};

const ROUTE_MAP: Record<string, (id: string) => string> = {
  societies: (id) => `/admin/societies/${id}`,
  buildings: () => `/admin/societies`,
  users: (id) => `/admin/guards/${id}`,
  guard_profiles: (id) => `/admin/guards/${id}`,
  leads: (id) => `/admin/leads?entity_id=${id}`,
  listings: (id) => `/admin/listings/${id}`,
  visits: (id) => `/admin/visits?entity_id=${id}`,
  closures: (id) => `/admin/closures/${id}`,
  payouts: (id) => `/admin/payouts/${id}`,
  incentive_cards: (id) => `/admin/incentives?entity_id=${id}`,
  roles: () => `/admin/roles`,
  user_role_assignments: () => `/admin/roles`,
  system_config: () => `/admin/settings`,
  owner_verifications: (id) => `/admin/leads?entity_id=${id}`,
  guard_shifts: () => `/admin/guards`,
};

type EntityLinkProps = {
  entityType: string;
  entityId: string;
};

export function EntityLink({ entityType, entityId }: EntityLinkProps) {
  const label = ENTITY_LABELS[entityType] ?? entityType;
  const truncatedId = entityId.length > 8 ? `${entityId.slice(0, 8)}\u2026` : entityId;
  const routeBuilder = ROUTE_MAP[entityType];

  if (!routeBuilder) {
    return (
      <span className="text-sm text-slate-500">
        {label} {truncatedId}
      </span>
    );
  }

  const href = routeBuilder(entityId);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            className="text-sm text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {label} {truncatedId}
          </Link>
        </TooltipTrigger>
        <TooltipContent>{entityId}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
