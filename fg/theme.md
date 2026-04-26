# Sixerbat Frontend Theme Guide (Inspired By deephat.ai UI Patterns)

This document defines a cohesive visual system for the Sixerbat platform (web + admin). It is informed by patterns observed on `deephat.ai` (tokenized CSS variables, dark "tech" base, indigo/purple accents, pill CTAs, glassy nav surfaces, strong gradients, and operator-grade typography), but it is adapted for a betting product (clarity, trust, speed, and legibility).

## Goals
- Make the product feel premium and fast: bold typography, high contrast, minimal chrome.
- Keep betting flows unambiguous: strong hierarchy, consistent statuses, predictable button semantics.
- Provide a token-first system: easy to implement in Next.js (CSS variables, Tailwind tokens, or CSS Modules).

## Reference Notes (What deephat.ai actually uses)
- Primary dark base: `#0d0b15` (tech-black)
- Primary accent: `#6320e8` (electric-indigo)
- Secondary purples: `#4f1aba`, `#3b138b`, `#280d5d`, `#824ded`, `#a179f1`, `#c1a6f6`, `#e0d2fa`
- Text on dark: `#f7f8f8` (seasalt), secondary `#dedede`
- Nav surface: `#272539` with `backdrop-filter: blur(30px)`
- Button motion: `transition: transform .4s cubic-bezier(.77,0,.175,1)` and hover lift `translateY(-6px)`
- Fonts: `"Aspekta Variable"` for headings, `"Inter Variable"` for paragraphs, `"Space Mono"` for mono accents
- Decorative gradients: linear/radial gradients with purple glow and blurred blobs

## Sixerbat Brand Direction
Sixerbat should feel:
- Competitive and confident (sportsbook energy)
- Precise (operator tooling feel, not "casino flashy")
- Safe/trustworthy (clear error/success states, stable layout, accessible contrast)

We keep a dark base + neon accent system, but introduce a betting-specific "signal green" for confirmed outcomes and keep "danger red" for risk / rejected actions.

---

## 1) Design Tokens (CSS Variables)

Put these in a global CSS file (e.g. `styles/theme.css`) and load once at app root.

```css
:root {
  /* Typography */
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
  --font-display: "Aspekta Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
  --font-mono: "Space Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;

  /* Core palette */
  --c-bg: #0d0b15;            /* main background */
  --c-surface-1: #141226;     /* panels */
  --c-surface-2: #1c1933;     /* raised panels */
  --c-surface-nav: #272539;   /* nav/dropdowns */
  --c-border: rgba(240, 240, 240, 0.10);
  --c-border-strong: rgba(240, 240, 240, 0.18);

  --c-text: #f7f8f8;
  --c-text-muted: rgba(247, 248, 248, 0.72);
  --c-text-faint: rgba(247, 248, 248, 0.52);

  /* Accent system */
  --c-accent: #6320e8;        /* electric indigo */
  --c-accent-2: #4f1aba;      /* hover accent */
  --c-accent-soft: rgba(99, 32, 232, 0.18);
  --c-accent-glow: rgba(161, 121, 241, 0.35);

  /* Betting signals */
  --c-success: #64b513;       /* success green */
  --c-danger: #ff3c3c;        /* error red */
  --c-warning: #ffb020;       /* caution */
  --c-info: #3a8bff;          /* info */

  /* Sports category accents (optional) */
  --c-sport-cricket: #21c07a;
  --c-sport-football: #3a8bff;
  --c-sport-tennis: #a179f1;
  --c-sport-racing: #ffb020;

  /* Radii */
  --r-xs: 8px;
  --r-sm: 12px;
  --r-md: 16px;
  --r-lg: 24px;
  --r-pill: 999px;

  /* Spacing scale (4px base) */
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 20px;
  --s-6: 24px;
  --s-8: 32px;
  --s-10: 40px;
  --s-12: 48px;
  --s-16: 64px;

  /* Shadows */
  --shadow-1: 0 4px 24px rgba(0,0,0,0.45);
  --shadow-2: 0 12px 56px rgba(0,0,0,0.55);

  /* Motion */
  --ease-operator: cubic-bezier(.77, 0, .175, 1);
  --ease-standard: cubic-bezier(.645, .045, .355, 1);
  --dur-1: 120ms;
  --dur-2: 200ms;
  --dur-3: 400ms;
}
```

### Light mode
Not required now. If needed later, define `:root[data-theme="light"] { ... }` and map to a near-white palette with muted accent usage.

---

## 2) Typography System

### Type scale (recommended)
- Display/H1: 56–72px (desktop), 40–48px (mobile), `font-display`, `line-height: 1.0`
- H2: 36–48px, `line-height: 1.05`
- H3: 24–32px, `line-height: 1.15`
- Body: 16px, `line-height: 1.45` (matches reference)
- Small: 14px, `line-height: 1.6`
- Caption: 12px, `line-height: 1.6`, `letter-spacing: 0.02em`

### Usage rules
- Betting odds values use `--font-mono` to reduce misreads (e.g., `1.85`, `+120`).
- Critical numbers (balance, exposure) use tabular numerals if available (`font-variant-numeric: tabular-nums;`).

---

## 3) Layout & Surfaces

### Background
Use a layered background that feels alive but stays readable:
- Base: solid `--c-bg`
- Add 1–2 blurred radial "glow blobs" in corners using `--c-accent-glow`
- Use subtle grid/noise only if it does not reduce contrast

Example pattern:
```css
.app-bg {
  background:
    radial-gradient(circle at 15% 10%, rgba(161,121,241,0.22), rgba(13,11,21,0) 45%),
    radial-gradient(circle at 85% 0%, rgba(99,32,232,0.18), rgba(13,11,21,0) 40%),
    #0d0b15;
}
```

### Cards
- Default card: `--c-surface-1`, border `--c-border`, radius `--r-md`
- Raised card: `--c-surface-2`, border `--c-border-strong`, shadow `--shadow-1`
- Accent card: add a thin top gradient line `linear-gradient(90deg, transparent, var(--c-accent), transparent)`

### Navigation
Use a "glassy" dropdown surface:
- `background: rgba(39,37,57,0.72)`
- `backdrop-filter: blur(24px)` (with fallback)
- Rounded corners `--r-md`, border `--c-border-strong`

---

## 4) Buttons & Interactions

### Primary CTA (pill)
- Border + background: `--c-accent`
- Text: `--c-text`
- Radius: `--r-pill`
- Hover: lift by 6px (`translateY(-6px)`), background shifts to `--c-accent-2`
- Motion: `var(--dur-3) var(--ease-operator)` for transform and colors

### Secondary button
- Transparent background, border `--c-accent`
- Text: `--c-text-muted`
- Hover: background `--c-accent-soft`, text `--c-text`

### Destructive button
- Background `--c-danger`, hover slightly darker, never use accent purple for destructive actions.

### Disabled states
- Reduce opacity and remove hover lift; keep cursor and focus semantics correct.

---

## 5) Status Language (Betting)

Define consistent label colors and iconography:
- `scheduled`: muted text, subtle border
- `live`: accent or info, include pulsing dot (but keep motion subtle)
- `finished`: neutral
- `settled`: success green
- `cancelled/rejected`: danger red

For admin-only actions:
- `draft`: muted / border-only tag
- `published`: accent tag
- `archived`: faint gray tag

---

## 6) Animations (Use Sparingly, But Intentionally)

### Motion principles
- Use 1 primary ease curve for the product: `--ease-operator` (same "operator tool" feel as reference).
- Prefer "lift + glow" over large slides.
- Avoid infinite animations except tiny `live` indicator and spinners.

### Recommended micro-interactions
- CTA hover lift (6px) + shadow bloom
- Dropdown open: fade + slight scale (0.98 -> 1.0) over 200ms
- Page section reveal: staggered opacity/translate (8–12px) over 400ms

---

## 7) Components (Implementation Guidance)

### Match card (user)
Must include:
- Sport badge (sport color token)
- Start time (UTC/local label in small text)
- Teams/participants (display font)
- Status pill (scheduled/live/finished)
- "View odds" button (secondary)

### Odds row
Must include:
- Market name + outcome
- Odds number in mono
- Min/max stake constraints (caption)
- Disabled state when odds are archived/unavailable

### Admin: AI Odds workspace
Must include:
- Draft vs published split
- "Generate" -> preview -> "Publish"
- "Rewrite" with admin note -> regenerate preview
- Version label (v1, v2, ...) as a small tag

---

## 8) Accessibility Baselines
- Minimum contrast: target WCAG AA for body text on surfaces.
- Focus rings: use `outline: 2px solid rgba(99,32,232,0.65)` and `outline-offset: 2px`.
- Always expose state with both color and text/icon (avoid color-only meaning).

---

## 9) Asset Style
- Icons: thin stroke, geometric (match operator/tool vibe).
- Illustrations: abstract tech gradients and subtle noise; avoid cartoon style.
- Photography: minimal; if used, keep it monochrome or heavily graded to the palette.

---

## 10) Practical Next.js Integration Notes
- Use CSS variables as the single source of truth.
- If using Tailwind: map tokens in `tailwind.config.js` to `var(--...)` for colors and radii.
- Ensure server/client render consistency for theme attributes (avoid hydration mismatch).

