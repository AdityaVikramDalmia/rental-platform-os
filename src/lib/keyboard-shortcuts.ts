export type ShortcutDefinition = {
  id: string;
  category: "Navigation" | "Actions" | "Global";
  label: string;
  chord?: [string, string];
  key?: string;
  description?: string;
};

export const CHORD_TIMEOUT_MS = 1000;

export const KEYBOARD_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "nav.dashboard",
    category: "Navigation",
    label: "Go to Dashboard",
    chord: ["g", "d"],
  },
  {
    id: "nav.guards",
    category: "Navigation",
    label: "Go to Guards",
    chord: ["g", "g"],
  },
  {
    id: "nav.leads",
    category: "Navigation",
    label: "Go to Leads",
    chord: ["g", "l"],
  },
  {
    id: "nav.societies",
    category: "Navigation",
    label: "Go to Societies",
    chord: ["g", "s"],
  },
  {
    id: "nav.visits",
    category: "Navigation",
    label: "Go to Visits",
    chord: ["g", "v"],
  },
  {
    id: "nav.payouts",
    category: "Navigation",
    label: "Go to Payouts",
    chord: ["g", "p"],
  },
  {
    id: "nav.owners",
    category: "Navigation",
    label: "Go to Owners",
    chord: ["g", "o"],
  },
  {
    id: "nav.closures",
    category: "Navigation",
    label: "Go to Closures",
    chord: ["g", "c"],
  },
  {
    id: "nav.inquiries",
    category: "Navigation",
    label: "Go to Inquiries",
    chord: ["g", "i"],
  },
  {
    id: "nav.transactions",
    category: "Navigation",
    label: "Go to Transactions",
    chord: ["g", "t"],
  },
  {
    id: "nav.analytics",
    category: "Navigation",
    label: "Go to Analytics",
    chord: ["g", "a"],
  },
  {
    id: "nav.negotiations",
    category: "Navigation",
    label: "Go to Negotiations",
    chord: ["g", "n"],
  },
  {
    id: "nav.settings",
    category: "Navigation",
    label: "Go to Settings",
    chord: ["g", "e"],
  },
  {
    id: "nav.referrals",
    category: "Navigation",
    label: "Go to Referrals",
    chord: ["g", "r"],
  },
  {
    id: "nav.audit",
    category: "Navigation",
    label: "Go to Audit",
    chord: ["g", "u"],
  },
  {
    id: "nav.checklists",
    category: "Navigation",
    label: "Go to Checklists",
    chord: ["g", "k"],
  },
  {
    id: "nav.listings",
    category: "Navigation",
    label: "Go to Listings",
    chord: ["g", "h"],
  },
  {
    id: "global.shortcutsHelp",
    category: "Global",
    label: "Open keyboard shortcuts help",
    key: "?",
  },
  {
    id: "global.search",
    category: "Global",
    label: "Focus search / open command palette",
    key: "/",
  },
  {
    id: "action.approve",
    category: "Actions",
    label: "Approve / verify selected",
    key: "a",
  },
  {
    id: "action.reject",
    category: "Actions",
    label: "Reject selected",
    key: "r",
  },
];

export function isInputFocused(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const el = document.activeElement;

  if (!(el instanceof HTMLElement)) {
    return false;
  }

  const tag = el.tagName.toLowerCase();

  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}
