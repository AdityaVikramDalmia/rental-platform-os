---
id: P15-E03
title: Premium Component Infrastructure & Hero Redesign
phase: 15
status: pending
depends_on: ["P15-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P15-E03: Premium Component Infrastructure & Hero Redesign

## Overview

Install the premium animation stack (Magic UI, Aceternity UI, Motion), create shared animation utility components for consistent scroll-triggered reveals and section transitions, then redesign the homepage hero section with animated particle/aurora backgrounds, gradient text effects, animated number counters, and shimmer CTA buttons. Add a new Proof Strip section below the hero with an infinite-scrolling logo marquee and animated trust metrics. This epic transforms the homepage from a "solid template" to a "premium SaaS-tier" first impression.

## Prerequisites

- **Read first**: The existing homepage implementation at `src/app/(public)/homepage/page.tsx` — currently has 8 sections with basic Tailwind styling. This epic REPLACES Section 1 (Hero) and INSERTS a new Section 2 (Proof Strip) after the hero.
- **Codebase facts to verify before starting**:
  - `src/app/(public)/homepage/page.tsx` exists and renders at `/homepage`
  - `src/components/public/` directory contains all existing public components (header.tsx, footer.tsx, featured-listings.tsx, locality-search.tsx, testimonial-carousel.tsx, etc.)
  - `src/components/ui/` has 26 shadcn/ui components installed (including carousel.tsx, accordion.tsx)
  - `package.json` has `tailwindcss`, `@radix-ui/*`, `lucide-react` — the existing Tailwind + shadcn stack
  - Framer Motion is NOT yet installed (Motion library). Magic UI and Aceternity UI are NOT yet installed.
  - The project uses Next.js App Router with `"use client"` directives for interactive components.
  - All existing homepage sections use plain Tailwind utility classes — no animation library.

## Task Queue

- [ ] P15-E03-T01: Install Premium Animation Dependencies
- [ ] P15-E03-T02: Create Shared Animation Utility Components
- [ ] P15-E03-T03: Redesign Hero Section with Premium Animations
- [ ] P15-E03-T04: Add Proof Strip Section (Logo Marquee + Trust Metrics)

---

## T01: Install Premium Animation Dependencies

### Objective

Install Magic UI, Aceternity UI utility functions, and the Motion animation library (Framer Motion). Configure any required Tailwind plugins. Verify all packages resolve correctly and `npx tsc --noEmit` passes.

### Required Reading

- `package.json` — current dependencies, verify no conflicts
- `tailwind.config.ts` or `tailwind.config.js` — current Tailwind configuration, theme extensions
- Magic UI installation guide: https://magicui.design/docs/installation — uses the shadcn CLI `npx shadcn@latest add` pattern

### Key Rules

1. Install the Motion animation library (the Framer Motion successor): `npm install motion`. This is the core animation engine that both Magic UI and Aceternity UI components depend on. Import from `"motion/react"` (NOT `"framer-motion"` — the package was renamed).
2. Magic UI components are installed individually via the shadcn CLI pattern. Do NOT install a bulk `@magicui/*` package. Each component is added one at a time as needed in later tasks. In THIS task, install the foundational components that will be reused across multiple sections:
   - `npx shadcn@latest add "https://magicui.design/r/blur-fade"` — scroll-reveal wrapper, used in EVERY section
   - `npx shadcn@latest add "https://magicui.design/r/number-ticker"` — animated counters, used in hero + proof strip
   - `npx shadcn@latest add "https://magicui.design/r/shimmer-button"` — premium CTA buttons, used in hero + dual CTA
   - `npx shadcn@latest add "https://magicui.design/r/marquee"` — infinite scroll, used in proof strip
   - `npx shadcn@latest add "https://magicui.design/r/particles"` — particle background, used in hero
   - `npx shadcn@latest add "https://magicui.design/r/animated-gradient-text"` — gradient text, used in hero headline
3. Each Magic UI component installs into `src/components/magicui/` (NOT `src/components/ui/`). The shadcn CLI creates this directory automatically. Do NOT move them to `src/components/ui/` — keep the separation clean.
4. Aceternity UI components are NOT installed via CLI — they are copy-pasted. Do NOT install any Aceternity packages in this task. Aceternity components will be added as individual files in later tasks when needed. The only dependency Aceternity components need is `motion` (already installed in step 1) and `clsx`/`tailwind-merge` (already installed via shadcn/ui).
5. After installing Motion, verify the import works in the project's TypeScript config. The import path should be `"motion/react"`:
   ```typescript
   import { motion } from "motion/react";
   ```
   If TypeScript cannot resolve `"motion/react"`, check `tsconfig.json` `moduleResolution` — it should be `"bundler"` (Next.js default).
6. Check if `tailwind.config.ts` needs animation keyframe extensions. Magic UI components often use custom keyframes. The Magic UI CLI should handle this automatically by updating the Tailwind config during component installation. Verify after installation that any new `keyframes` and `animation` entries are present in the Tailwind config.
7. Run `npx tsc --noEmit` after ALL installations to ensure no type errors were introduced.
8. Do NOT modify any existing components in this task. This is purely dependency installation.

### Deliverables

- [ ] `motion` package installed — `npm install motion` — verify `import { motion } from "motion/react"` resolves
- [ ] `src/components/magicui/blur-fade.tsx` — installed via `npx shadcn@latest add "https://magicui.design/r/blur-fade"`
- [ ] `src/components/magicui/number-ticker.tsx` — installed via `npx shadcn@latest add "https://magicui.design/r/number-ticker"`
- [ ] `src/components/magicui/shimmer-button.tsx` — installed via `npx shadcn@latest add "https://magicui.design/r/shimmer-button"`
- [ ] `src/components/magicui/marquee.tsx` — installed via `npx shadcn@latest add "https://magicui.design/r/marquee"`
- [ ] `src/components/magicui/particles.tsx` — installed via `npx shadcn@latest add "https://magicui.design/r/particles"`
- [ ] `src/components/magicui/animated-gradient-text.tsx` — installed via `npx shadcn@latest add "https://magicui.design/r/animated-gradient-text"`
- [ ] `tailwind.config.ts` — updated with any Magic UI keyframes/animations (auto-handled by CLI)

### Acceptance Criteria

1. `npm ls motion` shows the package installed.
2. `src/components/magicui/` directory contains at least 6 component files (blur-fade, number-ticker, shimmer-button, marquee, particles, animated-gradient-text).
3. A test import `import { motion } from "motion/react"` in any `.tsx` file does NOT produce TypeScript errors.
4. A test import `import BlurFade from "@/components/magicui/blur-fade"` resolves correctly.
5. `npx tsc --noEmit` passes with zero errors.
6. `npm run build` passes (no build-time errors from new packages).
7. No existing components were modified.

### Verification

```bash
npm install motion
npx shadcn@latest add "https://magicui.design/r/blur-fade"
npx shadcn@latest add "https://magicui.design/r/number-ticker"
npx shadcn@latest add "https://magicui.design/r/shimmer-button"
npx shadcn@latest add "https://magicui.design/r/marquee"
npx shadcn@latest add "https://magicui.design/r/particles"
npx shadcn@latest add "https://magicui.design/r/animated-gradient-text"
npx tsc --noEmit
npm run build
```

Check that `src/components/magicui/` directory exists with component files. Verify `package.json` shows `motion` in dependencies. Check `tailwind.config.ts` for any new keyframe entries.

### Out of Scope

- Installing ALL Magic UI components (only install the ones needed by E03-E06)
- Aceternity UI component files (added in later tasks as needed)
- Modifying any existing component or page
- GSAP, Three.js, Lottie — not needed for this redesign

---

## T02: Create Shared Animation Utility Components

### Objective

Create reusable animation wrapper components that will be used consistently across ALL homepage sections: a `SectionReveal` wrapper for scroll-triggered section entrance animations, a `StaggerChildren` wrapper for staggering child element animations, and a `SectionContainer` layout wrapper that standardizes section spacing, max-width, and background alternation. These ensure visual consistency — every section animates the same way.

### Required Reading

- `src/app/(public)/homepage/page.tsx` — current section structure and spacing patterns (alternating `bg-white` / `bg-slate-50`, consistent `py-12 lg:py-20` padding)
- `src/components/magicui/blur-fade.tsx` — the Magic UI BlurFade component installed in T01. Understand its props: `delay`, `inView`, `yOffset`, `blur`, `duration`.
- Motion documentation: `whileInView`, `variants`, `staggerChildren` pattern

### Key Rules

1. Create `src/components/public/animations/section-reveal.tsx` — a `"use client"` wrapper component that uses Magic UI's `BlurFade` to animate its children into view when scrolled to. Props:
   ```typescript
   type SectionRevealProps = {
     children: React.ReactNode;
     delay?: number; // delay before animation starts (default: 0)
     className?: string; // additional classes on the wrapper div
   };
   ```
   Implementation: wraps children in `<BlurFade delay={delay} inView>`. The `inView` prop makes it trigger when scrolled into viewport. Default `yOffset` is fine (8px upward).
2. Create `src/components/public/animations/stagger-children.tsx` — a `"use client"` wrapper that renders its children with staggered `BlurFade` delays. Props:
   ```typescript
   type StaggerChildrenProps = {
     children: React.ReactNode;
     baseDelay?: number; // delay for the first child (default: 0)
     staggerDelay?: number; // additional delay per child (default: 0.05)
     className?: string; // classes on the container div
   };
   ```
   Implementation: uses `React.Children.map` to wrap each child in `<BlurFade delay={baseDelay + index * staggerDelay} inView>`. The container div uses `className` for grid/flex layout.
3. Create `src/components/public/animations/section-container.tsx` — a server component (NO `"use client"`) that standardizes section layout. Props:
   ```typescript
   type SectionContainerProps = {
     children: React.ReactNode;
     className?: string; // additional classes (e.g., background color)
     id?: string; // anchor ID for deep linking
     fullWidth?: boolean; // if true, no max-width constraint (default: false)
   };
   ```
   Implementation: renders a `<section>` with consistent padding (`py-16 lg:py-24`), a centered container (`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`), and the `className` prop for background overrides. If `fullWidth` is true, skip the max-width container and let children fill full width.
4. Create an index barrel file `src/components/public/animations/index.ts` that re-exports all three components for clean imports:
   ```typescript
   export { SectionReveal } from "./section-reveal";
   export { StaggerChildren } from "./stagger-children";
   export { SectionContainer } from "./section-container";
   ```
5. These utility components REPLACE direct use of Tailwind spacing in section wrappers. When T03 and T04 redesign sections, they should use `<SectionContainer>` for layout and `<SectionReveal>` / `<StaggerChildren>` for animations.
6. **Important**: `SectionContainer` is a server component. `SectionReveal` and `StaggerChildren` are client components. A server component can render client components as children — this is fine in Next.js App Router. Do NOT make `SectionContainer` a client component.
7. The `StaggerChildren` component must handle both array children (multiple elements) and single children gracefully. Use `React.Children.toArray()` to normalize.
8. All components must be fully typed with proper TypeScript props interfaces. No `any` types.

### Deliverables

- [ ] `src/components/public/animations/section-reveal.tsx` — client component, `BlurFade`-based scroll reveal wrapper
- [ ] `src/components/public/animations/stagger-children.tsx` — client component, staggered `BlurFade` per child
- [ ] `src/components/public/animations/section-container.tsx` — server component, standardized section layout (padding, max-width, id, background)
- [ ] `src/components/public/animations/index.ts` — barrel export file

### Acceptance Criteria

1. All 4 files exist in `src/components/public/animations/`.
2. `SectionReveal` renders children wrapped in `BlurFade` with `inView` prop.
3. `StaggerChildren` renders N children with delays `[0, 0.05, 0.10, 0.15, ...]` by default.
4. `SectionContainer` renders a `<section>` with `py-16 lg:py-24` and centered max-width container.
5. `SectionContainer` with `fullWidth={true}` skips the max-width constraint.
6. All components accept and pass through `className` props.
7. `npx tsc --noEmit` passes.
8. Importing `import { SectionReveal, StaggerChildren, SectionContainer } from "@/components/public/animations"` resolves.

### Verification

```bash
npx tsc --noEmit
```

Create a temporary test page that imports all three components and renders them. Verify no TypeScript errors. Delete the test page after verification.

### Out of Scope

- Modifying existing homepage sections (that's T03 and T04)
- Page transition animations (V2)
- Parallax scroll effects (not in this epic — evaluated in E06)

---

## T03: Redesign Hero Section with Premium Animations

### Objective

Replace the existing static gradient hero with a premium animated hero section featuring: a dark particle/aurora animated background, animated gradient text for the headline, animated Number Ticker counters for trust stats, and shimmer-effect CTA buttons. The hero should look like a Linear.app or Vercel.com quality landing section.

### Required Reading

- `src/app/(public)/homepage/page.tsx` — current hero section implementation (lines ~30-90 approximately). The hero currently uses `bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900` with static text and glassmorphic stat cards.
- `src/components/magicui/particles.tsx` — Particles background component API and props
- `src/components/magicui/animated-gradient-text.tsx` — AnimatedGradientText component API
- `src/components/magicui/number-ticker.tsx` — NumberTicker component API (props: `value`, `delay`, `decimalPlaces`, `className`)
- `src/components/magicui/shimmer-button.tsx` — ShimmerButton component API
- `notes/features/15-public-pages.md` — Hero section spec: headline, subheadline, CTAs, trust counters

### Key Rules

1. Extract the hero into a NEW client component: `src/components/public/hero-section.tsx` (with `"use client"` directive). The current hero is inline in `homepage/page.tsx` — extract it into a dedicated component for cleaner code and because it needs client-side animation libraries.
2. **Background**: Replace the static gradient with the Magic UI `Particles` component. Use a dark background (`bg-slate-950`) with the Particles overlay. Particles config:
   ```tsx
   <Particles
     className="absolute inset-0"
     quantity={80}
     staticity={30}
     ease={50}
     color="#60a5fa" // blue-400
     refresh
   />
   ```
   The section wrapper needs `relative overflow-hidden` for the absolute-positioned Particles. Use `min-h-[80vh] lg:min-h-[90vh]` for hero height (not full viewport — leave a peek of the next section).
3. **Headline**: Replace the plain `<h1>` with Magic UI `AnimatedGradientText` for the eyebrow/label, and use a regular `<h1>` with gradient text via Tailwind for the main headline:
   ```tsx
   <AnimatedGradientText>
     <span className="text-sm font-medium">DemoRentals Rentals</span>
   </AnimatedGradientText>
   <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight bg-gradient-to-r from-white via-blue-100 to-blue-400 bg-clip-text text-transparent">
     Find your next rental home without the usual stress
   </h1>
   ```
   The headline must animate in using `SectionReveal` or a direct `motion.h1` with `initial={{ opacity: 0, y: 20 }}` and `animate={{ opacity: 1, y: 0 }}`. Subheadline appears 0.2s after headline.
4. **CTA Buttons**: Replace plain shadcn Buttons with Magic UI `ShimmerButton` for the primary CTA ("Browse Listings") and keep a regular outlined button for the secondary ("WhatsApp Us"):
   ```tsx
   <ShimmerButton className="..." onClick={() => router.push("/listings")}>
     <span className="text-sm font-medium text-white">Browse Listings</span>
   </ShimmerButton>
   <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" asChild>
     <a href={`https://wa.me/${process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}`} target="_blank" rel="noopener noreferrer">
       <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp Us
     </a>
   </Button>
   ```
   Buttons animate in together, 0.4s after the subheadline.
5. **Trust Stats**: Replace the static glassmorphic cards with animated Number Ticker counters. Three stats:
   - "500+" Properties Managed → `<NumberTicker value={500} />` with a "+" suffix
   - "2,000+" Happy Tenants → `<NumberTicker value={2000} />`
   - "3" Cities → `<NumberTicker value={3} />`

   Each stat is in a card with glassmorphic styling: `bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4`. Stats animate in with `StaggerChildren` (delay offset 0.6s from page load). The Number Ticker components count up from 0 when they enter the viewport — this is their default behavior with `delay` prop to control when counting starts.

6. **Layout**: Vertically centered content within the hero:
   ```
   [Particles background - absolute, covers full hero]
   [Content - relative z-10, flex flex-col items-center text-center]
     [AnimatedGradientText eyebrow]
     [Main headline - gradient text]
     [Subheadline - text-lg text-slate-300]
     [CTA buttons row - flex gap-4, centered]
     [Trust stats row - grid grid-cols-3 gap-6, max-w-lg mx-auto]
   ```
7. **Mobile responsiveness**: On mobile (`< sm`), trust stat cards stack to `grid-cols-1`, CTA buttons stack vertically (`flex-col`), headline is `text-3xl`, hero height is `min-h-[70vh]`. Particles quantity reduces on mobile — use a `useEffect` to detect screen width and set quantity (80 desktop, 40 mobile).
8. **Accessibility**: The Particles canvas must have `aria-hidden="true"`. All text must maintain contrast ratio ≥ 4.5:1 against the dark background. CTA buttons must have clear focus styles.
9. After creating the new `hero-section.tsx`, update `homepage/page.tsx` to import and render `<HeroSection />` in place of the inline hero JSX. Remove the old inline hero code completely.
10. **Do NOT modify any other section** in `homepage/page.tsx`. Only the hero section is changed in this task.

### Deliverables

- [ ] `src/components/public/hero-section.tsx` — client component with Particles background, AnimatedGradientText eyebrow, gradient headline, subheadline, ShimmerButton + outline Button CTAs, NumberTicker trust stats, glassmorphic stat cards, staggered entrance animations
- [ ] `src/app/(public)/homepage/page.tsx` — modified to import `<HeroSection />` and replace the inline hero section. All other sections unchanged.

### Acceptance Criteria

1. `/homepage` renders the new hero section without errors.
2. Particles animate continuously in the background with blue dots on dark background.
3. "DemoRentals Rentals" eyebrow text has an animated gradient effect.
4. Main headline text shows a gradient from white to blue.
5. "Browse Listings" button has a visible shimmer/shine animation effect.
6. Trust stat numbers count up from 0 when scrolled into view (though hero is above fold, so they animate on page load).
7. Hero occupies approximately 80-90vh on desktop, 70vh on mobile.
8. CTA buttons stack vertically on mobile.
9. Trust stats display as 3 columns on desktop, 1 column on mobile.
10. All text is readable (high contrast against dark background).
11. `npx tsc --noEmit` passes.
12. `lsp_diagnostics` clean on both modified files.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Verify:

- Particles animate in the background (blue dots on dark bg)
- Headline has gradient text
- "Browse Listings" button shimmers
- Trust stat numbers count up from 0
- Resize to mobile: buttons stack, stats stack, particles reduce
- All other sections below the hero render unchanged

### Out of Scope

- Video hero background (not in V1 — too heavy)
- Real hero images behind particles (V2)
- A/B testing different headlines (V2)
- Any changes to sections 2-8 (other tasks in this and later epics)

---

## T04: Add Proof Strip Section (Logo Marquee + Trust Metrics)

### Objective

Insert a NEW "Proof Strip" section immediately after the hero and before the locality search. This section uses Magic UI's `Marquee` component to display an infinite-scrolling strip of partner society/building logos (placeholder logos in V1) paired with key trust metrics. This is the "as seen on" / "trusted by" social proof pattern used by every premium SaaS homepage.

### Required Reading

- `src/components/magicui/marquee.tsx` — Marquee component API and props: `pauseOnHover`, `reverse`, `className`, `children`
- `src/app/(public)/homepage/page.tsx` — current section ordering to know where to insert the proof strip (after hero, before locality search)
- `src/components/magicui/number-ticker.tsx` — for animated metrics in the proof strip

### Key Rules

1. Create `src/components/public/proof-strip.tsx` — a `"use client"` component containing the logo marquee and trust metrics bar.
2. **Logo Marquee**: Use Magic UI's `Marquee` component. Display placeholder partner logos. Since we don't have real partner logos yet, create visually appealing placeholder cards:
   ```typescript
   const PARTNER_LOGOS = [
     { name: "Emerald Gateway", city: "Bangalore" },
     { name: "Lakeview Residency", city: "Bangalore" },
     { name: "Sunhaven Dream Acres", city: "Bangalore" },
     { name: "Magnolia Grove", city: "Gurgaon" },
     { name: "Riverside Springs", city: "Bangalore" },
     { name: "Serene Meadows", city: "Bangalore" },
     { name: "Harmony Enclave", city: "Bangalore" },
     { name: "Verdant Living", city: "Bangalore" },
   ];
   ```
   Each logo card: styled pill/badge with the society name in a clean font, using `bg-slate-100 text-slate-600 rounded-full px-4 py-2 text-sm font-medium` or similar. When real logos are available, these pills can be replaced with `<Image>` tags.
3. **Marquee configuration**: Two rows scrolling in opposite directions for visual interest:
   ```tsx
   <Marquee pauseOnHover className="[--duration:40s]">
     {PARTNER_LOGOS.map(...)}
   </Marquee>
   <Marquee reverse pauseOnHover className="[--duration:40s]">
     {PARTNER_LOGOS.map(...)}
   </Marquee>
   ```
   The `[--duration:40s]` CSS variable controls scroll speed. Use gradient fade masks on left/right edges: the Marquee component already handles this with a CSS mask-image gradient by default.
4. **Trust Metrics Bar**: Below (or above) the marquee, display 4 key metrics in a horizontal strip with `NumberTicker` animations:
   - "500+ Verified Properties" — `<NumberTicker value={500} />+`
   - "2,000+ Happy Tenants" — `<NumberTicker value={2000} />+`
   - "98% Satisfaction Rate" — `<NumberTicker value={98} />%`
   - "< 5 Min Response Time" — static text (no ticker for this one)

   Layout: `flex items-center justify-center gap-8 lg:gap-16` with separator dots or vertical dividers (`|`) between metrics. On mobile: `grid grid-cols-2 gap-4` with 2 per row.

5. **Styling**: The proof strip section uses `bg-white` (or `bg-slate-50`) with subtle top/bottom borders. Padding: `py-8 lg:py-12` — narrower than full sections because it's a strip, not a content section. The text above the marquee: "Trusted by societies across India" in `text-sm text-slate-500 text-center uppercase tracking-wider mb-4`.
6. **Section placement**: In `homepage/page.tsx`, the proof strip goes IMMEDIATELY after `<HeroSection />` and BEFORE the locality search section. Wrap it in `<SectionContainer className="bg-white">` or use a bare `<section>` if the proof strip needs different padding than standard sections.
7. Wrap the entire proof strip in `<SectionReveal>` so it animates into view on scroll.
8. **Performance**: The Marquee component uses CSS animations (not JS-based) — no performance concern. The logos are text-based pills — no image loading overhead.

### Deliverables

- [ ] `src/components/public/proof-strip.tsx` — client component with dual Marquee rows (opposite directions), partner society name pills, trust metrics bar with NumberTicker, "Trusted by societies across India" heading
- [ ] `src/app/(public)/homepage/page.tsx` — modified to render `<ProofStrip />` between the hero section and locality search. All other sections unchanged.

### Acceptance Criteria

1. `/homepage` shows the proof strip immediately below the hero.
2. Society name pills scroll infinitely left in the first row, right in the second row.
3. Hovering over the marquee pauses the scrolling.
4. Left/right edges of the marquee have gradient fade-out masks (pills fade out at edges, not clip abruptly).
5. Trust metric numbers animate (count up) when the section scrolls into view.
6. On mobile, trust metrics display as a 2x2 grid.
7. "Trusted by societies across India" text appears above the marquee.
8. `npx tsc --noEmit` passes.
9. `lsp_diagnostics` clean on modified files.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Scroll down past the hero. Verify:

- Marquee pills scroll continuously in two rows (opposite directions)
- Hover pauses scrolling
- Trust metrics animate on scroll
- Section appears between hero and locality search
- Resize to mobile: metrics show 2x2 grid, marquee still scrolls

### Out of Scope

- Real partner logos (placeholder name pills in V1 — replace with `<Image>` when logos are available)
- Real dynamic metrics from database (hardcoded in V1)
- Click-through on partner logos (no links in V1)
- Press/media mentions row (V2)

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
