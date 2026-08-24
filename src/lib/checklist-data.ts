export const RENTAL_CHECKLIST_CATEGORIES = [
  "Before Visiting",
  "During Visit",
  "Before Agreement",
  "Before Move-in",
  "After Move-in",
] as const;

export type RentalChecklistCategory = (typeof RENTAL_CHECKLIST_CATEGORIES)[number];

export type RentalChecklistItem = {
  id: string;
  label: string;
  category: RentalChecklistCategory;
};

export const RENTAL_CHECKLIST_ITEMS: RentalChecklistItem[] = [
  {
    id: "before-visiting-budget",
    label: "Set your monthly rent budget",
    category: "Before Visiting",
  },
  {
    id: "before-visiting-needs",
    label: "List non-negotiable requirements",
    category: "Before Visiting",
  },
  { id: "before-visiting-area", label: "Research nearby essentials", category: "Before Visiting" },
  {
    id: "before-visiting-docs",
    label: "Keep ID and income documents ready",
    category: "Before Visiting",
  },

  {
    id: "during-visit-water",
    label: "Check water pressure and supply timing",
    category: "During Visit",
  },
  {
    id: "during-visit-electricity",
    label: "Inspect meter setup and power backup",
    category: "During Visit",
  },
  {
    id: "during-visit-network",
    label: "Test mobile and internet signal",
    category: "During Visit",
  },
  {
    id: "during-visit-noise",
    label: "Assess neighborhood noise at peak times",
    category: "During Visit",
  },

  {
    id: "before-agreement-owner",
    label: "Verify owner identity and ownership proof",
    category: "Before Agreement",
  },
  {
    id: "before-agreement-clauses",
    label: "Review lock-in, notice, and penalty clauses",
    category: "Before Agreement",
  },
  {
    id: "before-agreement-deposit",
    label: "Confirm deposit amount and refund timeline",
    category: "Before Agreement",
  },
  {
    id: "before-agreement-brokerage",
    label: "Clarify brokerage and all one-time charges",
    category: "Before Agreement",
  },

  {
    id: "before-movein-readings",
    label: "Record electricity and water meter readings",
    category: "Before Move-in",
  },
  {
    id: "before-movein-keys",
    label: "Collect all keys and access cards",
    category: "Before Move-in",
  },
  {
    id: "before-movein-inventory",
    label: "Photograph fixtures and furniture condition",
    category: "Before Move-in",
  },
  {
    id: "before-movein-utilities",
    label: "Confirm utility account transfer process",
    category: "Before Move-in",
  },

  {
    id: "after-movein-address",
    label: "Update address on bank and delivery apps",
    category: "After Move-in",
  },
  {
    id: "after-movein-society",
    label: "Complete society tenant registration",
    category: "After Move-in",
  },
  {
    id: "after-movein-emergency",
    label: "Save owner and maintenance emergency contacts",
    category: "After Move-in",
  },
  {
    id: "after-movein-maintenance",
    label: "Track recurring rent and maintenance due dates",
    category: "After Move-in",
  },
];
