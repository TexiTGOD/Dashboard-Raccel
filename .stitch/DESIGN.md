---
name: Raccel
colors:
  background: "#08080A"
  surface: "#0F0F13"
  surfaceElevated: "#16161B"
  border: "#232329"
  primary: "#FF2E9F"
  primaryHover: "#FF57B2"
  primaryPressed: "#D91082"
  onPrimary: "#08080A"
  textPrimary: "#F2F2F5"
  textSecondary: "#8E8E9A"
  textMuted: "#6E6E7B"
  success: "#00E28C"
  warning: "#FFB443"
  danger: "#FF3B5C"
  info: "#7A8CA3"
typography:
  h1:
    fontFamily: Space Grotesk
    fontSize: 1.75rem
    fontWeight: 700
  h2:
    fontFamily: Space Grotesk
    fontSize: 1.0625rem
    fontWeight: 600
  body-md:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: 400
  label-caps:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: 500
  data:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: 500
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 1.375rem
    fontWeight: 600
rounded:
  sm: 2px
  md: 4px
  lg: 6px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
---

## Overview

Raccel is an internal operations console for a high-ticket sales team. Closers open it right after a
call to log the outcome; the founder opens it to see which piece of content produced each sale.

**Futurist minimalism.** The reference is an instrument panel, not a marketing site: a black field,
hairline structure, monospaced data, and one electric accent. Precision is the aesthetic. Everything
that is not information has been removed.

The restraint is deliberate and total. There are **no illustrations, no ornaments and no decorative
elements anywhere in this product** — not in the background, not in empty states, not in the header.
An interface that has nothing to remove is finished.

## Colors

This system contains **exactly one chromatic color**: an electric magenta-pink. Everything else is
black and grey. That is not a limitation, it is the mechanism — the neon reads as neon *because*
nothing competes with it.

### The neutral field

- **background (#08080A):** Flat, near-absolute black. **No pattern, no texture, no gradient, no
  image, no illustration.** The background is empty. This is the design, not a placeholder.
- **surface (#0F0F13):** Cards. Separated from the background by a hairline border, never by a shadow.
- **surfaceElevated (#16161B):** Inputs, selects, hover states.
- **border (#232329):** 1px hairlines. These are the primary structural device of the interface — the
  layout is drawn with lines, not with shadows or filled boxes.
- **textPrimary (#F2F2F5)** — data values, names. **textSecondary (#8E8E9A)** — metadata.
  **textMuted (#6E6E7B)** — micro-labels only, never a data value.

### The single accent

- **primary (#FF2E9F) — "Neon":** Electric magenta-pink. This hue is deliberately magenta-leaning
  (high blue channel), not rose-leaning. **Any derived tint or shade must stay in the magenta family.
  If a derived tone drifts toward red, maroon, brick, salmon or coral, it is wrong** — regenerate it
  toward magenta/violet instead.
- **onPrimary (#08080A):** Black text on a neon fill. Never white. Black on neon is what makes it read
  as electric rather than pastel.

### Softer pinks are the SAME pink, at lower opacity

There is no secondary pink, no tertiary pink, no rose, no salmon, no coral. When a softer pink is
needed, it is `primary` at reduced alpha over the black field:

| Use | Value |
|---|---|
| Selected / active row fill | `rgba(255, 46, 159, 0.16)` |
| Hover surface | `rgba(255, 46, 159, 0.08)` |
| Faint wash | `rgba(255, 46, 159, 0.04)` |
| Focus ring | `rgba(255, 46, 159, 0.40)` |

**Never introduce a new pink hex.** Every pink in the product is #FF2E9F at some opacity. This rule
is what keeps the palette clean.

### Semantic colors — status badges only

These four colors exist **only inside status badges**. They appear nowhere else in the interface — not
on text, not on borders, not on icons, not on amounts.

| Meaning | Token | Value |
|---|---|---|
| Vendido | success | #00E28C |
| Follow up | warning | #FFB443 |
| Perdido · No show | danger | #FF3B5C |
| Programada · neutral | info | #7A8CA3 |

Badge style: 1px border in the semantic color, text in the semantic color, transparent fill.
**Never a solid fill** — a solid badge competes with the neon CTA and flattens the hierarchy.

## Typography

Three families, each doing exactly one job. **The typographic split is what produces the futurist
feel — more than any color.**

- **Space Grotesk** — headings only. Geometric, technical.
- **Inter** — prose: micro-labels, helper text, buttons, and the lead's quoted words.
- **JetBrains Mono** — **all structured data.** Piece codes (`REEL_0402`), handles (`@ana.demo`),
  dates, times, amounts (`USD 2.000`), emails, IDs, consciousness levels. If a machine produced it or
  a machine can parse it, it is monospaced.

That last rule is the single most important instruction in this document. Data in mono, set against
prose in Inter, is what makes the interface read as an instrument rather than as a web page.

Micro-labels: 11px, uppercase, letter-spacing 0.1em, `textMuted`. Wide tracking on small caps is a
signature of this system — apply it everywhere labels appear.

## Spacing and layout

- Scale: 4 / 8 / 16 / 24 / 32 / 48.
- **Desktop is the design target.** The team works on laptops. Content max-width **1200px**, centered.
  The layout must still reflow to a single column on narrow screens, but desktop is what we design.
- Card padding 24px. Gap between cards 16px.
- **Negative space is the point.** When a screen feels finished, remove one element and add 8px of air.
  Density is the enemy.
- Asymmetry is allowed and encouraged. A two-column grid does not need equal columns.

## Component styles

### Card
`surface` fill, 1px `border`, radius `lg` (6px), 24px padding. **No shadow, ever.** For clickable
cards, on hover: the border becomes `primary` at 40% opacity and the fill becomes the 8% pink wash.
No glow, no lift, no scale.

### Hairline rule
A 1px `border` line used to separate sections inside a card and to underline section titles. This is
the workhorse of the layout — prefer it over nested boxes wherever possible.

### Status badge
Radius `full`, 11px uppercase, tracking 0.08em, 1px semantic border, semantic text, transparent fill.

### Primary button
Solid `primary` fill, `onPrimary` (black) text, radius `md` (4px), height 40px, weight 600, 13px
uppercase, tracking 0.06em. **Sized to its content — never full-width.** On hover: a soft neon glow
(`0 0 20px rgba(255, 46, 159, 0.35)`). This is the only glow in the entire product, and there is at
most one primary button per screen.

### Secondary button
Transparent fill, 1px `border`, `textPrimary` text. On hover: `surfaceElevated` fill. No glow.

### Input / select / textarea
`surfaceElevated` fill, 1px `border`, radius `md`, height 40px. On focus: the border goes solid
`primary` plus a 2px ring at 40% alpha.

### Lead quote block
The lead's own words from the DM. Inter, 15px, `textPrimary`, with a **2px solid neon left border**
and 16px of left padding. No italics, no decorative quote marks, no background fill. This is the only
place neon touches content rather than an action — deliberately, because it marks the human voice in
an otherwise machine-cold interface.

### Empty state
Centered, `textMuted`, one line of copy. **No illustration, no icon, no graphic.** A hairline box or
nothing at all. An empty state here is a fact, not an occasion.

## Iconography

Thin stroke (1.5px), never filled, `textSecondary` color. Lucide or equivalent. Icons are used only
where they disambiguate — if an icon is decorative, delete it.

## Interaction

- Transitions 120ms ease-out. Fast, mechanical, no bounce.
- Focus is always visible: 2px neon ring.
- No animation on data. Numbers do not count up. Badges do not pulse.

## Accessibility

- `textPrimary` on `background` is comfortably WCAG AAA.
- `textMuted` is for micro-labels only.
- Status is never conveyed by color alone: every badge carries its word.

## Anti-patterns — hard rules, do not violate

1. **The background is empty.** Flat #08080A. No wallpaper, no tiled pattern, no repeating shapes, no
   outlines, no dot grid, no noise, no gradient, no glow, no image. **Nothing behind the content and
   nothing floating on top of it.** If any background element exists, it is a bug.
2. **There are no illustrations in this product.** Not in empty states, not in the header, not
   anywhere. No organic shapes, no hand-drawn forms, no flowers, no hearts, no ovals, no leaves, no
   botanical motifs of any kind.
3. **Only one chromatic color exists: #FF2E9F.** Softer pinks are that hex at lower opacity, never a
   new color. If any red, maroon, brick, salmon, coral or rose tone appears anywhere, it is a bug.
4. **Neon is scarce.** Four uses only: the primary CTA, the active nav item, focus rings, and the 2px
   left border of the lead's quote. If neon appears in a fifth place, remove it.
5. **No gradients, no glassmorphism, no blur, no drop shadows, no neumorphism.** Flat fills and 1px
   hairline borders. That is the entire visual toolkit.
6. **No soft or pillowy shapes.** Radii are tight (2–6px). Rounded friendly cards are the opposite of
   this system.
7. **Do not invent data.** Use exactly the field names, values and copy provided. Never substitute
   generic SaaS or B2B placeholder content — the domain is relationship coaching, not software.
8. **Do not style the money.** Amounts are monospaced data in `textPrimary`. Not big, not green, not
   celebratory. The closer did not write that number and cannot edit it.
