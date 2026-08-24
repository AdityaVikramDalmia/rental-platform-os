export type FaqItem = {
  question: string;
  answer: string;
  category: string;
};

export const faqData: FaqItem[] = [
  {
    question: "What is the fastest way to reach DemoRentals support?",
    answer:
      "WhatsApp is usually the quickest channel for urgent help. You can also submit the contact form with your issue details and we will respond during support hours.",
    category: "General",
  },
  {
    question: "What are your standard support hours?",
    answer:
      "Support typically operates seven days a week during extended daytime and evening windows. For exact timing in your city, check the contact section or confirm on WhatsApp.",
    category: "General",
  },
  {
    question: "How quickly can I expect a response to my inquiry?",
    answer:
      "Most inquiries receive a first response within a few hours. Complex issues that involve owner or society coordination may take longer.",
    category: "General",
  },
  {
    question: "How can I update my email or phone number on my profile?",
    answer:
      "Share your old and new details through support with verification information. Our team will guide you through a secure update process.",
    category: "Account",
  },
  {
    question: "I cannot access my account. What should I do?",
    answer:
      "Use the login recovery options first. If access still fails, contact support with your registered phone or email and we will verify and help restore access.",
    category: "Account",
  },
  {
    question: "Can I request deletion of my account data?",
    answer:
      "Yes. Submit a data deletion request from the contact form and include your registered details. We process requests in line with applicable legal requirements.",
    category: "Account",
  },
  {
    question: "Where can I get an invoice or payment receipt?",
    answer:
      "If a payment was made through DemoRentals workflows, support can share invoice or receipt records after identity verification.",
    category: "Billing",
  },
  {
    question: "I was charged incorrectly. How do I raise a billing issue?",
    answer:
      "Contact support with transaction date, amount, and payment reference. Our billing team reviews disputes and shares resolution timelines.",
    category: "Billing",
  },
  {
    question: "How are refunds handled if a transaction fails?",
    answer:
      "Failed or duplicate transactions are validated with payment records first. Eligible reversals are processed based on bank and payment provider timelines.",
    category: "Billing",
  },
  {
    question: "The website is not loading properly on my phone. Any fix?",
    answer:
      "Clear browser cache, switch network once, and retry. If issue persists, share device model, browser version, and screenshot so we can debug quickly.",
    category: "Technical",
  },
  {
    question: "Why am I not receiving OTP or verification emails?",
    answer:
      "Please check spam folders and network signal. Delays can happen due to carrier filtering. Support can validate whether the OTP or email was triggered successfully.",
    category: "Technical",
  },
  {
    question: "The app shows an error while submitting forms. What now?",
    answer:
      "Refresh and retry once, then submit via contact form with error text and screenshot. Mention time of issue so our engineering team can trace logs.",
    category: "Technical",
  },
  {
    question: "Can I report a suspicious listing or fraudulent behavior?",
    answer:
      "Yes. Share listing URL, screenshot, and a brief note through contact support. Safety reports are prioritized and reviewed immediately.",
    category: "General",
  },
];

export const faqCategories = ["All", "General", "Account", "Billing", "Technical"];
