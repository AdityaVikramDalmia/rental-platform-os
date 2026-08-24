# Feature: Tenant Interactive Tools

> **Priority**: #18 in implementation order
> **Personas**: Prospective Tenant (public)
> **Dependencies**: Public pages (P15) for shared `(public)` layout and tools entry points, Property Detail (P17) for listing-specific commute data
> **Route Group**: `(public)/` (`/tools` dedicated tools page), `/listing/[slug]` (listing-specific commute section)

## Purpose

Interactive tools help prospective tenants make informed rental decisions. These are client-side calculators and quizzes — no server persistence required (except for checklist export). They build trust and engagement while providing genuine value.

## Entities Involved

No backend entities. All tools are client-side only (localStorage + computation).

## Tools

### 1. Rent Calculator

Helps tenants understand the full cost of renting — beyond just monthly rent.

**Inputs** (all sliders with numeric display):
| Input | Range | Default | Step |
|-------|-------|---------|------|
| Monthly Rent | ₹5,000 – ₹1,00,000 | ₹20,000 | ₹1,000 |
| Security Deposit (months) | 1 – 12 | 2 | 1 |
| Monthly Maintenance | ₹0 – ₹10,000 | ₹2,000 | ₹500 |
| Brokerage (%) | 0 – 100 | 10 | 5 |

**Outputs** (computed in real-time):
| Output | Formula |
|--------|---------|
| Security Deposit Amount | Rent × Deposit Months |
| Brokerage Amount | Rent × Brokerage% |
| **Total Move-In Cost** | Deposit + First Month Rent + First Month Maintenance + Brokerage |
| **Monthly Recurring Cost** | Rent + Maintenance |

**UI**: Slider inputs on left, computed results on right. Results update instantly as sliders move. Card-based output display with clear labels.

### 2. Commute Estimator

Helps tenants estimate commute time from a property to their workplace or key locations.

**Version A — On `/tools` Page (Generic)**:

- Two dropdown inputs: `From` area and `To` area
- Transport mode selector: Car, Bike, Bus, Metro, Walk
- Static lookup table of distances/times between predefined Bangalore areas
- Current area set: Demo District, Indiranagar, HSR Layout, Whitefield, Electronic City, Marathahalli, JP Nagar, Jayanagar, Hebbal, Yelahanka

**Version B — On Property Detail Page (Listing-Specific)**:

- Uses pre-configured `listing_commute_landmarks` data for the specific listing
- No user input needed — displays all landmarks with distances/times
- Categories: Tech Hubs, Metro Stations, Hospitals, Schools, Malls
- See [Property Detail](12-property-detail.md) Section 5

**Transport Mode Estimates** (generic, for Version A):
| Mode | Speed Factor | Description |
|------|-------------|-------------|
| Car | Base | Google Maps-like estimate |
| Bike | 0.8× Car | Slightly faster in traffic |
| Bus | 1.5× Car | Includes waiting time |
| Metro | Varies | Station-to-station + walking |
| Walk | 5 km/h | For short distances |

**Note**: V1 uses a static lookup matrix (`COMMUTE_DISTANCE_MATRIX`), NOT a live Google Maps Directions API.

### 3. Roommate Quiz

Helps tenants find their ideal roommate compatibility type through a short personality quiz.

**Quiz Structure**:

- 5 questions with 4 options each
- Questions cover: sleep schedule, cleanliness, social habits, food preferences, work-from-home habits
- Results: 4 roommate types (e.g., "The Early Bird", "The Night Owl", "The Social Butterfly", "The Quiet Professional")
- Result includes: type name, description, compatibility tips, recommended listings (link to directory with filters)

**Example Questions**:

1. "What time do you usually wake up?" → Before 7 AM / 7-9 AM / 9-11 AM / After 11 AM
2. "How do you feel about guests at home?" → Love it / Occasionally fine / Prefer advance notice / Prefer no guests
3. "Your ideal weekend at home?" → Cooking brunch / Netflix marathon / Working out / Out with friends
4. "Kitchen cleanliness level?" → Spotless always / Clean after cooking / End of day cleanup / Relaxed approach
5. "How often do you work from home?" → Every day / Few days a week / Rarely / Never

**Scoring**: Simple category mapping based on most-selected options. No complex algorithm.

**UI**: One question per screen with large option cards. Progress indicator. Animated transitions between questions. Result card with illustration.

### 4. Rental Checklist Tracker

Helps tenants track their move-in preparation with a comprehensive checklist.

**Checklist Categories**:
| Category | Items |
|----------|-------|
| **Before Visiting** | Set budget, list requirements, research essentials, keep documents ready |
| **During Visit** | Check water, power backup, network quality, neighborhood noise |
| **Before Agreement** | Verify owner proof, review clauses, confirm deposit/brokerage |
| **Before Move-in** | Record meter readings, collect keys, capture inventory photos, confirm utilities |
| **After Move-in** | Update address, complete society registration, save emergency contacts, track recurring dues |

**Features**:

- Grouped by category with expand/collapse
- Checkbox per item (state stored in localStorage)
- Overall completion progress bar (percentage)
- "Download Checklist" button → exports as text/CSV file via Blob
- "Reset" button to start over

**No server persistence** — checklist state is localStorage only. Simple, private, no auth required.

---

## Technical Notes

1. All tools are **client-side only**. No Convex mutations or queries. No server state.
2. Rent calculator and commute estimator use pure arithmetic — no external APIs.
3. Roommate quiz logic is a simple category-count algorithm, not ML.
4. Checklist uses `localStorage` for persistence across browser sessions.
5. Checklist export uses `Blob` + `URL.createObjectURL` for file download.
6. All tools are responsive (mobile-first). Touch-friendly sliders and large tap targets.
7. Tools live on a dedicated `/tools` page with tabbed navigation; How-It-Works currently shows teaser/coming-soon blocks.
8. Listing-specific commute data appears separately on `/listing/[slug]` using `listing_commute_landmarks`.

---

## Placement

| Tool              | Primary Location           | Secondary Location                      |
| ----------------- | -------------------------- | --------------------------------------- |
| Rent Calculator   | `/tools` tabbed tools hub  | Homepage tools preview link             |
| Commute Estimator | `/tools` tabbed tools hub  | Property Detail Page (listing-specific) |
| Roommate Quiz     | `/tools` tabbed tools hub  | Homepage tools preview link             |
| Rental Checklist  | `/tools` checklist section | —                                       |

---

## Edge Cases

- **localStorage disabled**: Tools still work, but checklist state resets on page refresh. No error — just no persistence.
- **Extreme slider values**: Rent calculator handles edge cases (₹0 maintenance, 0 brokerage).
- **Quiz tie**: If multiple categories have same score, pick the first one alphabetically.
- **Checklist download on mobile**: Use share API if available, fall back to Blob download.
