---
id: P15-E05
title: Social Proof & New Conversion Sections
phase: 15
status: pending
depends_on: ["P15-E04"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P15-E05: Social Proof & New Conversion Sections

## Overview

Upgrade the existing Testimonials section with animated card transitions and outcome-focused copy. Add three NEW sections to the homepage: a Comparison Table (Rental Platform OS vs traditional brokers), a Tools Preview (teaser cards for upcoming tenant tools), and a redesigned Dual CTA section with shimmer buttons and animated gradient background. These sections complete the homepage's "middle of funnel" — after the hero hooks them and features build interest, social proof and conversion sections close the deal.

## Prerequisites

- **Read first**: [P15-E04 Completion Summary](P15-E04-premium-core-sections.md#completion-summary) — confirms featured properties, locality search, how it works, and why rental-platform-os sections are all redesigned with premium animations.
- **Codebase facts to verify before starting**:
  - All shared animation utilities exist: `SectionReveal`, `StaggerChildren`, `SectionContainer` in `src/components/public/animations/`
  - Magic UI components exist: `blur-fade`, `number-ticker`, `shimmer-button`, `marquee`, `particles`, `animated-gradient-text` in `src/components/magicui/`
  - `motion` package installed, `import { motion } from "motion/react"` works
  - Current homepage section order after E03+E04: HeroSection → ProofStrip → LocalitySearch → FeaturedProperties → HomepageTimeline (How It Works) → WhyPlatform → TestimonialCarousel → DualCTA → Footer

## Task Queue

- [ ] P15-E05-T01: Upgrade Testimonials with Animated Card Transitions
- [ ] P15-E05-T02: Add Comparison Table Section
- [ ] P15-E05-T03: Add Tools Preview Section
- [ ] P15-E05-T04: Redesign Dual CTA with Shimmer Buttons

---

## T01: Upgrade Testimonials with Animated Card Transitions

### Objective

Replace the basic testimonial carousel with a premium animated testimonial section. Upgrade testimonial copy to be outcome-focused ("Found my 2BHK in Demo District in 3 days"), add avatar images (gradient placeholder circles with initials), add animated card transitions on carousel advance, and improve the visual design of each testimonial card.

### Required Reading

- `src/components/public/testimonial-carousel.tsx` — current implementation: 8 hardcoded testimonials, Embla carousel with autoplay, basic cards with avatar circle, name, designation, star rating, comment
- `src/components/public/animations/` — shared animation utilities

### Key Rules

1. **Rewrite testimonial content** to be outcome-focused. Replace the generic testimonials with specific, measurable outcomes. Updated array:
   ```typescript
   const TESTIMONIALS = [
     {
       name: "Ananya Sharma",
       role: "Software Engineer",
       location: "Demo District, Bangalore",
       avatar: "AS",
       rating: 5,
       comment:
         "Found my 2BHK in Demo District in just 3 days. Zero brokerage saved me ₹40,000. The guided visit made it so easy — no awkward broker calls.",
       highlight: "3 days to move-in",
     },
     {
       name: "Rahul Verma",
       role: "Product Manager",
       location: "HSR Layout, Bangalore",
       avatar: "RV",
       rating: 5,
       comment:
         "Relocated from Delhi with zero stress. Rental Platform OS handled everything — shortlisting, visits, paperwork. I just showed up with my bags.",
       highlight: "Zero stress relocation",
     },
     {
       name: "Priya Nair",
       role: "UX Designer",
       location: "Indiranagar, Bangalore",
       avatar: "PN",
       rating: 5,
       comment:
         "Every listing I saw was exactly as described. No fake photos, no bait-and-switch. First visit, first choice, done. That's how it should work.",
       highlight: "First visit, first choice",
     },
     {
       name: "Kunal Mehta",
       role: "Data Analyst",
       location: "Whitefield, Bangalore",
       avatar: "KM",
       rating: 4,
       comment:
         "The rent calculator helped me budget accurately before I even started looking. Ended up saving ₹5,000/month by choosing the right area.",
       highlight: "₹5,000/month saved",
     },
     {
       name: "Sneha Rao",
       role: "Marketing Lead",
       location: "Electronic City, Bangalore",
       avatar: "SR",
       rating: 5,
       comment:
         "WhatsApp response in under 5 minutes. Visited 4 properties in one day. Signed the agreement the next morning. This is how renting should be.",
       highlight: "4 visits in one day",
     },
     {
       name: "Arjun Kapoor",
       role: "Startup Founder",
       location: "JP Nagar, Bangalore",
       avatar: "AK",
       rating: 5,
       comment:
         "As a startup founder, I don't have time for broker nonsense. Rental Platform OS's transparent pricing and direct owner contact saved me hours.",
       highlight: "Direct owner contact",
     },
   ];
   ```
2. **Upgraded card design**: Each testimonial card:
   - Container: `bg-white rounded-2xl p-6 lg:p-8 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300`
   - Top row: Avatar circle + Name + Role + Location
   - Avatar: `w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm` with initials
   - Highlight badge: `inline-flex bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mt-3` showing the `highlight` field (e.g., "3 days to move-in")
   - Star rating row: filled stars `text-amber-400`, empty stars `text-slate-200`
   - Comment: `text-slate-600 text-sm leading-relaxed mt-3` — wrapped in quotation marks (`"..."`)
   - Location: `text-xs text-slate-400 mt-2` with a `MapPin` icon
3. **Keep Embla carousel**: The carousel infrastructure is fine. DO NOT switch to a different carousel. Just upgrade the card content/design and wrap the section in animation utilities.
4. **Section wrapper**:
   ```tsx
   <SectionContainer className="bg-slate-50" id="testimonials">
     <SectionReveal>
       <div className="text-center mb-12">
         <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">What Our Tenants Say</h2>
         <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
           Real stories from people who found their home with Rental Platform OS
         </p>
       </div>
     </SectionReveal>
     <TestimonialCarousel />
   </SectionContainer>
   ```
5. **Carousel entrance animation**: When the section enters the viewport, the currently visible cards animate in with `BlurFade`. This is already handled by `SectionReveal` wrapping the entire section.
6. Reduce the testimonials from 8 to 6 (tighter, more impactful).
7. Autoplay delay stays at 5000ms. `pauseOnInteraction` stays true.

### Deliverables

- [ ] `src/components/public/testimonial-carousel.tsx` — modified with rewritten outcome-focused testimonials (6 items), highlight badges, gradient avatar circles, upgraded card design
- [ ] `src/app/(public)/homepage/page.tsx` — modified to wrap testimonials section in `SectionContainer` + `SectionReveal` with new heading

### Acceptance Criteria

1. 6 testimonials render in the carousel (down from 8).
2. Each card shows: avatar with gradient + initials, name, role, location, star rating, highlight badge, comment in quotes.
3. Highlight badges are visible (e.g., "3 days to move-in").
4. Cards have subtle hover shadow effect.
5. Carousel still auto-advances every 5 seconds.
6. Section animates in with blur-fade on scroll.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Scroll to testimonials. Verify:

- 6 testimonial cards with gradient avatars
- Highlight badges visible on each card
- Carousel auto-advances
- Cards have hover shadow
- Section animates in on scroll

### Out of Scope

- Dynamic testimonials from database (hardcoded in V1)
- Video testimonials (V2)
- "Leave a review" CTA (V2)

---

## T02: Add Comparison Table Section

### Objective

Add a NEW section to the homepage: a visual comparison table showing Rental Platform OS vs traditional brokers. This addresses the "why should I use you instead of a broker?" objection directly. The table uses animated check/cross marks that appear on scroll.

### Required Reading

- `src/components/public/animations/` — shared animation utilities
- No existing component to modify — this is entirely NEW

### Key Rules

1. Create `src/components/public/comparison-table.tsx` — a `"use client"` component.
2. **Table content** (6 comparison points):
   ```typescript
   const COMPARISONS = [
     {
       feature: "Brokerage Fee",
       rental-platform-os: "Zero brokerage",
       traditional: "1-2 months rent",
       platformWins: true,
     },
     {
       feature: "Listing Verification",
       rental-platform-os: "Every property physically verified",
       traditional: "No verification — fake listings common",
       platformWins: true,
     },
     {
       feature: "Pricing Transparency",
       rental-platform-os: "All costs shown upfront before visit",
       traditional: "Hidden charges revealed at signing",
       platformWins: true,
     },
     {
       feature: "Property Visits",
       rental-platform-os: "Guided tours at your convenience",
       traditional: "Broker shows you what earns them commission",
       platformWins: true,
     },
     {
       feature: "Response Time",
       rental-platform-os: "Under 5 minutes on WhatsApp",
       traditional: "Missed calls, voicemails, days of silence",
       platformWins: true,
     },
     {
       feature: "After Move-In Support",
       rental-platform-os: "First-month support included",
       traditional: "Broker disappears after the deal",
       platformWins: true,
     },
   ];
   ```
3. **Desktop layout**: A two-column comparison table with a center divider:
   ```
   Rental Platform OS                    Feature                    Traditional Broker
   ──────────────────────────────────────────────────────────────────────────
   ✓ Zero brokerage             Brokerage Fee              ✗ 1-2 months rent
   ✓ Every property verified    Listing Verification       ✗ No verification
   ...
   ```
   Use a clean table layout with `grid grid-cols-3 gap-x-4 items-center` per row. The center column (feature name) is muted and centered. Rental Platform OS column left-aligned with green check, traditional column right-aligned with red cross.
4. **Animated check/cross marks**: Each row's check and cross animate on scroll:
   ```tsx
   <motion.span
     initial={{ scale: 0 }}
     whileInView={{ scale: 1 }}
     viewport={{ once: true }}
     transition={{ type: "spring", stiffness: 300, delay: index * 0.1 }}
   >
     <CheckCircle2 className="h-5 w-5 text-emerald-500" />
   </motion.span>
   ```
   Checks pop in with spring animation. Crosses use `XCircle` with `text-red-400`.
5. **Mobile layout**: On mobile, switch to stacked cards (one per comparison point):
   ```tsx
   <div className="space-y-3">
     {COMPARISONS.map((comp) => (
       <div className="bg-white rounded-xl p-4 border border-slate-100">
         <p className="font-medium text-slate-900 text-sm">{comp.feature}</p>
         <div className="flex items-start gap-2 mt-2">
           <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
           <span className="text-sm text-slate-700">{comp.rental-platform-os}</span>
         </div>
         <div className="flex items-start gap-2 mt-1.5">
           <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
           <span className="text-sm text-slate-400">{comp.traditional}</span>
         </div>
       </div>
     ))}
   </div>
   ```
6. **Section heading and table headers**:
   ```tsx
   <SectionContainer className="bg-white" id="compare">
     <SectionReveal>
       <div className="text-center mb-12">
         <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
           Rental Platform OS vs Traditional Brokers
         </h2>
         <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
           See why tenants are switching to a better way to rent
         </p>
       </div>
     </SectionReveal>
     <ComparisonTable />
   </SectionContainer>
   ```
   Desktop table headers: "Rental Platform OS" (left, `text-emerald-600 font-semibold`), "Feature" (center, `text-slate-400`), "Traditional Broker" (right, `text-red-400 font-semibold`).
7. **Row striping**: Alternate row backgrounds (`even:bg-slate-50 odd:bg-white`) for readability.
8. Insert this section in `homepage/page.tsx` AFTER testimonials and BEFORE the tools preview (T03) or dual CTA.

### Deliverables

- [ ] `src/components/public/comparison-table.tsx` — client component with 6-row comparison (Rental Platform OS vs traditional), animated check/cross marks, responsive (table on desktop, cards on mobile)
- [ ] `src/app/(public)/homepage/page.tsx` — modified to render `<ComparisonTable />` in `SectionContainer` after testimonials

### Acceptance Criteria

1. Comparison table renders with 6 rows on desktop.
2. Green check marks appear next to Rental Platform OS advantages.
3. Red cross marks appear next to traditional broker disadvantages.
4. Check/cross marks animate in with spring pop on scroll.
5. On mobile, comparison renders as stacked cards (not a cramped table).
6. Rows have alternating background colors.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Scroll to comparison section. Verify:

- 6 comparison rows visible
- Green checks + red crosses animate on scroll
- Desktop: 3-column table layout
- Mobile: stacked card layout
- Alternating row backgrounds

### Out of Scope

- Interactive filter/toggle to show only specific comparison categories
- Real data from database (all comparison content is hardcoded)
- "Switch to Rental Platform OS" CTA within the table (the CTA section below handles conversion)

---

## T03: Add Tools Preview Section

### Objective

Add a NEW section that teases the upcoming tenant tools (Rent Calculator, Commute Estimator, Roommate Quiz) with visually appealing preview cards. Each card has an icon, title, brief description, and a "Coming Soon" badge or a link if Phase 18 is implemented. This section adds value by showing tenants that the platform offers more than just listings.

### Required Reading

- `notes/features/16-tenant-tools.md` — skim for tool names, descriptions, and what they will do
- `src/components/public/animations/` — shared animation utilities

### Key Rules

1. Create `src/components/public/tools-preview.tsx` — a `"use client"` component.
2. **Three tool cards**:
   ```typescript
   const TOOLS = [
     {
       icon: Calculator,
       title: "Rent Calculator",
       description:
         "Know your true move-in cost before you start looking. Factor in rent, deposit, brokerage, and setup expenses.",
       color: "blue",
       href: "/tools#rent-calculator", // links to tools page if it exists
     },
     {
       icon: MapPin,
       title: "Commute Estimator",
       description:
         "Compare commute times from different areas to your workplace. Factor in metro, bus, and auto routes.",
       color: "emerald",
       href: "/tools#commute-estimator",
     },
     {
       icon: Users,
       title: "Roommate Quiz",
       description:
         "Find out your roommate compatibility type. Match with like-minded flatmates based on lifestyle preferences.",
       color: "purple",
       href: "/tools#roommate-quiz",
     },
   ];
   ```
3. **Card design**: Each card is visually distinct with its `color` applied to the icon background and hover border:
   ```tsx
   <motion.div
     whileHover={{ y: -4 }}
     transition={{ type: "spring", stiffness: 300 }}
     className={cn(
       "group relative bg-white rounded-2xl p-6 lg:p-8 border border-slate-100 hover:border-${color}-200 transition-colors duration-300 cursor-pointer",
     )}
   >
     <div className={`w-14 h-14 rounded-2xl bg-${color}-50 flex items-center justify-center mb-5`}>
       <tool.icon className={`h-7 w-7 text-${color}-600`} />
     </div>
     <h3 className="text-lg font-semibold text-slate-900 group-hover:text-${color}-700 transition-colors">
       {tool.title}
     </h3>
     <p className="mt-2 text-sm text-slate-600 leading-relaxed">{tool.description}</p>
     <div className="mt-4 flex items-center text-sm font-medium text-${color}-600">
       Try it free{" "}
       <ArrowRight className="ml-1.5 h-4 w-4 group-hover:translate-x-1 transition-transform" />
     </div>
   </motion.div>
   ```
   **Important**: Since Tailwind cannot dynamically generate classes from variables, define the color variants explicitly using a mapping object:
   ```typescript
   const COLOR_MAP = {
     blue: {
       bg: "bg-blue-50",
       text: "text-blue-600",
       border: "hover:border-blue-200",
       hoverText: "group-hover:text-blue-700",
     },
     emerald: {
       bg: "bg-emerald-50",
       text: "text-emerald-600",
       border: "hover:border-emerald-200",
       hoverText: "group-hover:text-emerald-700",
     },
     purple: {
       bg: "bg-purple-50",
       text: "text-purple-600",
       border: "hover:border-purple-200",
       hoverText: "group-hover:text-purple-700",
     },
   };
   ```
   Use `COLOR_MAP[tool.color].bg` etc. in the className strings. This ensures Tailwind includes these classes in the build.
4. **Card hover**: Cards lift slightly on hover (`whileHover={{ y: -4 }}`) and the arrow icon slides right (`group-hover:translate-x-1`).
5. **Layout**: 3-column grid on desktop (`grid grid-cols-1 md:grid-cols-3 gap-6`). Each card same height.
6. **Section wrapper**:
   ```tsx
   <SectionContainer className="bg-slate-50" id="tools">
     <SectionReveal>
       <div className="text-center mb-12">
         <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Free Tenant Tools</h2>
         <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
           Plan your move with confidence using our free calculators and quizzes
         </p>
       </div>
     </SectionReveal>
     <StaggerChildren className="grid grid-cols-1 md:grid-cols-3 gap-6" staggerDelay={0.15}>
       {TOOLS.map((tool) => (
         <ToolCard key={tool.title} tool={tool} />
       ))}
     </StaggerChildren>
   </SectionContainer>
   ```
7. **Linking**: Each card wraps in a `<Link href={tool.href}>`. If Phase 18 tools are not yet live, the `/tools` page may show a "coming soon" state — that's fine. The cards should still link there. If Phase 18 IS live, the tools work immediately.
8. Insert in `homepage/page.tsx` AFTER the comparison table (T02) and BEFORE the dual CTA section.

### Deliverables

- [ ] `src/components/public/tools-preview.tsx` — client component with 3 tool preview cards (Calculator, Commute, Quiz), color-coded, hover lift, arrow animation, linked to /tools page
- [ ] `src/app/(public)/homepage/page.tsx` — modified to render `<ToolsPreview />` in `SectionContainer` after comparison table

### Acceptance Criteria

1. 3 tool preview cards render in a 3-column grid on desktop.
2. Each card has a distinct color theme (blue, emerald, purple).
3. Hovering lifts the card slightly and slides the arrow icon.
4. Cards are clickable and navigate to `/tools#section-anchor`.
5. On mobile, cards stack full-width.
6. Cards animate in with staggered reveal on scroll.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Scroll to tools section. Verify:

- 3 cards with different color themes
- Hover lifts card + arrow slides
- Click navigates to /tools page
- Mobile: cards stack
- Staggered reveal on scroll

### Out of Scope

- Actual tool implementation (Phase 18)
- Inline tool previews (interactive calculator widget embedded on homepage — too heavy)
- Animated illustrations for each tool (V2)

---

## T04: Redesign Dual CTA with Shimmer Buttons

### Objective

Replace the basic dual CTA section with a premium version featuring an animated gradient background, Magic UI ShimmerButton for the primary CTA, a secondary outline button, and a floating pattern or subtle particle effect. This is the last section before the footer — it needs to be the final conversion push.

### Required Reading

- `src/app/(public)/homepage/page.tsx` — current dual CTA section: 2-column grid with blue and emerald cards, basic buttons
- `src/components/magicui/shimmer-button.tsx` — ShimmerButton component API
- `src/components/public/animations/` — shared animation utilities

### Key Rules

1. **Replace the 2-card layout** with a single, full-width CTA block. The current dual-card approach (one for tenants, one for owners) splits attention. Instead, use a single powerful CTA section with a clear hierarchy:
   - **Primary message** (tenants): "Ready to Find Your New Home?"
   - **Secondary message** (owners): "Or list your property for free"
2. Create `src/components/public/cta-section.tsx` — a `"use client"` component.
3. **Background**: A gradient background with a subtle animated pattern. Two approaches (try option A first):
   - **Option A — CSS gradient animation**:
     ```tsx
     <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
       {/* Animated gradient orbs */}
       <div className="absolute inset-0 opacity-30">
         <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
         <div className="absolute top-0 -right-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
         <div className="absolute -bottom-8 left-20 w-72 h-72 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000" />
       </div>
     </section>
     ```
     The `animate-blob` keyframe needs to be added to `tailwind.config.ts`:
     ```typescript
     keyframes: {
       blob: {
         "0%": { transform: "translate(0px, 0px) scale(1)" },
         "33%": { transform: "translate(30px, -50px) scale(1.1)" },
         "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
         "100%": { transform: "translate(0px, 0px) scale(1)" },
       },
     },
     animation: {
       blob: "blob 7s infinite",
     },
     ```
     And a utility class for animation delay:
     ```css
     .animation-delay-2000 {
       animation-delay: 2s;
     }
     .animation-delay-4000 {
       animation-delay: 4s;
     }
     ```
     Add these delay utilities via a custom Tailwind plugin in `tailwind.config.ts` or as global CSS in `src/app/globals.css`.
   - **Option B — Reuse Particles** (if Option A doesn't look good): Use the same `Particles` component from the hero but with different settings (fewer particles, different color like purple-400).
4. **Content layout**: Centered text with stacked elements:
   ```
   [Subtle gradient background with animated orbs]
   [Content - relative z-10, centered]
     "Ready to Find Your New Home?"      (text-3xl sm:text-4xl lg:text-5xl font-bold text-white)
     "Browse verified properties..."       (text-lg text-slate-300 max-w-2xl mx-auto mt-4)
     [CTA buttons row - flex gap-4, centered, mt-8]
       [ShimmerButton: "Browse Listings"]  (primary, large)
       [Button outline: "WhatsApp Us"]     (secondary, white outline)
     "Own a property?"                     (text-sm text-slate-400 mt-8)
     [Link: "List it for free →"]          (text-blue-400 hover:text-blue-300 underline)
   ```
5. **ShimmerButton usage**:
   ```tsx
   <ShimmerButton className="h-12 px-8" onClick={() => router.push("/listings")}>
     <span className="text-base font-semibold text-white">Browse Listings</span>
   </ShimmerButton>
   ```
6. **Animation**: The entire CTA content animates in with `SectionReveal`:
   ```tsx
   <SectionReveal>
     <div className="relative z-10 text-center py-20 lg:py-28 px-4">...</div>
   </SectionReveal>
   ```
7. This section does NOT use `SectionContainer` because it has a custom full-width background (not the standard padded container). Use a bare `<section>` with the gradient classes.
8. **Remove the old dual CTA section** from `homepage/page.tsx` and replace with `<CTASection />`.

### Deliverables

- [ ] `src/components/public/cta-section.tsx` — client component with animated gradient background (blob orbs or particles), centered content, ShimmerButton primary CTA, outline secondary CTA, owner sub-CTA link
- [ ] `tailwind.config.ts` — modified to add `blob` keyframe animation (if using Option A)
- [ ] `src/app/globals.css` — (optional) add animation-delay utility classes if needed
- [ ] `src/app/(public)/homepage/page.tsx` — modified to render `<CTASection />` replacing the old dual CTA section

### Acceptance Criteria

1. CTA section renders with a dark gradient background.
2. Animated orbs or particles move subtly in the background.
3. "Browse Listings" button has a visible shimmer effect.
4. "WhatsApp Us" button is a white outline style.
5. "List it for free →" link is visible below the main CTAs.
6. All text is readable against the dark background.
7. Section animates in with blur-fade on scroll.
8. Old dual CTA section is removed.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Scroll to the bottom (before footer). Verify:

- Dark gradient background with animated orbs/particles
- "Browse Listings" button shimmers
- "WhatsApp Us" outline button visible
- Owner sub-CTA link visible and clickable
- Content is centered and readable
- Blob orbs animate slowly in the background

### Out of Scope

- A/B testing different CTA copy (V2)
- Countdown timer or urgency signal (V2)
- Email capture form in CTA section (newsletter is on contact page)

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
