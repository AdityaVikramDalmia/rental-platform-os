/**
 * Dev-login demo account catalog.
 *
 * Server-only. Passwords must never reach a client bundle: `/_next/static/**`
 * is publicly served even though `/dev/login` 404s in production.
 * Import only from server components or `"use server"` modules — the client
 * gets `DevAccountSummary` (no email, no password) via props.
 * Enforced by the client-chunk scan in `scripts/release-check.mjs`.
 */

export type DevAccountIcon = "admin" | "agent" | "guard" | "ops" | "owner" | "tenant";

export type DevAccountSummary = {
  id: string;
  label: string;
  description: string;
  icon: DevAccountIcon;
};

type DevAccount = DevAccountSummary & {
  email: string;
  password: string;
};

const DEV_ACCOUNTS: readonly DevAccount[] = [
  {
    id: "admin",
    label: "Test Admin",
    description: "Super Admin access",
    icon: "admin",
    email: "admin@example.com",
    password: "DevAdmin123!",
  },
  {
    id: "guard",
    label: "Test Guard",
    description: "Guard portal access",
    icon: "guard",
    email: "9999999999@guards.local",
    password: "DevGuard123!",
  },
  {
    id: "ops",
    label: "Test OPS",
    description: "Field ops portal",
    icon: "ops",
    email: "8888888888@ops.local",
    password: "DevOps123!",
  },
  {
    id: "tenant",
    label: "Test Tenant",
    description: "Tenant browse & inquiries",
    icon: "tenant",
    email: "tenant1@test.demorentals.com",
    password: "DevTenant123!",
  },
  {
    id: "owner",
    label: "Test Owner",
    description: "Property owner access",
    icon: "owner",
    email: "owner1@test.demorentals.com",
    password: "DevOwner123!",
  },
  {
    id: "agent-bot",
    label: "Agent Bot",
    description: "Automated admin",
    icon: "agent",
    email: "agent@example.com",
    password: "DevAgent123!",
  },
  {
    id: "guard-2",
    label: "Guard 2",
    description: "Rajesh Kumar",
    icon: "guard",
    email: "9876543210@guards.local",
    password: "DevGuard123!",
  },
  {
    id: "guard-3",
    label: "Guard 3",
    description: "Suresh Patel",
    icon: "guard",
    email: "9765432109@guards.local",
    password: "DevGuard123!",
  },
  {
    id: "ops-2",
    label: "OPS 2",
    description: "Priya Sharma",
    icon: "ops",
    email: "7777777777@ops.local",
    password: "DevOps123!",
  },
  {
    id: "tenant-2",
    label: "Tenant 2",
    description: "Sneha Reddy",
    icon: "tenant",
    email: "tenant2@test.demorentals.com",
    password: "DevTenant123!",
  },
  {
    id: "owner-2",
    label: "Owner 2",
    description: "Kavita Joshi",
    icon: "owner",
    email: "owner2@test.demorentals.com",
    password: "DevOwner123!",
  },
];

const QUICK_ACCESS_COUNT = 5;

function toSummary(account: DevAccount): DevAccountSummary {
  return {
    id: account.id,
    label: account.label,
    description: account.description,
    icon: account.icon,
  };
}

export function getQuickAccessAccountSummaries(): DevAccountSummary[] {
  return DEV_ACCOUNTS.slice(0, QUICK_ACCESS_COUNT).map(toSummary);
}

export function getMoreAccountSummaries(): DevAccountSummary[] {
  return DEV_ACCOUNTS.slice(QUICK_ACCESS_COUNT).map(toSummary);
}

export function resolveDevAccount(id: string): DevAccount | undefined {
  return DEV_ACCOUNTS.find((account) => account.id === id);
}
