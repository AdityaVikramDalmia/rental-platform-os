---
id: P15-E06
title: Premium Polish, Performance & Global Enhancements
phase: 15
status: pending
depends_on: ["P15-E05"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P15-E06: Premium Polish, Performance & Global Enhancements

## Overview

The final polish epic. Enhance the public header with auth buttons (Sign In / Sign Up for tenants and owners via Google SSO), add scroll-triggered entrance animations to ALL remaining sections that weren't yet animated, add micro-interactions (button hover effects, card hover lifts, cursor effects), add a floating WhatsApp widget visible on all public pages, optimize performance (lazy loading below-fold sections, image optimization, LCP target < 2.5s), and enhance SEO (JSON-LD structured data, OpenGraph images, canonical URLs). Also refine the footer with newsletter animation and social hover effects. This epic takes the homepage from "looks great" to "feels premium."

## Prerequisites

- **Read first**: [P15-E05 Completion Summary](P15-E05-social-proof-conversion.md#completion-summary) — confirms all 11 homepage sections are implemented and styled.
- **Codebase facts to verify before starting**:
  - Full homepage section order after E03-E05: HeroSection → ProofStrip → LocalitySearch → FeaturedProperties → HomepageTimeline → WhyPlatform → TestimonialCarousel → ComparisonTable → ToolsPreview → CTASection → Footer
  - All Magic UI components installed in `src/components/magicui/`
  - All shared animation utilities in `src/components/public/animations/`
  - `motion` package installed
  - `src/components/public/header.tsx` — current header with logo, nav links, "Browse Listings" CTA, mobile Sheet menu. NO auth buttons currently.
  - `src/components/public/footer.tsx` — current footer with 4-column layout, nav links, contact channels, social placeholders
  - Auth architecture: WorkOS AuthKit with Google SSO for tenants/owners, phone+password for guards. See `notes/01-tech-stack.md` Auth Architecture section and `src/proxy.ts` for the AuthKit proxy.
  - `src/app/callback/` — the existing auth callback route that handles WorkOS redirects

## Task Queue

- [ ] P15-E06-T01: Add Auth Buttons to Public Header
- [ ] P15-E06-T02: Add Floating WhatsApp Widget
- [ ] P15-E06-T03: Micro-Interactions & Remaining Animation Polish
- [ ] P15-E06-T04: Performance Optimization (Lazy Loading, LCP)
- [ ] P15-E06-T05: SEO Enhancements (JSON-LD, OpenGraph, Sitemap Hints)

---

## T01: Add Auth Buttons to Public Header

### Objective

Add "Sign In" and "Sign Up" buttons to the public header for tenant and owner authentication via Google SSO. When a user is already authenticated, show their avatar/initials and a dropdown with profile link and sign-out. The header should adapt: unauthenticated → auth buttons; authenticated → user menu. Guard login is NOT shown on the public header (guards use `/guard/login`).

### Required Reading

- `src/components/public/header.tsx` — current header implementation. Client component with logo, nav links, "Browse Listings" CTA, mobile Sheet menu, active link highlighting via `usePathname()`.
- `src/proxy.ts` — AuthKit proxy configuration. This is how auth state is accessed on the server side.
- `notes/01-tech-stack.md` — Auth Architecture section: WorkOS AuthKit, Google SSO flow for non-guard users, `getAuthUser()` pattern.
- `src/app/(admin)/layout.tsx` or `src/app/(guard)/layout.tsx` — reference for how existing layouts check auth state and get user info.
- `notes/13-constants-reference.md` — `USER_TYPES`: ADMIN, GUARD, TENANT, OWNER. The public header auth flow creates TENANT or OWNER users.

### Key Rules

1. **Auth state detection**: The header is currently a client component. To access auth state, you have two options:
   - **Option A (Recommended)**: Pass auth state from the `(public)/layout.tsx` server component down to the header as props. The layout can call WorkOS AuthKit's server-side helper to check if a user is logged in and pass `{ isAuthenticated: boolean, userName?: string, userInitials?: string, userType?: string }` to the header.
   - **Option B**: Use a Convex query like `useQuery(api.auth.currentUser)` in the client header to check auth state. This works but adds a loading flash.

   Use **Option A**. Modify `src/app/(public)/layout.tsx` to:

   ```typescript
   import { getAuthUser } from "@/lib/auth"; // or however the project accesses WorkOS auth state server-side

   export default async function PublicLayout({ children }: { children: React.ReactNode }) {
     const authUser = await getAuthUser(); // returns null if not logged in
     const authProps = authUser ? {
       isAuthenticated: true,
       userName: authUser.name || authUser.email,
       userInitials: getInitials(authUser.name || authUser.email),
       userType: authUser.userType, // TENANT, OWNER, ADMIN
     } : { isAuthenticated: false };

     return (
       <ConvexClientProvider>
         <PublicHeader {...authProps} />
         {children}
         <PublicFooter />
       </ConvexClientProvider>
     );
   }
   ```

   **Important**: Check the actual project patterns for accessing auth state server-side. The approach may differ based on how `proxy.ts` and WorkOS AuthKit are configured. Look at how `(admin)/layout.tsx` and `(guard)/layout.tsx` do it and follow the same pattern.

2. **Unauthenticated state**: Show two buttons in the header nav area (desktop):
   - "Sign In" — `variant="ghost"` button, navigates to the WorkOS login page. Use the same URL pattern as admin login: `<a href="/admin/login">Sign In</a>` or directly to the WorkOS auth endpoint. Check how existing admin/tenant login flows work in the codebase.
   - "Get Started" — `variant="default"` primary button (blue), same destination as Sign In but positioned as the primary CTA for new users. This replaces the current "Browse Listings" CTA button position.
   - The "Browse Listings" text link stays in the nav links — just the CTA button changes.

3. **Authenticated state**: Replace auth buttons with a user avatar dropdown:

   ```tsx
   <DropdownMenu>
     <DropdownMenuTrigger asChild>
       <Button variant="ghost" className="relative h-9 w-9 rounded-full">
         <Avatar className="h-9 w-9">
           <AvatarFallback className="bg-blue-600 text-white text-sm">
             {userInitials}
           </AvatarFallback>
         </Avatar>
       </Button>
     </DropdownMenuTrigger>
     <DropdownMenuContent align="end" className="w-56">
       <DropdownMenuLabel>
         <p className="text-sm font-medium">{userName}</p>
         <p className="text-xs text-muted-foreground">{userType}</p>
       </DropdownMenuLabel>
       <DropdownMenuSeparator />
       <DropdownMenuItem asChild>
         <Link href={getDashboardUrl(userType)}>Dashboard</Link>
       </DropdownMenuItem>
       <DropdownMenuItem asChild>
         <Link href="/api/auth/signout">Sign Out</Link>
       </DropdownMenuItem>
     </DropdownMenuContent>
   </DropdownMenu>
   ```

   The `getDashboardUrl` function routes based on user type:

   ```typescript
   function getDashboardUrl(userType?: string): string {
     switch (userType) {
       case "ADMIN":
         return "/admin/dashboard";
       case "TENANT":
         return "/tenant/dashboard"; // future, may not exist yet
       case "OWNER":
         return "/owner/dashboard"; // future, may not exist yet
       default:
         return "/homepage";
     }
   }
   ```

   For user types that don't have a dashboard yet (TENANT, OWNER), link to `/homepage` as a fallback.

4. **Mobile header**: In the mobile Sheet menu, add the auth buttons at the bottom:
   - Unauthenticated: "Sign In" and "Get Started" buttons stacked full-width
   - Authenticated: User name + "Dashboard" link + "Sign Out" link

5. **Sign Out flow**: The sign-out URL depends on how WorkOS AuthKit is configured. Check `src/proxy.ts` or the existing admin logout flow. It's typically a redirect to WorkOS's signout endpoint which clears the session and redirects back. Use whatever pattern already exists in the codebase.

6. **Styling**: Auth buttons should match the header's existing style. On scroll, the header is sticky with `backdrop-blur` — auth buttons should be legible against the blurred background. The avatar should have a clear focus ring for accessibility.

7. **Guard exclusion**: The public header does NOT show guard login. Guards access their portal via `/guard/login` (phone+password). The public header's "Sign In" goes to Google SSO only. If a guard somehow reaches the public header while logged in, show their avatar like any other user — but "Dashboard" should route to `/guard/dashboard`.

8. **Props interface update**:
   ```typescript
   type PublicHeaderProps = {
     isAuthenticated?: boolean;
     userName?: string;
     userInitials?: string;
     userType?: string;
   };
   ```

### Deliverables

- [ ] `src/components/public/header.tsx` — modified to accept auth props, show "Sign In" / "Get Started" when unauthenticated, show avatar dropdown when authenticated, mobile menu includes auth state
- [ ] `src/app/(public)/layout.tsx` — modified to fetch auth state server-side and pass to header as props

### Acceptance Criteria

1. Unauthenticated user sees "Sign In" (ghost) and "Get Started" (primary) buttons in the header.
2. Clicking "Sign In" or "Get Started" initiates the Google SSO login flow.
3. Authenticated user sees their avatar with initials in the header.
4. Clicking the avatar opens a dropdown with "Dashboard" and "Sign Out" options.
5. "Dashboard" links to the correct portal based on user type.
6. "Sign Out" signs the user out and redirects to the homepage.
7. Mobile menu shows auth buttons (unauthenticated) or user info + sign out (authenticated).
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage` while NOT logged in. Verify "Sign In" and "Get Started" buttons visible. Click "Sign In" — should redirect to Google SSO (or WorkOS login). Log in as test admin via `/dev/login`. Navigate back to `/homepage`. Verify avatar appears in header. Click avatar — verify dropdown with Dashboard + Sign Out. Click Sign Out — verify redirect to homepage with auth buttons restored.

### Out of Scope

- Separate sign-up flow for tenants vs owners (both use Google SSO, `user_type` is set post-login or during onboarding)
- Tenant/owner onboarding wizard (future phase)
- Role-based nav items (showing different nav links based on user type — all public pages are the same)
- Guard login button in the public header

---

## T02: Add Floating WhatsApp Widget

### Objective

Add a floating WhatsApp chat button visible on ALL public pages — a green circular button fixed to the bottom-right corner of the viewport. Clicking it opens a WhatsApp chat with a pre-filled message. This is the industry-standard conversion widget for Indian proptech platforms.

### Required Reading

- `notes/13-constants-reference.md` — `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` env var
- `src/app/(public)/layout.tsx` — where the widget should be rendered (in the layout, so it appears on all public pages)

### Key Rules

1. Create `src/components/public/whatsapp-widget.tsx` — a `"use client"` component (needs motion for entrance animation).
2. **Design**: Green circular button, fixed to bottom-right:
   ```tsx
   <motion.a
     href={`https://wa.me/${process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}?text=${encodeURIComponent("Hi, I need help finding a rental property.")}`}
     target="_blank"
     rel="noopener noreferrer"
     initial={{ scale: 0, opacity: 0 }}
     animate={{ scale: 1, opacity: 1 }}
     transition={{ delay: 2, type: "spring", stiffness: 200 }}
     whileHover={{ scale: 1.1 }}
     whileTap={{ scale: 0.95 }}
     className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg hover:shadow-xl transition-shadow"
     aria-label="Chat on WhatsApp"
   >
     <MessageCircle className="h-7 w-7" />
   </motion.a>
   ```

   - **Color**: WhatsApp green `#25D366`
   - **Size**: `h-14 w-14` (56px circle)
   - **Position**: `fixed bottom-6 right-6 z-50`
   - **Entrance**: Pops in after 2 second delay (don't distract from page load)
   - **Hover**: Scales up slightly
3. **Tooltip on hover**: Show a tooltip "Chat with us" on hover using a simple CSS approach (no shadcn Tooltip needed to avoid complexity):
   ```tsx
   <span className="absolute -top-10 right-0 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
     Chat with us
   </span>
   ```
   Add `group` class to the parent `<motion.a>`.
4. **Pulse animation**: Add a subtle pulse ring behind the button to draw attention:
   ```tsx
   <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-20" />
   ```
   The `animate-ping` is a built-in Tailwind animation. Use `opacity-20` to keep it subtle.
5. **Render in layout**: Add `<WhatsAppWidget />` to `src/app/(public)/layout.tsx`, placed AFTER the footer (but before the closing `</ConvexClientProvider>` — it's fixed-position so DOM order doesn't matter for visual placement):
   ```tsx
   <PublicHeader {...authProps} />
   {children}
   <PublicFooter />
   <WhatsAppWidget />
   ```
6. **Mobile considerations**: On mobile, the button should not overlap with any bottom navigation or important content. `bottom-6 right-6` (24px margin) provides enough clearance. If it overlaps with the cookie consent banner (if one exists), increase `bottom` to `bottom-20`.
7. **Accessibility**: `aria-label="Chat on WhatsApp"` is required since the button has no visible text (icon only).

### Deliverables

- [ ] `src/components/public/whatsapp-widget.tsx` — client component with fixed-position WhatsApp button, entrance animation, hover scale, pulse ring, tooltip
- [ ] `src/app/(public)/layout.tsx` — modified to render `<WhatsAppWidget />` on all public pages

### Acceptance Criteria

1. Green WhatsApp button appears in bottom-right corner on ALL public pages.
2. Button pops in after ~2 seconds (not immediately on page load).
3. Hovering shows "Chat with us" tooltip and scales the button.
4. Clicking opens WhatsApp with pre-filled message.
5. Subtle pulse animation draws attention.
6. Button has `aria-label` for accessibility.
7. Button is visible on mobile without overlapping important content.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`, `/how-it-works`, `/contact`. Verify WhatsApp button appears on ALL three pages. Wait 2 seconds after load — button should pop in. Hover — tooltip appears. Click — WhatsApp opens (or WhatsApp Web if on desktop). Check on mobile viewport — button visible and not overlapping content.

### Out of Scope

- In-page chat widget (live chat, not WhatsApp)
- WhatsApp Business API integration (V2)
- Different pre-filled messages per page
- Chat button on admin/guard portals (only public pages)

---

## T03: Micro-Interactions & Remaining Animation Polish

### Objective

Add micro-interactions throughout the homepage: button hover state improvements, card lift effects, focus ring refinements, and smooth page scroll behavior. Also verify ALL sections have scroll-reveal animations applied — if any sections from E03-E05 were missed, add them now. This is the "fit and finish" pass.

### Required Reading

- `src/app/(public)/homepage/page.tsx` — full page to verify all sections have animation wrappers
- `src/app/globals.css` — check for existing global styles
- All component files in `src/components/public/` — verify animation coverage

### Key Rules

1. **Global smooth scroll**: Add to `src/app/globals.css`:

   ```css
   html {
     scroll-behavior: smooth;
   }
   ```

   This ensures anchor links (like "Learn More → #how-it-works") scroll smoothly.

2. **Button hover refinements**: Create a global button hover class or verify that all Button components have adequate hover feedback:
   - Primary buttons: already have `hover:bg-blue-700` via shadcn — verify
   - Outline buttons: should have `hover:bg-slate-50` or similar
   - Ghost buttons: should have `hover:bg-slate-100`
   - All buttons should have `transition-all duration-200` (shadcn default)
   - Add a subtle `active:scale-[0.98]` transform for click feedback on ALL buttons in `globals.css`:
     ```css
     button:active:not(:disabled) {
       transform: scale(0.98);
     }
     ```

3. **Link hover underlines**: For text links in sections (like "View All Listings →", "See the Full Process →"), add animated underline on hover:

   ```css
   .link-hover-underline {
     @apply relative;
   }
   .link-hover-underline::after {
     @apply content-[''] absolute bottom-0 left-0 w-0 h-0.5 bg-current transition-all duration-300;
   }
   .link-hover-underline:hover::after {
     @apply w-full;
   }
   ```

   Apply this class to text links in section CTAs. This is optional — only add if it doesn't conflict with existing link styles.

4. **Card hover consistency check**: Verify every card component has consistent hover behavior:
   - Featured listing cards: `hover:shadow-lg` + image zoom ✓ (added in E04-T01)
   - Why Rental Platform OS cards: `hover:shadow-lg hover:border-slate-200` ✓ (added in E04-T04)
   - Testimonial cards: `hover:shadow-md` ✓ (added in E05-T01)
   - Tool preview cards: `whileHover={{ y: -4 }}` ✓ (added in E05-T03)
   - Comparison cards (mobile): verify they have hover feedback
   - If any card is missing hover effects, add them.

5. **Section animation audit**: Walk through `homepage/page.tsx` and verify EVERY section is wrapped in either `<SectionReveal>`, `<SectionContainer>` + `<SectionReveal>`, or has inline `BlurFade` / `motion` animations. Check:
   - [ ] HeroSection — has own animations ✓
   - [ ] ProofStrip — wrapped in `SectionReveal` ✓
   - [ ] LocalitySearch — wrapped in `SectionContainer` + `SectionReveal` ✓
   - [ ] FeaturedProperties — wrapped in `SectionContainer` + `SectionReveal` ✓
   - [ ] HomepageTimeline — has BlurFade per step ✓
   - [ ] WhyPlatform — has StaggerChildren ✓
   - [ ] TestimonialCarousel — wrapped in `SectionReveal` ✓
   - [ ] ComparisonTable — has animated checks ✓
   - [ ] ToolsPreview — has StaggerChildren ✓
   - [ ] CTASection — has SectionReveal ✓
         If any section is missing, add the appropriate animation wrapper.

6. **Focus ring refinement**: Ensure all interactive elements (buttons, links, form inputs) have visible focus rings for keyboard navigation. The default shadcn focus ring (`ring-2 ring-ring ring-offset-2`) should be present. Verify it's visible against both light and dark backgrounds:
   - On dark hero background: focus ring should be `ring-white` or clearly visible
   - On light sections: default ring is fine

7. **Scroll-to-top behavior**: After all sections are loaded, verify that clicking nav links in the header scrolls smoothly to the correct page section (if anchor links are used) or navigates to the correct page (for route links).

8. **NO new components** in this task. This is purely a CSS/styling/verification pass on existing components.

### Deliverables

- [ ] `src/app/globals.css` — modified with smooth scroll, button active feedback, optional link underline animation
- [ ] All public components — verified/fixed for consistent hover effects and animation coverage
- [ ] `src/app/(public)/homepage/page.tsx` — verified all sections have animation wrappers (fix any gaps)

### Acceptance Criteria

1. Page scrolls smoothly when clicking anchor links.
2. All buttons have a subtle scale-down on click (active state).
3. Every section has a scroll-reveal animation (verify by slow-scrolling the full page).
4. All cards have consistent hover feedback (shadow change or lift).
5. Focus rings are visible on all interactive elements.
6. No animation is janky or stutters (60fps target).
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage`. Slowly scroll the entire page top to bottom. Verify:

- Every section animates in (blur-fade or stagger)
- No section appears without animation (instant pop)
- Click any button: subtle scale feedback
- Hover over cards: consistent shadow/lift effects
- Tab through interactive elements: focus rings visible
- Click "How It Works" in nav: smooth scroll to section or page navigation

### Out of Scope

- Page transition animations between routes (V2 — requires a page transition library)
- Cursor trail or custom cursor effects (too heavy for V1)
- Parallax scroll effects on individual sections (evaluated and deferred — adds complexity)
- Dark mode (V2)

---

## T04: Performance Optimization (Lazy Loading, LCP)

### Objective

Optimize the homepage for Core Web Vitals: LCP < 2.5s, CLS < 0.1, FID < 100ms. Lazy-load below-fold sections and images. Ensure the hero (above fold) loads instantly. Optimize image loading for listing photos in the featured properties section.

### Required Reading

- `src/app/(public)/homepage/page.tsx` — full page structure to identify above-fold vs below-fold content
- `next.config.ts` — current Next.js configuration
- Next.js Image optimization docs: `next/image` component with `priority`, `loading="lazy"`, `sizes`

### Key Rules

1. **Above-fold priority**: The hero section + proof strip are above the fold. Ensure:
   - Hero background (Particles) initializes immediately (no lazy flag)
   - Hero headline renders server-side (static text in the component)
   - Proof strip marquee starts immediately
   - No `loading="lazy"` on any above-fold content

2. **Below-fold lazy loading**: All sections below the proof strip should lazy-load their heavy content:
   - Featured Properties: listing images should use `<Image loading="lazy" />` (they already use `lazy` attribute — verify)
   - Testimonials: avatar rendering is lightweight (CSS gradients, no images) — no change needed
   - Comparison table, tools preview: pure HTML — no change needed
   - CTA section: Particles or blob animations should NOT render until section is near viewport. Use `whileInView` to control animation start.

3. **Image optimization** for Featured Properties:

   ```tsx
   <Image
     src={listing.first_photo_url || "/placeholder-listing.jpg"}
     alt={`${listing.bhk_config} in ${listing.society_name}`}
     width={400}
     height={300}
     className="h-52 w-full object-cover transition-transform duration-500 group-hover:scale-110"
     loading="lazy"
     sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
   />
   ```

   - Use `sizes` prop for responsive image loading
   - Use `width` and `height` to prevent CLS (layout shift)
   - Convex file URLs are already optimized CDN URLs — no additional processing needed

4. **Font optimization**: Verify the project uses `next/font` for font loading (prevents FOUT/FOIT). Check `src/app/layout.tsx` for font configuration. If fonts are loaded via `<link>` tags, migrate to `next/font/google` or `next/font/local`.

5. **Reduce Motion preference**: Respect `prefers-reduced-motion` media query. Motion/Framer Motion respects this by default (`useReducedMotion` hook). Verify that users who prefer reduced motion don't see jarring animations — they should see static content instead.

6. **Bundle size check**: After all E03-E06 changes, run `npm run build` and check the output for any oversized chunks. The Motion library adds ~30KB gzipped — acceptable. Magic UI components are tree-shaken (only installed components are included). Flag any chunk > 200KB for investigation.

7. **Preload critical resources**: In `src/app/(public)/layout.tsx` or `homepage/page.tsx`, add preload hints for critical resources:

   ```tsx
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
   ```

   (Only if Google Fonts are used — check first.)

8. **No `use client` on the page shell**: Verify `homepage/page.tsx` is still a server component (no `"use client"` at the top). Client components should be imported and rendered within the server page — not the page itself becoming a client component.

### Deliverables

- [ ] `src/components/public/featured-listings.tsx` — verified/fixed Image components with `sizes`, `width`, `height`, `loading="lazy"`
- [ ] `src/app/(public)/homepage/page.tsx` — verified server component, no client directive on page shell
- [ ] Build output reviewed for bundle size (flag any chunk > 200KB)

### Acceptance Criteria

1. `npm run build` passes with no warnings about oversized chunks (or if there are, they're documented).
2. Hero section renders immediately (no loading flash).
3. Below-fold images load lazily (verify in DevTools Network tab — images should load as you scroll).
4. `prefers-reduced-motion` is respected (test with browser dev tools: Rendering → Emulate CSS media → prefers-reduced-motion: reduce).
5. `homepage/page.tsx` is a server component (no `"use client"` directive at top of file).
6. `npx tsc --noEmit` passes.

### Verification

```bash
npm run build
npx tsc --noEmit
```

Navigate to `http://localhost:3000/homepage` in Chrome. Open DevTools:

- **Performance tab**: Run Lighthouse → check LCP score
- **Network tab**: Scroll slowly → verify images lazy-load (network requests appear as you scroll down)
- **Elements tab**: Verify `<img>` tags have `loading="lazy"` attribute (below fold)
- **Rendering tab**: Enable "Emulate CSS media: prefers-reduced-motion: reduce" → verify animations are disabled

### Out of Scope

- Service Worker caching for public pages (PWA is only for guard/admin portals)
- CDN configuration (Convex handles file CDN, Vercel handles static CDN)
- Image format conversion to WebP/AVIF (Next.js Image component handles this automatically)

---

## T05: SEO Enhancements (JSON-LD, OpenGraph, Canonical)

### Objective

Add structured data (JSON-LD) to the homepage for better search engine understanding, enhance OpenGraph tags for social sharing previews, add canonical URLs to prevent duplicate content, and ensure all public pages have proper meta descriptions. This is the final SEO pass before launch.

### Required Reading

- `src/app/(public)/homepage/page.tsx` — current SEO metadata export
- `src/app/(public)/how-it-works/page.tsx` — current SEO metadata
- `src/app/(public)/contact/page.tsx` — current SEO metadata
- `src/app/(public)/layout.tsx` — shared metadata that applies to all public pages
- Next.js Metadata API: https://nextjs.org/docs/app/api-reference/functions/generate-metadata

### Key Rules

1. **JSON-LD structured data** for the homepage. Add to `homepage/page.tsx` as a `<script>` tag:

   ```tsx
   const jsonLd = {
     "@context": "https://schema.org",
     "@type": "RealEstateAgent",
     name: "DemoRentals - Rental Platform OS",
     description:
       "Find verified rental properties in Bangalore. Zero brokerage, guided visits, transparent pricing.",
     url: "https://rental-platform-os.app",
     telephone: process.env.NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE
       ? `+91${process.env.NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE}`
       : undefined,
     address: {
       "@type": "PostalAddress",
       streetAddress: "3rd Floor, Demo District",
       addressLocality: "Bangalore",
       addressRegion: "Karnataka",
       postalCode: "560001",
       addressCountry: "IN",
     },
     areaServed: {
       "@type": "City",
       name: "Bangalore",
     },
     sameAs: [
       // Add real social URLs when available
     ],
   };
   ```

   Render as:

   ```tsx
   <script
     type="application/ld+json"
     dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
   />
   ```

   Place in the page component's return, before the first section.

2. **Enhanced OpenGraph metadata** — update the homepage metadata export:

   ```typescript
   export const metadata: Metadata = {
     title: "DemoRentals — Find Your Perfect Rental Home in Bangalore",
     description:
       "Browse verified rental properties with zero brokerage. Transparent pricing, guided visits, and direct owner contact. Join 2,000+ happy tenants.",
     keywords: [
       "rental properties bangalore",
       "zero brokerage flats",
       "verified listings",
       "demorentals",
       "rental-platform-os",
     ],
     openGraph: {
       title: "DemoRentals — Find Your Perfect Rental Home",
       description:
         "Zero brokerage. Verified listings. Guided visits. Find your next home in minutes.",
       url: "https://rental-platform-os.app",
       siteName: "DemoRentals by Rental Platform OS",
       type: "website",
       locale: "en_IN",
       // images: [{ url: "/og-homepage.png", width: 1200, height: 630, alt: "DemoRentals - Find Your Perfect Rental Home" }],
       // TODO: Create OG image asset when branding is finalized
     },
     twitter: {
       card: "summary_large_image",
       title: "DemoRentals — Find Your Perfect Rental Home",
       description: "Zero brokerage. Verified listings. Guided visits.",
       // images: ["/og-homepage.png"],
     },
     alternates: {
       canonical: "https://rental-platform-os.app/homepage",
     },
     robots: {
       index: true,
       follow: true,
     },
   };
   ```

3. **Canonical URLs** for all public pages:
   - Homepage: `https://rental-platform-os.app/homepage`
   - How It Works: `https://rental-platform-os.app/how-it-works`
   - Contact: `https://rental-platform-os.app/contact`
     Add `alternates.canonical` to each page's metadata export.

4. **Meta descriptions audit**: Verify all 3 public pages have unique, compelling meta descriptions:
   - Homepage: "Browse verified rental properties with zero brokerage..."
   - How It Works: "Learn how to find and rent your perfect home..."
   - Contact: "Reach DemoRentals via WhatsApp, phone, email..."

5. **Shared layout metadata**: In `src/app/(public)/layout.tsx`, add default metadata that applies to all public pages unless overridden:

   ```typescript
   export const metadata: Metadata = {
     metadataBase: new URL("https://rental-platform-os.app"),
     title: {
       default: "DemoRentals — Verified Rental Properties",
       template: "%s | DemoRentals",
     },
     robots: {
       index: true,
       follow: true,
     },
   };
   ```

   **Note**: Check if the layout already has metadata. If so, enhance rather than replace.

6. **Robots.txt hint**: While a full robots.txt and sitemap are out of scope, add a comment in the layout noting that these should be created when the site goes live:

   ```typescript
   // TODO: Add robots.txt at public/robots.txt and sitemap.xml via next-sitemap when going live
   ```

7. **Domain note**: The metadata uses `rental-platform-os.app` as the domain. If the actual production domain differs, the teammate should update this when deploying. Add a comment in the layout:
   ```typescript
   // NOTE: Update metadataBase URL to actual production domain before launch
   ```

### Deliverables

- [ ] `src/app/(public)/homepage/page.tsx` — enhanced metadata (OpenGraph, Twitter, canonical, keywords) + JSON-LD script tag
- [ ] `src/app/(public)/how-it-works/page.tsx` — enhanced metadata (canonical URL added)
- [ ] `src/app/(public)/contact/page.tsx` — enhanced metadata (canonical URL added)
- [ ] `src/app/(public)/layout.tsx` — enhanced shared metadata (metadataBase, default title template, robots)

### Acceptance Criteria

1. JSON-LD script renders in the homepage HTML (inspect Elements tab → search for `application/ld+json`).
2. OpenGraph tags render correctly (use [ogp.me](https://ogp.me/) or social sharing debugger tools).
3. All 3 public pages have unique `<title>` and `<meta name="description">` tags.
4. Canonical URLs are present on all 3 pages.
5. `npx tsc --noEmit` passes.
6. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Navigate to `http://localhost:3000/homepage`. Open DevTools Elements tab:

- Search for `application/ld+json` → verify JSON-LD present with RealEstateAgent type
- Check `<title>` tag → should be "DemoRentals — Find Your Perfect Rental Home in Bangalore"
- Check `<meta name="description">` → should mention "verified rental properties" and "zero brokerage"
- Check `<link rel="canonical">` → should point to `https://rental-platform-os.app/homepage`
- Check `<meta property="og:title">` → should be set

Repeat for `/how-it-works` and `/contact` — verify unique titles and descriptions.

### Out of Scope

- Full sitemap.xml generation (use `next-sitemap` package when going live)
- robots.txt file creation (do this at launch)
- OG image asset creation (placeholder comment for now — create when branding is finalized)
- Google Search Console setup (ops task, not code)
- Analytics/tracking scripts (separate epic)

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
