# Sixerbat SEO Plan

## Current Audit

Current SEO status is **not complete**.

What exists now:
- basic root metadata in `next/src/app/layout.tsx`
- title: `Sixerbat`
- one generic description

What does **not** exist yet:
- route-level metadata for landing page
- route-level metadata for matches list
- route-level metadata for match detail pages
- `generateMetadata()` for dynamic match pages
- canonical URLs
- `metadataBase`
- Open Graph configuration
- Twitter card configuration
- `robots.ts`
- `sitemap.ts`
- sitemap index strategy
- structured data / JSON-LD
- breadcrumb schema
- sports event schema
- organization / website schema
- FAQ schema
- dynamic SEO slugs
- indexation rules for auth/admin/internal pages
- crawl-control strategy
- image metadata strategy
- internal linking SEO strategy
- content-hub strategy
- off-page / authority plan

So the truthful answer is:

**No, SEO is not 100% done.**

From our side, with Next.js + Phoenix, we can build a **full enterprise SEO suite** for the public platform side.

Admin and authenticated app pages are not the SEO target. Public pages are.

---

## SEO Scope Split

### Public SEO Pages
These should be indexed:
- landing page
- public matches page
- public match detail pages
- public sport/category pages if added
- public help / FAQ / guides / responsible gaming / terms pages

### Non-SEO Pages
These should generally be `noindex`:
- login
- register
- reset password
- all authenticated player pages
- all master admin pages
- all super admin pages
- operational dashboards

---

## Goal

Build SEO to enterprise standard for a betting platform so that:
- public pages are crawlable
- match pages can rank
- metadata is correct and sharable
- platform branding is consistent
- technical crawl hygiene is strong
- structured data is present
- sitemap and robots are correct
- off-page and content strategy are defined

---

## Architecture Decision

### Next.js Responsibility
Next.js should own:
- public SEO pages
- metadata
- structured data
- sitemap
- robots
- canonicals
- OG / Twitter cards

### Phoenix Responsibility
Phoenix should own:
- SEO-friendly public data endpoints
- stable match payloads
- slugs if needed later
- indexable public content data

This means:
- **SEO rendering is primarily a Next.js responsibility**
- **content/data correctness is a Phoenix responsibility**

---

## Phase 1: Technical SEO Foundation

### 1.1 Global Metadata
Update `next/src/app/layout.tsx` to include:
- `metadataBase`
- default title template
- default description
- keywords
- authors / creator / publisher
- openGraph defaults
- twitter defaults
- robots defaults
- alternates / canonical root where appropriate

### 1.2 Public vs Auth Layout Split
Use metadata strategy so:
- public layout is indexable
- login/register/reset-password explicitly `noindex`
- admin/master/user app areas explicitly `noindex, nofollow`

### 1.3 Robots
Create `next/src/app/robots.ts` with:
- allow public pages
- disallow:
  - `/admin`
  - `/master`
  - `/account`
  - `/wallet`
  - `/bets`
  - `/login`
  - `/register`
  - `/reset-password`
- include sitemap URL

### 1.4 Sitemap
Create `next/src/app/sitemap.ts`

Initial sitemap should include:
- `/`
- `/matches`
- public legal/help pages once added
- dynamic match URLs

Later expand to sitemap index if match counts become large.

---

## Phase 2: Landing Page SEO

### 2.1 Landing Page Metadata
Add landing page metadata with:
- strong title
- conversion-safe description
- canonical URL
- OG image

### 2.2 Landing Page Content Structure
Ensure homepage includes:
- one clear `h1`
- semantic section headings
- descriptive copy for:
  - live sports betting
  - AI odds workflow
  - multi-sport coverage
  - secure wallet flow
  - operator-grade controls

### 2.3 Structured Data
Add JSON-LD:
- `Organization`
- `WebSite`
- optional `FAQPage` if homepage has FAQ

---

## Phase 3: Match Listing SEO

### 3.1 Matches Page Metadata
Add route metadata for `/matches`
- title
- description
- canonical
- OG/Twitter

### 3.2 Filter Strategy
Do **not** let every filter variation become indexable by default.

Recommended:
- base `/matches` page indexable
- query param filter variants canonicalize back to `/matches`
- if later you create dedicated sport pages like `/sports/cricket`, then those become indexable

### 3.3 Internal Linking
Matches page should link properly to:
- individual match pages
- future sport pages
- future tournament pages

---

## Phase 4: Match Detail SEO

### 4.1 Server Rendering
Current match detail page is a client component.
That is weak for SEO.

Recommended fix:
- convert public match detail route to server-driven data fetch for SEO metadata
- use `generateMetadata()` for each match
- render key match details in server output

### 4.2 Match Metadata
For each public match page:
- title like:
  - `Team A vs Team B Odds, Match Preview & Betting | Sixerbat`
- description with:
  - sport
  - start time
  - match context
  - betting availability
- canonical URL
- OG title/description/image

### 4.3 Structured Data
Add JSON-LD for:
- `SportsEvent`
- optionally `BreadcrumbList`

Include:
- sport
- competitors
- start date
- event status where appropriate

### 4.4 URL Strategy
Current route uses `id`.

Better later:
- `/matches/:id/:slug`

Slug should be derived from:
- sport
- team1
- team2
- date if needed

Even if backend still uses ID, the URL should be human-readable.

---

## Phase 5: Public Content Expansion

An enterprise betting platform should not rely only on landing + match pages.

Add public informational pages:
- `/sports`
- `/sports/cricket`
- `/sports/football`
- `/sports/tennis`
- `/sports/horse-racing`
- `/sports/dog-racing`
- `/how-it-works`
- `/responsible-gaming`
- `/faq`
- `/terms`
- `/privacy`
- `/contact`

These help with:
- topical authority
- crawl depth
- trust signals
- branded and non-branded search demand

---

## Phase 6: Structured Data Suite

### Required structured data

#### Organization
For brand entity

#### WebSite
For search understanding

#### BreadcrumbList
For navigational hierarchy

#### SportsEvent
For match pages

#### FAQPage
For FAQ/help pages if content is real and visible

#### Article
If later adding editorial previews / betting guides

### Important rule
Do not add fake schema.
Only output schema for visible and truthful page content.

---

## Phase 7: Crawl and Indexation Control

### Indexable
- public landing
- public sports pages
- public matches
- public match detail pages
- public legal/help content

### Noindex
- auth pages
- reset flow pages
- all app dashboards
- player-specific pages
- internal API pages
- empty thin-content pages

### Canonical Rules
- avoid duplicate query-param pages
- canonicalize filtered public list pages to primary routes unless intentionally indexable
- canonicalize match pages to one stable URL

---

## Phase 8: Performance SEO

SEO is also affected by page quality.

Need:
- server-rendered public pages where possible
- stable HTML output for match pages
- optimized images
- proper heading hierarchy
- low layout shift
- no heavy client-only public rendering where avoidable

For Next.js specifically:
- move public SEO pages away from unnecessary client-only rendering
- use server components for public content where possible
- only hydrate interactive pieces

---

## Phase 9: Phoenix Backend SEO Support

Phoenix should support SEO indirectly by exposing:
- stable public match endpoint
- consistent start times
- consistent sport/team names
- stable public IDs/slugs
- optional canonical slug field later

Recommended backend additions later:
- public match slug generation
- slug persistence on match records
- optional public tournament/category resources

---

## Phase 10: OG Image System

Enterprise SEO should include Open Graph images.

Recommended:
- static branded OG for homepage
- sport-specific OG defaults
- dynamic match OG images later for:
  - Team A vs Team B
  - sport
  - time
  - Sixerbat branding

This improves:
- WhatsApp sharing
- X/Twitter cards
- Facebook/Telegram link previews

---

## Phase 11: Content SEO Strategy

For serious SEO growth, build content around:
- match previews
- tournament hubs
- betting guides
- responsible betting content
- sport-specific explainers

Examples:
- `How Over/Under Works in Cricket`
- `Football BTTS Explained`
- `Tennis Set Betting Guide`
- `Horse Racing Win vs Place`
- `Dog Racing Basics`

This helps rank beyond just transactional match pages.

---

## Phase 12: Off-Page SEO

Off-page is not code, but platform plan should include it.

Need:
- branded social profiles
- betting directory/listing presence where compliant
- sports communities / affiliate mentions
- PR mentions
- content partnerships
- consistent NAP/brand info if company presence exists

From engineering side, support off-page SEO by:
- good OG sharing
- clean canonical URLs
- stable metadata
- proper share previews

---

## Phase 13: International / Regional SEO

If targeting Pakistan, India, Bangladesh, and western users:
- define primary language strategy first
- likely start with `en`
- later support alternate locales if real translated content exists

Do not add fake hreflang without real localized pages.

Later:
- regional landing variants
- local payment method pages
- region-specific sport hub pages

---

## Phase 14: Compliance and Risk Considerations

Because this is a betting platform:
- avoid deceptive “guaranteed win” SEO copy
- avoid spammy prediction-page generation
- keep responsible gaming content visible
- include trust and compliance content

This is important both for brand quality and search trust.

---

## Exact Missing Work Now

### Critical Missing
- global metadata foundation incomplete
- no public route metadata strategy
- no sitemap
- no robots
- no match metadata generation
- no structured data
- no canonical strategy
- no indexation strategy
- no public SEO content architecture

### Medium Missing
- no OG image strategy
- no slug strategy
- no sports landing pages
- no FAQ/help/legal SEO framework

### Lower Priority
- no editorial content hub yet
- no off-page SEO execution plan in operations

---

## Recommended Execution Order

### Phase A
- global metadata
- robots
- sitemap
- metadataBase
- noindex strategy for internal pages

### Phase B
- landing page SEO
- matches page SEO
- canonical rules

### Phase C
- server-rendered match detail page
- `generateMetadata()`
- `SportsEvent` JSON-LD
- breadcrumb schema

### Phase D
- public support pages
- FAQ
- responsible gaming
- terms/privacy/contact

### Phase E
- sport hub pages
- sport-specific content foundations
- OG image system

### Phase F
- slug system
- dynamic match OG images
- tournament pages
- content hub

---

## Enterprise Standard Deliverables

When SEO is fully done from our side, Sixerbat should have:
- proper root metadata system
- page-level metadata for all public pages
- dynamic metadata for match pages
- sitemap
- robots
- canonical management
- structured data suite
- noindex control for internal/auth pages
- public content architecture
- share-preview system
- performance-conscious SEO rendering

---

## Final Truth

Right now:
- SEO is **not** done
- public SEO foundation is **very limited**

From our engineering side, yes, we can build the full technical SEO suite to enterprise standard in Next.js + Phoenix.

But only public pages are the SEO target.
Admin, master-admin, and player app pages are not where SEO value should be focused.
