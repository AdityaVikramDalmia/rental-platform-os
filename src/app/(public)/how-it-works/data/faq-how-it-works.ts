export type FaqItem = {
  question: string;
  answer: string;
  category: string;
};

export const faqData: FaqItem[] = [
  {
    question: "What makes DemoRentals listings different from regular classified apps?",
    answer:
      "Every listing goes through verification checks for ownership, availability, and pricing details before it is shown. This reduces fake or stale ads and saves tenants from unnecessary calls.",
    category: "General",
  },
  {
    question: "Which cities does DemoRentals currently operate in?",
    answer:
      "We currently focus on major metro rental markets and continue expanding locality by locality. If your area is not covered yet, contact support and we can notify you once inventory opens there.",
    category: "General",
  },
  {
    question: "Do I need to pay to browse listings?",
    answer:
      "No. Browsing listings is free. You can explore photos, rent details, and locality information without any subscription charges.",
    category: "General",
  },
  {
    question: "Are rent and deposit amounts final or negotiable?",
    answer:
      "Many owners keep room for negotiation based on profile strength and lease duration. DemoRentals shows listed pricing transparently and helps communicate reasonable offers during the final stage.",
    category: "Pricing",
  },
  {
    question: "What charges should I plan besides monthly rent?",
    answer:
      "Typically include security deposit, brokerage if applicable, society maintenance, utility setup, and moving costs. We help you get a complete cost breakdown before finalizing.",
    category: "Pricing",
  },
  {
    question: "How is brokerage handled on DemoRentals?",
    answer:
      "Brokerage terms are disclosed upfront on each listing. If brokerage applies, amount and payment timing are clarified before agreement signing to avoid surprises.",
    category: "Pricing",
  },
  {
    question: "Can I filter homes by budget and furnished status?",
    answer:
      "Yes. You can shortlist by budget range, property type, and furnishing preferences so you only see relevant options.",
    category: "Pricing",
  },
  {
    question: "How long does it usually take to finalize a rental?",
    answer:
      "Most successful tenants complete search-to-move-in within 7 to 14 days, depending on document readiness, owner response time, and visit scheduling.",
    category: "Process",
  },
  {
    question: "Can I schedule multiple property visits on the same day?",
    answer:
      "Yes. We recommend grouping nearby listings in one slot. Our team helps coordinate owner confirmations so your visits are efficient.",
    category: "Process",
  },
  {
    question: "What documents are generally required to rent a home?",
    answer:
      "Commonly requested documents include ID proof, employment proof or business proof, and recent address details. Specific requirements vary by owner and society.",
    category: "Process",
  },
  {
    question: "Will DemoRentals help if the owner delays agreement signing?",
    answer:
      "Yes. Our support team follows up with both sides to keep the timeline on track and shares a clear checklist for pending steps.",
    category: "Process",
  },
  {
    question: "Is police verification mandatory for tenants in India?",
    answer:
      "In many cities and societies, tenant police verification is strongly recommended or mandatory. Owners or societies may request it before move-in.",
    category: "Legal",
  },
  {
    question: "Do I get a valid rent agreement through this process?",
    answer:
      "Yes. Move-in is completed only after rent terms are documented through an agreement acceptable to both tenant and owner. Stamp duty and registration depend on state rules.",
    category: "Legal",
  },
  {
    question: "What if there is a mismatch between verbal promise and written agreement?",
    answer:
      "Always follow the written agreement. If something discussed earlier is missing, raise it before signing. DemoRentals support can assist in clarification.",
    category: "Legal",
  },
  {
    question: "Can two or more friends co-rent one property?",
    answer:
      "In many cases, yes, subject to owner approval and society rules. It is best to declare all occupants early so agreement terms can reflect shared tenancy correctly.",
    category: "Roommates",
  },
  {
    question: "How should roommates split rent and deposit fairly?",
    answer:
      "Most groups split equally by occupancy, but some adjust based on bedroom size or attached bathroom access. Keep split terms written in your roommate arrangement.",
    category: "Roommates",
  },
  {
    question: "Can DemoRentals help us find roommate-friendly localities?",
    answer:
      "Yes. Our team can suggest localities popular with shared rentals, better commute options, and buildings that are generally more open to co-living setups.",
    category: "Roommates",
  },
];

export const faqCategories = ["All", "General", "Pricing", "Process", "Legal", "Roommates"];
