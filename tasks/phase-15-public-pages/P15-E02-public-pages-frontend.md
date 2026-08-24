---
id: P15-E02
title: Public Pages Frontend
phase: 15
status: pending
depends_on: ["P15-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P15-E02: Public Pages Frontend

## Overview

Build the complete public-facing frontend for DemoRentals: install shadcn Carousel and Accordion, create the `(public)` route group with a shared layout (ConvexClientProvider, public header, global footer), then implement three pages — homepage (7 sections including hero carousel, featured listings, testimonials), how-it-works (7 sections including interactive timeline, placeholder tools hub, searchable FAQ), and contact hub (6 sections including contact form persisted to Convex, newsletter signup, office location). All pages are fully public with no auth checks.

## Prerequisites

- **Read first**: [P15-E01 Completion Summary](P15-E01-public-pages-backend.md#completion-summary) — the three backend functions this epic depends on: `api.listings.listFeatured`, `api.supportInquiries.submit`, and `api.newsletterSubscriptions.subscribe`. The `public:support_inquiry` rate limiter is also live. Confirm all three exist before wiring up client components.
- **Codebase facts to verify before starting**:
  - `src/components/shared/ConvexClientProvider.tsx` exists — import from `@/components/shared/ConvexClientProvider`.
  - Root layout (`src/app/layout.tsx`) has ThemeProvider + Toaster but NO Convex provider — the `(public)` layout must add its own.
  - `src/app/listing/[slug]/page.tsx` is the reference for SSR + `generateMetadata()` patterns.
  - `src/app/listing/[slug]/components/contact-form.tsx` is the reference for react-hook-form + zod + shadcn Form pattern.
  - `src/app/listing/[slug]/components/whatsapp-button.tsx` is the reference for `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` usage.
  - shadcn/ui installed (24 components): button, card, input, textarea, label, form, dialog, sheet, tabs, badge, avatar, skeleton, separator, tooltip, dropdown-menu, switch, sonner, checkbox, date-picker, calendar, popover, radio-group, select, time-picker. Carousel and Accordion are NOT yet installed — T01 installs them.

## Task Queue

- [ ] P15-E02-T01: Public Route Group, Layout, Header, and shadcn Installs
- [ ] P15-E02-T02: Homepage (7 Sections)
- [ ] P15-E02-T03: How-It-Works Page (7 Sections)
- [ ] P15-E02-T04: Contact Hub (6 Sections)
- [ ] P15-E02-T05: Global Footer Component

---

## T01: Public Route Group, Layout, Header, and shadcn Installs

### Objective

Install shadcn Carousel and Accordion, create the `src/app/(public)/` route group with a server-component layout that wraps children in `ConvexClientProvider`, and build the responsive public header with logo, nav links, and a mobile hamburger menu using shadcn Sheet.

### Required Reading

- `notes/features/15-public-pages.md` — Footer section (lines 64-75): nav links list for header parity
- `notes/01-tech-stack.md` — "Authentication Architecture" section: confirms `(public)` pages need no auth check
- `notes/11-convex-architecture.md` — Project structure section: confirms `ConvexClientProvider` pattern and that root layout has no Convex provider

### Key Rules

1. Install Carousel, Accordion, and the Embla autoplay plugin: `npx shadcn@latest add carousel` then `npx shadcn@latest add accordion` then `npm install embla-carousel-autoplay`. The shadcn commands write to `src/components/ui/`. The autoplay plugin is required by T02's hero carousel (`Autoplay({ delay: 4000 })`). Run all from the project root.
2. `src/app/(public)/layout.tsx` is a **server component** (no `"use client"`). It wraps `{children}` in `<ConvexClientProvider>` imported from `@/components/shared/ConvexClientProvider`. No auth check — public pages are fully unauthenticated.
3. Layout renders `<PublicHeader />` above and `<Footer />` below `{children}`. Import both from `@/components/public/`.
4. Layout exports static metadata: `export const metadata: Metadata = { title: { default: "DemoRentals" } }`. Import `Metadata` from `"next"`. **No template** — each page exports its own complete title string (e.g., "DemoRentals — Find Your Perfect Rental Home") to match the feature spec exactly. Do NOT use a title template, as page titles already include the brand name.
5. `src/components/public/header.tsx` is a **client component** (`"use client"`) because the mobile menu requires `useState` for open/close toggle.
6. Header nav links: Home (`/homepage`), Browse Listings (`/listings`), How It Works (`/how-it-works`), Contact (`/contact`). CTA button: "Browse Listings" → `/listings`. Use Next.js `<Link>` for all internal routes. **Note**: Root `/` is a portal selector page — "Home" must link to `/homepage`, not `/`.
7. Mobile hamburger: use shadcn `Sheet` (already installed). Import `{ Sheet, SheetContent, SheetTrigger }` from `"@/components/ui/sheet"`. Trigger is a `Menu` icon from `lucide-react`. Sheet opens from the left side (`side="left"`). Sheet content repeats the same nav links stacked vertically.
8. Logo: text "DemoRentals" in a bold, branded style (or an `<Image>` if a logo asset exists in `public/`). Check `public/` for existing logo files before deciding. If none, use styled text.
9. Header is sticky: `className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"`.
10. Use `usePathname()` from `"next/navigation"` to highlight the active nav link with a different text color or underline.

### Deliverables

- [ ] `src/components/ui/carousel.tsx` — installed via `npx shadcn@latest add carousel`
- [ ] `src/components/ui/accordion.tsx` — installed via `npx shadcn@latest add accordion`
- [ ] `embla-carousel-autoplay` — installed via `npm install embla-carousel-autoplay` (required by T02 hero carousel)
- [ ] `src/app/(public)/layout.tsx` — server component layout with ConvexClientProvider, PublicHeader, Footer, and static metadata (default title "DemoRentals", no template)
- [ ] `src/components/public/header.tsx` — client component with logo, desktop nav links, CTA button, mobile Sheet hamburger menu, active link highlighting

### Acceptance Criteria

1. `src/components/ui/carousel.tsx` and `src/components/ui/accordion.tsx` exist after running the shadcn install commands.
2. `src/app/(public)/layout.tsx` renders without errors. No auth check present. `ConvexClientProvider` wraps children.
3. Header renders logo, 4 nav links, and CTA button on desktop.
4. Mobile hamburger icon appears on small screens; clicking it opens a Sheet with the same nav links.
5. Active nav link is visually distinguished from inactive links.
6. `npx tsc --noEmit` passes on all new files.

### Verification

```bash
npx shadcn@latest add carousel
npx shadcn@latest add accordion
npm install embla-carousel-autoplay
npx tsc --noEmit
```

Check that `src/components/ui/carousel.tsx` and `src/components/ui/accordion.tsx` exist. Navigate to any `(public)` route in the browser and confirm the header renders with logo, nav links, and CTA button. Resize to mobile and confirm the hamburger menu opens a Sheet.

### Out of Scope

- Footer component (T05)
- Any page content (T02, T03, T04)
- Auth-protected routes — `(public)` layout has zero auth logic

---

## T02: Homepage (7 Sections)

### Objective

Build `src/app/(public)/homepage/page.tsx` with all 7 sections: Hero carousel, Locality Search bar, Featured Properties carousel (live Convex data), Why Choose Us cards, Testimonials carousel, How It Works summary, and CTA section. Export SEO metadata.

### Required Reading

- `notes/features/15-public-pages.md` — Homepage sections table (lines 20-29): all 7 sections with content and CTAs
- `notes/features/15-public-pages.md` — Featured Properties note (line 31): query spec (`status: PUBLISHED`, newest first, limit 9)
- `notes/features/15-public-pages.md` — Edge cases (lines 123-128): empty state for featured section, rate limit handling
- `notes/13-constants-reference.md` — System Config Keys: `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` env var for WhatsApp CTA

### Key Rules

1. `src/app/(public)/homepage/page.tsx` is a **server component** for the page shell and SEO metadata. Client-interactive sections (Featured Properties, Testimonials carousel) are extracted into separate `"use client"` components in `src/components/public/`.
2. SEO metadata export (server component):
   ```typescript
   export const metadata: Metadata = {
     title: "DemoRentals — Find Your Perfect Rental Home",
     description:
       "Browse verified rental properties in your city. Transparent pricing, real photos, and direct WhatsApp contact.",
     openGraph: {
       title: "DemoRentals — Find Your Perfect Rental Home",
       description: "Browse verified rental properties in your city.",
       type: "website",
     },
   };
   ```
3. **Hero section**: Use shadcn `Carousel` with Embla autoplay plugin. Import `{ Carousel, CarouselContent, CarouselItem }` from `"@/components/ui/carousel"`. For autoplay, install the Embla autoplay plugin: `import Autoplay from "embla-carousel-autoplay"` and pass `plugins={[Autoplay({ delay: 4000 })]}` to `<Carousel>`. Hero slides are placeholder gradient backgrounds (3 slides) in V1 — no real images needed. Each slide shows the primary headline and CTA buttons. Trust counters (hardcoded: "500+ Properties", "2,000+ Happy Tenants", "5 Cities") render as a grid below or overlaid on the carousel.
4. CTA buttons in Hero: "Browse Listings" → `<Link href="/listings">`, "WhatsApp Us" → `<a href={\`https://wa.me/${process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}\`} target="\_blank" rel="noopener noreferrer">`. WhatsApp link is in a client component since it reads an env var at render time.
5. **Locality Search section**: A `"use client"` component. Fields: text input (locality name), `<Select>` for price range (Under ₹10k, ₹10k-₹20k, ₹20k-₹30k, ₹30k+), `<Select>` for property type (1 BHK, 2 BHK, 3 BHK, Studio). On submit, use `useRouter().push(\`/listings?locality=\${locality}&priceMin=\${priceMin}&priceMax=\${priceMax}&type=\${type}\`)`. P16 will handle the `/listings` route — this just pushes params.
6. **Featured Properties section**: Extract to `src/components/public/featured-listings.tsx` — a `"use client"` component. Call `useQuery(api.listings.listFeatured, { limit: 9 })`. While loading, show 3 skeleton cards using shadcn `Skeleton`. If result is an empty array, show: "New listings coming soon! Check back later." centered with a `Home` icon from lucide-react. Each property card shows: photo thumbnail from `listing.first_photo_url` (returned by `listFeatured` join — no separate query needed; if null, show a placeholder gradient), rent formatted as `formatINR(listing.rent_monthly)` from `lib/money.ts` (field is `rent_monthly`, stored in paise), BHK config (e.g., "2 BHK" from `listing.bhk_config`), building name + society name (from `listing.building_name` + `listing.society_name`, both nullable), and a WhatsApp CTA button. Wrap cards in a `<Carousel>` with `opts={{ align: "start", loop: true }}`.
7. **Why Choose Us section**: 4 hardcoded `<Card>` components. Content: (1) "Verified Properties" — "Every listing is owner-verified before going live." (2) "Transparent Pricing" — "No hidden fees. Rent, deposit, and brokerage shown upfront." (3) "Direct WhatsApp Contact" — "Connect instantly with our team via WhatsApp." (4) "Trusted by Thousands" — "2,000+ tenants have found their home through DemoRentals." Use a `CheckCircle` or `Shield` icon from lucide-react per card.
8. **Testimonials section**: Extract to `src/components/public/testimonial-carousel.tsx` — a `"use client"` component. Hardcoded array of 4-5 testimonials (name, location, rating 1-5, comment text). Render in a `<Carousel>` with autoplay. Each testimonial is a `<Card>` with avatar initials (shadcn `Avatar`), name, location, star rating (filled/empty stars using `Star` icon from lucide-react), and comment text.
9. **How It Works Summary section**: 4 numbered step cards (1. Search, 2. Visit, 3. Move In, 4. Enjoy). Each card has a large step number, title, and 1-sentence description. Below the cards: `<Link href="/how-it-works">Learn More →</Link>` as a text link or outlined button.
10. **CTA section**: Full-width section with a gradient background (`bg-gradient-to-r from-amber-500 to-orange-600` or similar). Two CTA buttons: "Browse Listings" → `/listings`, "List Your Property" → `#` (placeholder until P20). WhatsApp CTA: `wa.me` link. Headline: "Ready to Find Your Perfect Home?"

### Deliverables

- [ ] `src/app/(public)/homepage/page.tsx` — server component page shell with SEO metadata and all 7 section components assembled
- [ ] `src/components/public/featured-listings.tsx` — client component with `useQuery(api.listings.listFeatured)`, skeleton loading, empty state, property cards in Carousel
- [ ] `src/components/public/testimonial-carousel.tsx` — client component with hardcoded testimonials in a Carousel with autoplay
- [ ] `src/components/public/locality-search.tsx` — client component with locality input, price range Select, property type Select, and router push on submit

### Acceptance Criteria

1. `/homepage` renders all 7 sections without errors.
2. Hero carousel auto-advances between slides every 4 seconds.
3. Featured Properties section calls `api.listings.listFeatured` and shows skeleton cards while loading.
4. Empty state "New listings coming soon! Check back later." renders when no published listings exist.
5. Property cards show rent formatted as ₹ (not raw paise).
6. Locality Search pushes correct query params to `/listings` on submit.
7. Testimonials carousel renders with hardcoded data and auto-advances.
8. SEO metadata title is "DemoRentals — Find Your Perfect Rental Home".
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Navigate to `http://localhost:3000/homepage`. Verify all 7 sections render. Check browser DevTools Network tab — confirm `listFeatured` query fires. Verify hero carousel auto-advances. Verify testimonials carousel renders. Check page `<title>` in DevTools Elements tab.

### Out of Scope

- Real listing photos (placeholder gradients acceptable in V1)
- Actual `/listings` route (P16 — locality search just pushes params)
- Owner services page link (placeholder `#` until P20)
- Dynamic trust counters (hardcoded in V1)

---

## T03: How-It-Works Page (7 Sections)

### Objective

Build `src/app/(public)/how-it-works/page.tsx` with all 7 sections: Hero, Process Timeline (6-step interactive), Interactive Tools Hub (placeholder tabs), Rental Checklist (placeholder with localStorage), Testimonial Videos (placeholder cards), FAQ (searchable accordion with category tabs), and CTA. Export SEO metadata.

### Required Reading

- `notes/features/15-public-pages.md` — How-It-Works sections table (lines 39-47): all 7 sections with content descriptions
- `notes/features/15-public-pages.md` — Business rules (lines 101-111): FAQ is static, no real video in V1, tools are placeholder
- `notes/features/16-tenant-tools.md` — Skim for tool names and descriptions to write accurate placeholder text in the Tools Hub tabs

### Key Rules

1. `src/app/(public)/how-it-works/page.tsx` is a **server component** for the page shell and metadata. Interactive sections (timeline, checklist, FAQ) are `"use client"` components in `src/components/public/`.
2. SEO metadata:
   ```typescript
   export const metadata: Metadata = {
     title: "How Renting Works — DemoRentals",
     description:
       "Learn how to find and rent your perfect home with DemoRentals. Step-by-step process, tools, and FAQ.",
     openGraph: {
       title: "How Renting Works — DemoRentals",
       description: "Step-by-step guide to finding and renting your perfect home.",
       type: "website",
     },
   };
   ```
3. **Hero section**: Headline "How Renting with DemoRentals Works", subheadline "Simple, transparent, and stress-free." Three trust stat cards (hardcoded): "500+ Listings", "98% Satisfaction", "30-Day Average Move-In". Cards use shadcn `Card` with a large number and label.
4. **Process Timeline**: Extract to `src/components/public/process-timeline.tsx` — a `"use client"` component. 6 steps: (1) Search — "Browse verified listings filtered by locality, budget, and BHK" — "Day 1", (2) Shortlist — "Save your favorites and compare properties side by side" — "Day 1-3", (3) Visit — "Schedule a guided visit with our team" — "Day 3-7", (4) Apply — "Submit your rental application and documents" — "Day 7-10", (5) Move In — "Sign the agreement and collect your keys" — "Day 10-14", (6) Settle — "Our team supports you through the first month" — "Month 1". Each step has a step number circle, title, description, and duration badge. Clicking a step expands its detail using `useState` (track `activeStep: number | null`). Expanded detail shows a longer description paragraph. Use CSS transitions (`transition-all duration-300`) for smooth expand/collapse. No external library needed.
5. **Interactive Tools Hub**: A `"use client"` component inline in the page or extracted to `src/components/public/tools-hub.tsx`. Use shadcn `Tabs` — import `{ Tabs, TabsContent, TabsList, TabsTrigger }` from `"@/components/ui/tabs"`. Three tabs: "Rent Calculator", "Commute Estimator", "Roommate Quiz". Each tab content is a placeholder `<Card>` with: a relevant icon (Calculator, MapPin, Users from lucide-react), title, description of what the tool will do, and a "Coming in Phase 18" badge using shadcn `Badge` with `variant="secondary"`. Do NOT implement the actual tools — P18 will replace these placeholders.
6. **Rental Checklist Tracker**: A `"use client"` component. 4 categories with 3-4 placeholder items each: "Before Search" (Define budget, Choose localities, List must-haves, Set move-in date), "During Visits" (Check water pressure, Inspect natural light, Ask about maintenance, Verify parking), "Before Move-In" (Review agreement, Pay deposit, Set up utilities, Photograph existing damage), "After Move-In" (Register with society, Update address, Meet neighbors, Save emergency contacts). Track checked items in `localStorage` under key `"demorentals-checklist"`. Parse on mount with `useEffect`. Show a progress bar (shadcn does not have a Progress component — use a plain `<div>` with `style={{ width: \`\${percent}%\` }}` inside a container div). Show "X of Y complete" text. P18 will enhance this with more items and export functionality.
7. **Testimonial Videos section**: 3 placeholder cards. Each card has: a gradient placeholder thumbnail (e.g., `bg-gradient-to-br from-amber-100 to-orange-200`) with a `Play` icon (lucide-react) centered over it, a name, role ("Tenant in Bangalore"), and a 1-2 sentence testimonial quote below. No real video or `<video>` element — purely visual placeholder. Cards are in a 3-column grid on desktop, 1-column on mobile.
8. **FAQ section**: Extract to `src/components/public/faq-section.tsx` — a `"use client"` component. Props: `{ items: FaqItem[], title?: string }` where `FaqItem = { question: string; answer: string; category: string }`. Define FAQ data as a constant in `src/app/(public)/how-it-works/data/faq-how-it-works.ts`. Categories: "General", "Pricing", "Process", "Legal", "Roommates". At least 3 items per category (15+ total). Above the accordion: a text `<input>` for search (filter items by question text, case-insensitive). Below the search: category filter tabs using plain `<button>` elements or shadcn `Tabs` (an "All" tab plus one per category). Filtered items render in a shadcn `Accordion` — import `{ Accordion, AccordionContent, AccordionItem, AccordionTrigger }` from `"@/components/ui/accordion"`. Use `type="multiple"` to allow multiple items open simultaneously.
9. **CTA section**: Simple centered section. Headline "Ready to Start Your Search?" Button: "Browse Listings" → `<Link href="/listings">`. Style as a primary button.

### Deliverables

- [ ] `src/app/(public)/how-it-works/page.tsx` — server component page shell with SEO metadata and all 7 sections assembled
- [ ] `src/app/(public)/how-it-works/data/faq-how-it-works.ts` — FAQ data constant (15+ items across 5 categories: General, Pricing, Process, Legal, Roommates)
- [ ] `src/components/public/process-timeline.tsx` — client component with 6 interactive steps, click-to-expand, CSS transitions
- [ ] `src/components/public/faq-section.tsx` — reusable client component with search input, category filter tabs, and shadcn Accordion

### Acceptance Criteria

1. `/how-it-works` renders all 7 sections without errors.
2. Process Timeline shows 6 steps; clicking a step expands its detail and collapses any previously expanded step.
3. Tools Hub shows 3 tabs (Rent Calculator, Commute Estimator, Roommate Quiz); each tab shows a placeholder card with "Coming in Phase 18" badge.
4. Rental Checklist shows 4 categories with items; checking an item persists to localStorage and survives page refresh.
5. Progress bar updates as items are checked.
6. FAQ search input filters accordion items in real time.
7. Category tabs filter to show only items in that category.
8. SEO metadata title is "How Renting Works — DemoRentals".
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Navigate to `http://localhost:3000/how-it-works`. Click each timeline step and verify expand/collapse. Switch Tools Hub tabs and verify placeholder content. Check a checklist item, refresh the page, and verify it stays checked. Type in the FAQ search box and verify filtering. Switch FAQ category tabs and verify filtering. Check page `<title>`.

### Out of Scope

- Actual rent calculator, commute estimator, or roommate quiz implementation (P18)
- Checklist export/download (P18) — **Intentional deferral**: `notes/features/15-public-pages.md` line 44 mentions "export/download functionality" in the checklist section. However, P15's checklist is placeholder content (categories and items are hardcoded). Full checklist implementation with export/download moves to P18 (Tenant Tools) where the real data model and interactions are built. This avoids building export functionality for placeholder content that will be replaced.
- Real testimonial videos (V2)
- CMS for FAQ content (V2)

---

## T04: Contact Hub (6 Sections)

### Objective

Build `src/app/(public)/contact/page.tsx` with all 6 sections: Hero, Contact Methods Grid, Contact Form (persisted to Convex), Office Location with Google Maps embed, FAQ accordion (different content from how-it-works), and Newsletter Signup. Export SEO metadata.

### Required Reading

- `notes/features/15-public-pages.md` — Contact Hub sections table (lines 55-62): all 6 sections with content
- `notes/features/15-public-pages.md` — Business rules (lines 101-111): rate limit on contact form, newsletter upsert behavior
- `notes/10-convex-schema.md` — `support_inquiries` table (lines 737-760): exact field validators for zod schema
- `notes/10-convex-schema.md` — `newsletter_subscriptions` table (lines 762-766): email + subscribed_at + source_page
- `notes/13-constants-reference.md` — System Config Keys: `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE`, `NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE`

### Key Rules

1. `src/app/(public)/contact/page.tsx` is a **server component** for the page shell and metadata. The contact form and newsletter signup are `"use client"` components.
2. SEO metadata:
   ```typescript
   export const metadata: Metadata = {
     title: "Contact DemoRentals — Get Help with Your Rental Search",
     description:
       "Reach DemoRentals via WhatsApp, phone, email, or our contact form. We're here to help you find your perfect rental.",
     openGraph: {
       title: "Contact DemoRentals — Get Help with Your Rental Search",
       description: "Reach us via WhatsApp, phone, email, or our contact form.",
       type: "website",
     },
   };
   ```
3. **Hero section**: Headline "Get in Touch", subheadline "We're here to help — reach us on WhatsApp for the fastest response." Immediate WhatsApp CTA button: `<a href={\`https://wa.me/${process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}?text=Hi, I need help with finding a rental.\`} target="\_blank">`. This is in a client component since it reads an env var.
4. **Contact Methods Grid**: Extract to `src/components/public/contact-methods-grid.tsx` — a `"use client"` component. 6 cards in a responsive grid (`grid-cols-2 md:grid-cols-3`). Each card uses shadcn `Card` with an icon, title, description, and action link/button:
   - WhatsApp: `MessageCircle` icon, "WhatsApp" title, "Fastest response — usually within minutes", link `https://wa.me/${NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}?text=Hi, I need help with finding a rental.`
   - Phone: `Phone` icon, "Call Us" title, "Mon-Sat, 9am-7pm", link `tel:+91${NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE}`
   - Email: `Mail` icon, "Email Us" title, "We reply within 24 hours", link `mailto:admin@example.com`
   - Video Call: `Video` icon, "Video Call" title, "Schedule a screen-share session", shadcn `Badge` with `variant="secondary"` showing "Coming Soon" — no link
   - Live Chat: `MessageSquare` icon, "Live Chat" title, "Chat with us in real time", shadcn `Badge` showing "Coming Soon" — no link
   - Visit Office: `MapPin` icon, "Visit Us" title, "Demo District, Bangalore", link `https://maps.google.com/?q=Demo District+Bangalore`
5. **Contact Form**: Two parts — a Server Action and a client component.
   - **Server Action**: Create `src/app/(public)/contact/actions.ts`. This is a `"use server"` module. Match the existing `src/app/listing/[slug]/actions.ts` import pattern exactly:
     ```typescript
     "use server";
     import { headers } from "next/headers";
     import { fetchMutation } from "convex/nextjs";
     import { api } from "../../../../convex/_generated/api";
     ```
     The action receives form data, extracts the IP: `const headersList = await headers(); const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";`. Before calling the mutation, normalize phone: `const phone = formData.phone?.trim() || undefined;` (converts empty string to `undefined` so the backend doesn't receive `""` for a 10-digit validation). Then calls `fetchMutation(api.supportInquiries.submit, { name: formData.name, email: formData.email, phone, subject: formData.subject, message: formData.message, preferred_contact_method: formData.preferred_contact_method, persona_type: "TENANT", source_channel: "contact_page", ip })`. Returns `{ success: boolean; error?: string }`. Wraps in try/catch — rate limit errors detected by checking `message.toLowerCase().includes("rate")`.
   - **Client Component**: Extract to `src/components/public/contact-form.tsx` — a `"use client"` component. Zod schema matching `support_inquiries` validators:
   ```typescript
   const contactFormSchema = z.object({
     name: z.string().min(2, "Name must be at least 2 characters"),
     email: z.string().email("Please enter a valid email address"),
     phone: z
       .string()
       .regex(/^\d{10}$/, "Phone must be 10 digits")
       .optional()
       .or(z.literal("")),
     subject: z.string().min(5, "Subject must be at least 5 characters"),
     message: z.string().min(10, "Message must be at least 10 characters"),
     preferred_contact_method: z.enum(["WHATSAPP", "PHONE", "EMAIL", "IN_APP"]).optional(),
   });
   ```
   Use `useForm` from `"react-hook-form"` with `zodResolver`. Use shadcn Form components: `import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"`. Fields: name (Input), email (Input), phone (Input, optional — show "(optional)" in label), subject (Input), message (Textarea), preferred_contact_method (shadcn `Select` with options: WhatsApp, Phone, Email, In-App — optional). Use `useTransition` for pending state (matching existing `src/app/listing/[slug]/components/contact-form.tsx` pattern): `const [isPending, startTransition] = useTransition();`. Submit button shows a `Loader2` spinner and is disabled while `isPending`. On submit, wrap the server action call in `startTransition(async () => { ... })`. On success: `toast.success("Message sent! We'll get back to you soon.")` and `form.reset()`. On error: if error message contains "Too many" or "rate limit", show `toast.error("Too many submissions. Please try again later.")`, else show `toast.error(error.message)`. Import `toast` from `"sonner"`.
6. **Office Location section**: Static server-rendered section. Address: "DemoRentals HQ, 123 Example Street, Demo District, Bangalore — 560001". Hours: "Monday to Saturday, 9:00 AM to 7:00 PM IST". Google Maps iframe: `<iframe src="https://maps.google.com/maps?q=Demo District+5th+Block+Bangalore&output=embed" loading="lazy" className="w-full h-64 rounded-lg border" title="DemoRentals Office Location" />`. "Open in Maps" link: `<a href="https://maps.google.com/?q=Demo District+5th+Block+Bangalore" target="_blank" rel="noopener noreferrer">`.
7. **FAQ section**: Reuse `<FaqSection>` component from T03 but pass DIFFERENT data. Define contact-specific FAQ data in `src/app/(public)/contact/data/faq-contact.ts`. Categories: "General", "Rentals", "Payments", "Support", "Listings". At least 3 items per category (15+ total). Example questions: "How quickly do you respond to inquiries?", "What areas do you cover?", "Can I schedule a property visit online?", "What documents do I need to rent?", "How do I report an issue with a listing?".
8. **Newsletter Signup**: Extract to `src/components/public/newsletter-signup.tsx` — a `"use client"` component. Single email input + "Subscribe" button. Use `useState` for the email value (no react-hook-form needed — single field). Validate email format client-side before calling mutation. Use `useMutation(api.newsletterSubscriptions.subscribe)` to get the mutation function, and `useState<boolean>(false)` for a `loading` state flag (Convex `useMutation` does NOT return `isPending` — manage loading state manually). Call the mutation with `{ email, source_page: "contact" }`. Button shows `Loader2` spinner and is disabled while `loading` is true. On success: `toast.success("You're subscribed! We'll keep you updated.")`. On error: `toast.error("Something went wrong. Please try again.")`. Double-subscribe is handled by the backend upsert — show the same success toast.

### Deliverables

- [ ] `src/app/(public)/contact/page.tsx` — server component page shell with SEO metadata and all 6 sections assembled
- [ ] `src/app/(public)/contact/data/faq-contact.ts` — contact-specific FAQ data constant (15+ items across 5 categories: General, Rentals, Payments, Support, Listings)
- [ ] `src/components/public/contact-methods-grid.tsx` — client component with 6 channel cards, "Coming Soon" badges on Video Call and Live Chat
- [ ] `src/app/(public)/contact/actions.ts` — server action that extracts IP from request headers and calls `fetchMutation(api.supportInquiries.submit, { ...formData, ip })` (matches existing listing inquiry pattern)
- [ ] `src/components/public/contact-form.tsx` — client component with react-hook-form + zod + useTransition, calls server action (not useMutation directly), success/error toasts
- [ ] `src/components/public/newsletter-signup.tsx` — client component with email input, calls `api.newsletterSubscriptions.subscribe`, success toast

### Acceptance Criteria

1. `/contact` renders all 6 sections without errors.
2. WhatsApp card links to `wa.me/{NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}?text=...`.
3. Phone card links to `tel:+91{NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE}`.
4. Video Call and Live Chat cards show "Coming Soon" badge with no clickable link.
5. Contact form validates all fields per the zod schema before submitting.
6. Submitting the contact form calls the server action in `src/app/(public)/contact/actions.ts` (NOT `useMutation` directly), which extracts IP and calls `fetchMutation(api.supportInquiries.submit)`. Shows success toast on completion.
7. Phone field accepts only 10 digits or empty string (optional). Empty string is normalized to `undefined` before mutation call (in server action) so backend doesn't receive `""` for 10-digit validation.
8. Google Maps iframe renders with `loading="lazy"`.
9. Newsletter signup calls `api.newsletterSubscriptions.subscribe` and shows success toast.
10. FAQ search and category filter work correctly with contact-specific content.
11. SEO metadata title is "Contact DemoRentals — Get Help with Your Rental Search".
12. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Navigate to `http://localhost:3000/contact`. Verify all 6 sections render. Submit the contact form with valid data and confirm success toast. Submit with invalid email and confirm validation error. Check that Video Call and Live Chat cards have "Coming Soon" badges. Verify the Google Maps iframe loads. Subscribe to newsletter and confirm success toast. Check page `<title>`.

### Out of Scope

- IP-based rate limiting on the frontend (handled server-side in the Convex mutation)
- Admin management of support inquiries (P21)
- Live chat integration (V2)
- Video call scheduling (V2)

---

## T05: Global Footer Component

### Objective

Build `src/components/public/footer.tsx` — the shared footer rendered on all `(public)` pages via the layout. Four-column layout with Company links, Resources links, Contact channels, and Social links. Bottom bar with copyright.

### Required Reading

- `notes/features/15-public-pages.md` — Footer section (lines 64-75): exact nav links, contact channels, WhatsApp, social, copyright text
- `notes/13-constants-reference.md` — System Config Keys: `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE`, `NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE`

### Key Rules

1. `src/components/public/footer.tsx` is a **server component** (no `"use client"`) — it has no interactive state. All links are static. WhatsApp and phone links use `process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` and `process.env.NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE` directly (safe in server components).
2. Four-column grid on desktop (`grid-cols-4`), two-column on tablet (`sm:grid-cols-2`), single-column on mobile (`grid-cols-1`). Use `gap-8` between columns.
3. **Company column**: Heading "Company". Links (Next.js `<Link>`): Home (`/homepage`), How It Works (`/how-it-works`), Browse Listings (`/listings`). **Note**: Root `/` is a portal selector — "Home" must link to `/homepage`.
4. **Resources column**: Heading "Resources". Links: FAQ (`/how-it-works#faq`), Contact (`/contact`), Owner Services (`#` — placeholder until P20).
5. **Contact column**: Heading "Contact". Three items (not links — use `<a>` tags):
   - Phone: `<a href={...tel:+91${NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE}...}>` with a `Phone` icon from lucide-react.
   - Email: `<a href="mailto:admin@example.com">admin@example.com</a>` with a `Mail` icon.
   - WhatsApp: `<a href={...https://wa.me/${NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}...} target="_blank" rel="noopener noreferrer">WhatsApp Us</a>` with a `MessageCircle` icon.
6. **Follow Us column**: Heading "Follow Us". Three social links (all `href="#"` placeholder in V1): Instagram (`Instagram` icon from lucide-react), Twitter/X (`Twitter` icon), Facebook (`Facebook` icon). Render as icon-only links with `aria-label` for accessibility.
7. **Bottom bar**: Full-width separator (`<Separator />` from `"@/components/ui/separator"`), then a flex row with copyright text left-aligned: `© {new Date().getFullYear()} DemoRentals. All rights reserved.` Right side: "Made with ❤️ in Bangalore" or similar tagline (optional).
8. Footer background: `bg-muted` or `bg-gray-50` (dark variant of the page background). Top padding `pt-12`, bottom padding `pb-6`. Full-width with `w-full`.
9. Column headings: `text-sm font-semibold text-foreground uppercase tracking-wider`. Link text: `text-sm text-muted-foreground hover:text-foreground transition-colors`.
10. The footer is already imported and rendered in `src/app/(public)/layout.tsx` (from T01). This task only creates the component file itself.

### Deliverables

- [ ] `src/components/public/footer.tsx` — server component with 4-column layout (Company, Resources, Contact, Follow Us), bottom bar with copyright, responsive grid, WhatsApp and phone links from env vars

### Acceptance Criteria

1. Footer renders on all `(public)` pages (homepage, how-it-works, contact) via the layout.
2. Company column shows 3 links: Home (`/homepage`), How It Works, Browse Listings.
3. Resources column shows 3 links: FAQ, Contact, Owner Services (placeholder `#`).
4. Contact column shows phone (`tel:` link), email (`mailto:` link), and WhatsApp (`wa.me` link) with icons.
5. Follow Us column shows 3 social icon links (all `#` placeholder) with `aria-label` attributes.
6. Bottom bar shows "© {currentYear} DemoRentals. All rights reserved."
7. Footer is responsive: 4 columns on desktop, 2 on tablet, 1 on mobile.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Navigate to `http://localhost:3000/homepage`, `http://localhost:3000/how-it-works`, and `http://localhost:3000/contact`. Verify the footer appears on all three pages. Check that the copyright year is correct. Hover over nav links and verify color transition. Verify WhatsApp link opens `wa.me` in a new tab. Resize to mobile and verify single-column stacking.

### Out of Scope

- Owner Services page link destination (placeholder `#` until P20)
- Real social media profile links (placeholder `#` in V1)
- Footer newsletter signup (newsletter is in the Contact page only)
- i18n for footer text (admin panel and public pages are English-only per convention)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
