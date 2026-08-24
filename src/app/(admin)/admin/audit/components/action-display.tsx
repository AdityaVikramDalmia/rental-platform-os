const ENTITY_NAMES: Record<string, string> = {
  LEADS: "Lead",
  GUARD_PROFILES: "Guard Profile",
  GUARD_SHIFTS: "Guard Shift",
  USER_ROLE_ASSIGNMENTS: "Role Assignment",
  INCENTIVE_CARDS: "Incentive Card",
  OWNER_VERIFICATIONS: "Owner Verification",
  SYSTEM_CONFIG: "System Config",
  SOCIETIES: "Society",
  BUILDINGS: "Building",
  USERS: "User",
  LISTINGS: "Listing",
  VISITS: "Visit",
  CLOSURES: "Closure",
  PAYOUTS: "Payout",
  ROLES: "Role",
};

const OPERATIONS: Array<[string, string]> = [
  ["_INSERT", "Created"],
  ["_UPDATE", "Updated"],
  ["_DELETE", "Deleted"],
];

type ActionDisplayProps = {
  action: string;
};

export function ActionDisplay({ action }: ActionDisplayProps) {
  let entityKey = action;
  let operation = "";

  for (const [suffix, label] of OPERATIONS) {
    if (action.endsWith(suffix)) {
      entityKey = action.slice(0, -suffix.length);
      operation = label;
      break;
    }
  }

  const entityName = ENTITY_NAMES[entityKey] ?? entityKey;

  return (
    <span className="text-sm text-slate-700">
      {entityName} {operation}
    </span>
  );
}
