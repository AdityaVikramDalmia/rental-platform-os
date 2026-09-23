---
id: P15-E04
title: Premium Homepage Core Sections Redesign
phase: 15
status: pending
depends_on: ["P15-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P15-E04: Premium Homepage Core Sections Redesign

## Overview

Redesign the four existing middle sections of the homepage — Featured Properties, Locality Search, How It Works, and Why Rental Platform OS — with premium animations and modern layout patterns. Featured Properties gets Magic Card hover effects and blur-fade reveals. Locality Search gets a glassmorphic elevated design. How It Works becomes an interactive scroll-triggered timeline focused on the tenant journey. Why Rental Platform OS transforms into an asymmetric Bento Grid with animated icons. Every section uses the shared animation utilities from E03-T02.

## Prerequisites

- **Read first**: [P15-E03 Completion Summary](P15-E03-premium-infrastructure-hero.md#completion-summary) — confirms Magic UI + Motion installed, shared animation utilities available.
- **Codebase facts to verify before starting**:
  - `src/components/magicui/blur-fade.tsx`, `number-ticker.tsx`, `shimmer-button.tsx` exist (installed in E03-T01)
  - `src/components/public/animations/` exists with `section-reveal.tsx`, `stagger-children.tsx`, `section-container.tsx` (created in E03-T02)
  - `src/components/public/hero-section.tsx` exists (created in E03-T03) — confirms the hero is extracted from `homepage/page.tsx`
  - `src/components/public/proof-strip.tsx` exists (created in E03-T04)
  - `motion` package is installed and `import { motion } from "motion/react"` works
  - The homepage currently renders: HeroSection → ProofStrip → LocalitySearch → FeaturedListings → "Why Choose Us" (inline) → TestimonialCarousel → "How It Works" (inline) → DualCTA

## Task Queue

- [ ] P15-E04-T01: Redesign Featured Properties with Premium Card Effects
- [ ] P15-E04-T02: Enhance Locality Search with Glassmorphic Design
- [ ] P15-E04-T03: Redesign How It Works with Scroll-Triggered Timeline
- [ ] P15-E04-T04: Redesign Why Rental Platform OS with Bento Grid Layout

---

## T01: Redesign Featured Properties with Premium Card Effects

### Objective

Upgrade the existing `featured-listings.tsx` carousel with premium card hover effects, blur-fade scroll reveal, animated "Verified" badges, and a more visually striking card design. The section should feel like browsing properties on a premium platform, not a basic listing page.

### Required Reading

- `src/components/public/featured-listings.tsx` — current implementation: Embla carousel with basic cards showing photo, BHK badge, rent, society name, "View Details" link
- `src/components/public/animations/` — shared animation utilities (SectionReveal, StaggerChildren, SectionContainer)
- Magic UI docs for any additional card animation components if needed

### Key Rules

1. **Do NOT replace the Embla carousel** — it works well and handles autoplay, responsive columns, and touch swiping. Instead, upgrade the individual listing CARDS within the carousel to be premium.
2. **Card redesign**: Each listing card gets:
   - `group` class on the card container for group-hover effects
   - Photo container: `overflow-hidden rounded-t-xl` with the image having `transition-transform duration-500 group-hover:scale-110` for a smooth zoom-on-hover effect
   - "Verified" badge overlay on the photo: positioned `absolute top-3 left-3` with a `CheckCircle` icon, `bg-emerald-500/90 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm` — appears with a subtle pulse animation using Motion:
     ```tsx
     <motion.div
       initial={{ scale: 0 }}
       animate={{ scale: 1 }}
       transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
       className="absolute top-3 left-3 ..."
     >
       <CheckCircle className="h-3.5 w-3.5 mr-1" /> Verified
     </motion.div>
     ```
   - Card shadow: `shadow-sm hover:shadow-xl transition-shadow duration-300`
   - Rent display: larger, bolder — `text-xl font-bold text-slate-900` with the rupee symbol
   - Society name: `text-sm text-slate-500` with `MapPin` icon inline
   - Bottom CTA area: "View Details" as a subtle link + WhatsApp icon button, both with hover effects
3. **Section wrapper**: Wrap the entire featured properties section in `<SectionContainer>` and `<SectionReveal>`:
   ```tsx
   <SectionContainer className="bg-white" id="featured">
     <SectionReveal>
       <div className="text-center mb-10">
         <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Featured Properties</h2>
         <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
           Hand-picked verified listings updated daily
         </p>
       </div>
       <FeaturedListings listings={featuredListings} />
     </SectionReveal>
   </SectionContainer>
   ```
4. **"View All Listings" button**: Replace the plain link with a more prominent styled button at the bottom of the section:
   ```tsx
   <div className="mt-10 text-center">
     <Button variant="outline" size="lg" asChild>
       <Link href="/listings">
         View All Listings <ArrowRight className="ml-2 h-4 w-4" />
       </Link>
     </Button>
   </div>
   ```
5. **Empty state upgrade**: If no listings exist, the empty state card should also look premium — use `bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center` with a large `Home` icon, heading, and a subtle animation (BlurFade reveal).
6. **Loading skeleton upgrade**: While `useQuery` is loading, show skeleton cards that match the new card design — `Skeleton` with matching height for photo area (`h-52`), title area, and detail lines.
7. The `FeaturedListings` component remains a `"use client"` component (it uses `useQuery`). The section heading and wrapper in `homepage/page.tsx` can be server-rendered.
8. Preserve ALL existing data-fetching logic. Do NOT change the Convex query, the data shape, or the listing card's data display (BHK, rent, society name). Only change the VISUAL presentation.

### Deliverables

- [ ] `src/components/public/featured-listings.tsx` — modified with premium card hover effects (image zoom, shadow transition, verified badge with spring animation), upgraded empty state, improved skeleton loading
- [ ] `src/app/(public)/homepage/page.tsx` — modified to wrap featured properties in `SectionContainer` + `SectionReveal`, add section heading with description, "View All" button

### Acceptance Criteria

1. Hovering over a listing card zooms the photo and increases the shadow.
2. "Verified" badge appears on each card with a spring animation on load.
3. Section heading and description render above the carousel.
4. "View All Listings" button renders below the carousel.
5. Empty state shows the upgraded design with dashed border.
6. Skeleton cards match the new card dimensions during loading.
7. Carousel autoplay and responsive columns still work as before.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Scroll to Featured Properties. Verify:

- Cards show photo zoom on hover
- "Verified" badge animates in (spring pop effect)
- Shadow increases on card hover
- "View All Listings" button present
- Carousel still auto-scrolls
- Mobile: cards still responsive

### Out of Scope

- Wishlist/favorite button (P16)
- Quick view modal (P17)
- Filtering within the carousel (not a homepage feature)
- Changing the Convex query or data fetching logic

---

## T02: Enhance Locality Search with Glassmorphic Design

### Objective

Upgrade the locality search section from a plain form on a white card to an elevated glassmorphic design with subtle backdrop blur, refined spacing, and micro-interactions on the form inputs. The search section should feel like a premium search experience, not a basic form.

### Required Reading

- `src/components/public/locality-search.tsx` — current implementation: text input + 3 Select dropdowns + search button in a basic card
- `src/components/public/animations/` — shared animation utilities

### Key Rules

1. **Glassmorphic card**: Replace the current `bg-white` card with a glassmorphic design:
   ```
   bg-white/70 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl
   ```
   The section background should be a subtle gradient: `bg-gradient-to-b from-slate-50 to-white`.
2. **Form layout upgrade**: Keep the same 4-field layout (search input + 3 selects + button) but with enhanced styling:
   - Search input: larger, with a `Search` icon inside (`relative` container with `absolute left-3` icon), `h-12 pl-10 rounded-xl` for the input
   - Select dropdowns: `h-12 rounded-xl` to match input height
   - Search button: full-width on mobile, icon-only variant on desktop sidepanel layout. Use `bg-blue-600 hover:bg-blue-700 h-12 rounded-xl px-8` with a `Search` icon
3. **Section heading**: Above the search card, add:
   ```
   "Find Your Perfect Rental"  (text-3xl font-bold)
   "Search by area, budget, or property type"  (text-slate-600)
   ```
   Wrap in `SectionReveal`.
4. **Input focus effects**: Add `focus-within` styling on the card container — when any input is focused, the card gets a brighter shadow:
   ```
   [&:has(:focus-visible)]:shadow-blue-200/50 [&:has(:focus-visible)]:border-blue-200
   ```
   (The `has()` CSS selector is supported in all modern browsers since 2024.)
5. **Quick filter chips**: Below the main search form, add a row of suggested search chips (clickable pills):
   ```typescript
   const QUICK_SEARCHES = [
     { label: "Under ₹20k", params: { budget: "under-20k" } },
     { label: "2 BHK", params: { type: "2bhk" } },
     { label: "HSR Layout", params: { locality: "hsr-layout" } },
     { label: "Demo District", params: { locality: "koramangala" } },
     { label: "Near Metro", params: { q: "metro" } },
   ];
   ```
   Chips: `bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-full px-4 py-1.5 text-sm font-medium cursor-pointer transition-colors`. Clicking a chip populates the corresponding form field(s) and triggers the search.
6. Wrap the entire section in `<SectionContainer className="bg-gradient-to-b from-slate-50 to-white">` and `<SectionReveal>`.
7. Preserve ALL existing search logic (router.push with query params). Only change the visual design and add the quick filter chips.
8. The component remains `"use client"` — it uses `useState` and `useRouter`.

### Deliverables

- [ ] `src/components/public/locality-search.tsx` — modified with glassmorphic card, larger inputs, focus-within effects, quick filter chips row
- [ ] `src/app/(public)/homepage/page.tsx` — modified to wrap locality search section in `SectionContainer` + `SectionReveal`, add section heading

### Acceptance Criteria

1. Search card has a frosted glass appearance (semi-transparent white with blur).
2. Focusing any input adds a blue-tinted shadow to the card container.
3. Quick filter chips render below the form.
4. Clicking a chip populates the form and triggers search.
5. All inputs are `h-12` (taller than default) with `rounded-xl`.
6. Section has a subtle gradient background (slate-50 to white).
7. Existing search logic (router.push) still works identically.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Scroll to the search section. Verify:

- Card appears glass-like (can see a hint of background through it)
- Focus on search input → card shadow changes to blue tint
- Quick filter chips visible below form
- Click "2 BHK" chip → property type select updates → triggers search
- Mobile: inputs stack vertically, button goes full-width

### Out of Scope

- Auto-complete / typeahead on the search input (P16)
- Real-time listing count ("23 listings match") (P16)
- Map-based search (V2)

---

## T03: Redesign How It Works with Scroll-Triggered Timeline

### Objective

Replace the basic 4-step card grid with an interactive, scroll-triggered vertical timeline for the tenant journey (Search → Shortlist → Visit → Apply → Move In → Settle). Each step reveals with a blur-fade animation as the user scrolls. Steps have expanded descriptions, estimated duration badges, and lucide icons. This is tenant-focused only — no guard journey.

### Required Reading

- `src/app/(public)/homepage/page.tsx` — current "How It Works" inline section: 4 basic cards (Search, Visit, Move In, Enjoy), "Learn More" link
- `src/components/public/process-timeline.tsx` — the full 6-step timeline component used on the How-It-Works PAGE (for reference — we can draw inspiration from it but the homepage version should be simpler/condensed)
- `src/components/public/animations/` — shared animation utilities

### Key Rules

1. Create `src/components/public/homepage-timeline.tsx` — a NEW `"use client"` component for the homepage version of "How It Works." Do NOT reuse the full `process-timeline.tsx` from the how-it-works page — the homepage version is simpler (4 steps, not 6) and has a different visual treatment.
2. **Timeline layout**: Vertical timeline with a visible connecting line. On desktop, steps alternate left/right (zigzag). On mobile, all steps align left with the timeline line on the left edge.

   ```
   Desktop layout:
   ──────── Step 1 (right)
             |
   Step 2 ──────────
             |
   ──────── Step 3 (right)
             |
   Step 4 ──────────

   Mobile layout:
   | Step 1
   | Step 2
   | Step 3
   | Step 4
   ```

3. **Steps content** (4 steps, tenant journey only):
   ```typescript
   const STEPS = [
     {
       number: 1,
       icon: Search,
       title: "Search & Shortlist",
       description:
         "Browse verified listings filtered by area, budget, and BHK. Save your favorites and compare properties side by side.",
       duration: "Day 1-3",
     },
     {
       number: 2,
       icon: Calendar,
       title: "Schedule a Visit",
       description:
         "Pick a time slot that works for you. Our team coordinates a guided property tour — no awkward broker calls.",
       duration: "Day 3-7",
     },
     {
       number: 3,
       icon: FileText,
       title: "Apply & Sign",
       description:
         "Submit your rental application. We handle the paperwork, owner verification, and agreement preparation.",
       duration: "Day 7-14",
     },
     {
       number: 4,
       icon: Home,
       title: "Move In & Settle",
       description:
         "Collect your keys and move in. Our team supports you through the first month — utilities, society registration, everything.",
       duration: "Month 1",
     },
   ];
   ```
4. **Step card design**: Each step card has:
   - A numbered circle on the timeline line (`w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm`)
   - A content card (`bg-white rounded-xl p-6 shadow-sm border border-slate-100`) containing:
     - Icon in a blue circle (`w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center`)
     - Title (`text-xl font-semibold text-slate-900`)
     - Description (`text-sm text-slate-600 mt-2`)
     - Duration badge (`inline-flex items-center bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1 rounded-full mt-3`)
   - A connecting line segment between steps (`w-0.5 bg-slate-200` centered on the timeline)
5. **Scroll animation**: Each step card reveals with `BlurFade` as it enters the viewport:
   ```tsx
   {
     STEPS.map((step, index) => (
       <BlurFade key={step.number} delay={index * 0.15} inView>
         <StepCard step={step} isEven={index % 2 === 0} />
       </BlurFade>
     ));
   }
   ```
   Steps stagger with 0.15s delay between each, creating a cascading reveal as user scrolls.
6. **"Learn More" CTA**: Below the timeline, a centered button:
   ```tsx
   <BlurFade delay={STEPS.length * 0.15} inView>
     <div className="text-center mt-12">
       <Button variant="outline" size="lg" asChild>
         <Link href="/how-it-works">
           See the Full Process <ArrowRight className="ml-2 h-4 w-4" />
         </Link>
       </Button>
     </div>
   </BlurFade>
   ```
7. **Section wrapper**: In `homepage/page.tsx`, replace the inline "How It Works" section with:
   ```tsx
   <SectionContainer className="bg-slate-50" id="how-it-works">
     <SectionReveal>
       <div className="text-center mb-12">
         <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">How It Works</h2>
         <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
           From search to move-in, we handle the heavy lifting
         </p>
       </div>
     </SectionReveal>
     <HomepageTimeline />
   </SectionContainer>
   ```
8. The zigzag layout on desktop uses flexbox with `flex-row-reverse` on even items:
   ```tsx
   <div className={cn("flex items-center gap-8", index % 2 === 0 ? "flex-row" : "flex-row-reverse")}>
   ```
   On mobile (`md:` breakpoint), ALL steps use `flex-row` (no zigzag — timeline on left, content on right).
9. **Remove the old inline How It Works section** from `homepage/page.tsx` completely. The new `HomepageTimeline` component replaces it.

### Deliverables

- [ ] `src/components/public/homepage-timeline.tsx` — client component with 4-step vertical timeline, alternating left/right on desktop, linear on mobile, BlurFade scroll reveal per step, duration badges, "See the Full Process" CTA
- [ ] `src/app/(public)/homepage/page.tsx` — modified to render `<HomepageTimeline />` in a `SectionContainer`, replacing the old inline How It Works section

### Acceptance Criteria

1. `/homepage` shows the new timeline in the How It Works section.
2. 4 steps visible with numbered circles on a vertical line.
3. Steps alternate left/right on desktop (zigzag pattern).
4. Steps align left on mobile (no zigzag).
5. Each step reveals with a blur-fade animation as user scrolls to it.
6. Duration badges show on each step ("Day 1-3", "Day 3-7", etc.).
7. "See the Full Process" button links to `/how-it-works`.
8. Old inline How It Works section is removed.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Scroll to "How It Works." Verify:

- 4 steps with numbered circles and connecting line
- Desktop: steps alternate left/right
- Mobile (resize): steps align left
- Scroll slowly: each step animates in separately (staggered)
- "See the Full Process" button links to /how-it-works

### Out of Scope

- The full 6-step process timeline (that's on the `/how-it-works` page, already built)
- Guard journey visualization (removed from homepage by design)
- Interactive expand/collapse per step (homepage version is static — the how-it-works page has interactive steps)

---

## T04: Redesign Why Rental Platform OS with Bento Grid Layout

### Objective

Replace the basic 6-card grid "Why Choose Us" section with an asymmetric Bento Grid layout using 5 feature cards of varying sizes. Cards reveal with staggered blur-fade animations. Each card has an animated icon that appears when the card enters the viewport. The section title changes from "Why Choose DemoRentals" to "Why Rental Platform OS" and the copy is rewritten to emphasize unique differentiators.

### Required Reading

- `src/app/(public)/homepage/page.tsx` — current "Why Choose DemoRentals" inline section: 6 equal cards in a 3-column grid with icon circles, titles, and descriptions
- `src/components/public/animations/` — shared animation utilities (SectionReveal, StaggerChildren)
- Bento Grid layout references: https://magicui.design/docs/components/bento-grid (if Magic UI has a bento-grid component, install it; if not, build with CSS Grid)

### Key Rules

1. Install Magic UI's Bento Grid component if available: `npx shadcn@latest add "https://magicui.design/r/bento-grid"`. If the installation fails or the component doesn't exist at that URL, build a custom bento grid using CSS Grid (see step 2). Check the Magic UI docs at https://magicui.design/docs/components/bento-grid before attempting installation.
2. **Custom Bento Grid (if Magic UI component is unavailable)**: Use CSS Grid with `grid-template-columns` and `grid-row` spanning:

   ```css
   .bento-grid {
     display: grid;
     grid-template-columns: repeat(3, 1fr);
     grid-template-rows: auto;
     gap: 1rem;
   }
   ```

   Card sizes:
   - Card 1 (Verified Listings): spans 2 columns, 1 row — `col-span-2` (large, hero card)
   - Card 2 (Zero Brokerage): spans 1 column, 1 row — standard
   - Card 3 (Direct Owner Contact): spans 1 column, 1 row — standard
   - Card 4 (Guided Visits): spans 1 column, 1 row — standard
   - Card 5 (Transparent Pricing): spans 2 columns, 1 row — `col-span-2` (large, bottom card)

   On mobile: `grid-cols-1` — all cards full width, stacked.
   On tablet: `sm:grid-cols-2` — 2 columns, large cards still span 2 (`sm:col-span-2`).

3. **Card content** (5 cards, rewritten for differentiation):
   ```typescript
   const FEATURES = [
     {
       icon: ShieldCheck,
       title: "Verified Listings Only",
       description:
         "Every property is physically verified before it goes live. No fake photos, no phantom listings, no wasted visits. What you see is what you get.",
       size: "large", // col-span-2
       gradient: "from-blue-50 to-blue-100/50",
     },
     {
       icon: BadgeIndianRupee,
       title: "Zero Brokerage",
       description: "No broker fees. No hidden charges. You pay rent and deposit — that's it.",
       size: "standard",
       gradient: "from-emerald-50 to-emerald-100/50",
     },
     {
       icon: UserCheck,
       title: "Direct Owner Contact",
       description:
         "Chat directly with property owners through our platform. No middlemen, no commission games.",
       size: "standard",
       gradient: "from-amber-50 to-amber-100/50",
     },
     {
       icon: MapPin,
       title: "Guided Property Visits",
       description:
         "Schedule visits at your convenience. Our local team accompanies you — no awkward broker tours.",
       size: "standard",
       gradient: "from-purple-50 to-purple-100/50",
     },
     {
       icon: Receipt,
       title: "Transparent Pricing",
       description:
         "Rent, deposit, maintenance, and move-in costs — all shown upfront before you visit. Compare properties on equal terms. No surprises at signing.",
       size: "large", // col-span-2
       gradient: "from-rose-50 to-rose-100/50",
     },
   ];
   ```
4. **Card design**: Each card uses:
   ```tsx
   <div
     className={cn(
       "group relative overflow-hidden rounded-2xl border border-slate-100 p-6 lg:p-8 transition-all duration-300 hover:shadow-lg hover:border-slate-200",
       `bg-gradient-to-br ${feature.gradient}`,
       feature.size === "large" ? "sm:col-span-2" : "",
     )}
   >
     {/* Animated icon */}
     <motion.div
       initial={{ scale: 0, rotate: -10 }}
       whileInView={{ scale: 1, rotate: 0 }}
       viewport={{ once: true }}
       transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
       className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center mb-4"
     >
       <feature.icon className="h-6 w-6 text-blue-600" />
     </motion.div>
     <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
     <p className="mt-2 text-sm text-slate-600 leading-relaxed">{feature.description}</p>
   </div>
   ```
5. **Section heading**:
   ```tsx
   <SectionContainer className="bg-white" id="why-rental-platform-os">
     <SectionReveal>
       <div className="text-center mb-12">
         <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Why Rental Platform OS</h2>
         <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
           What makes finding a home with us different
         </p>
       </div>
     </SectionReveal>
     <WhyPlatformGrid />
   </SectionContainer>
   ```
6. Create `src/components/public/why-rental-platform-os.tsx` — a `"use client"` component (needs Motion for icon animations). This replaces the inline "Why Choose DemoRentals" section in `homepage/page.tsx`.
7. **StaggerChildren on the grid**: Wrap the grid in `StaggerChildren` so cards reveal one by one:
   ```tsx
   <StaggerChildren
     className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
     staggerDelay={0.1}
   >
     {FEATURES.map((feature) => (
       <FeatureCard key={feature.title} feature={feature} />
     ))}
   </StaggerChildren>
   ```
8. **Remove the old inline "Why Choose DemoRentals" section** from `homepage/page.tsx` completely.

### Deliverables

- [ ] `src/components/public/why-rental-platform-os.tsx` — client component with 5-card asymmetric bento grid, animated icons (spring animation on viewport entry), gradient card backgrounds, staggered reveal
- [ ] `src/components/magicui/bento-grid.tsx` — (optional) installed via Magic UI CLI if available; if not, skip and use custom CSS Grid in the component
- [ ] `src/app/(public)/homepage/page.tsx` — modified to render `<WhyPlatform />` in `SectionContainer`, replacing old "Why Choose DemoRentals" section

### Acceptance Criteria

1. 5 feature cards render in a bento grid layout (2 large spanning 2 columns, 3 standard).
2. Cards have distinct gradient backgrounds (blue, emerald, amber, purple, rose).
3. Icons animate in with a spring pop effect when scrolled into view.
4. Cards reveal with staggered delays (0s, 0.1s, 0.2s, ...).
5. Large cards visually span 2 columns on desktop.
6. On mobile, all cards are full-width stacked.
7. Card hover increases shadow.
8. Old "Why Choose DemoRentals" section is removed.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Scroll to "Why Rental Platform OS." Verify:

- 5 cards in asymmetric grid (2 large + 3 standard)
- Each card has a different pastel gradient
- Icons pop in with spring animation
- Staggered reveal on scroll
- Mobile: cards stack full-width
- Hover: shadow increases on each card

### Out of Scope

- "24/7 Support" card (removed — not a V1 differentiator; replaced with "Transparent Pricing")
- "Trusted by Thousands" card (social proof moved to Proof Strip section)
- Interactive expand/collapse on cards
- Animated illustrations or Lottie icons (plain lucide icons suffice)

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
