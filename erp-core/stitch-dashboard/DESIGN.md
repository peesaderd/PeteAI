---
name: Precision Engineering
colors:
  surface: '#11131b'
  surface-dim: '#11131b'
  surface-bright: '#373942'
  surface-container-lowest: '#0c0e16'
  surface-container-low: '#191b23'
  surface-container: '#1d1f27'
  surface-container-high: '#282a32'
  surface-container-highest: '#32343d'
  on-surface: '#e1e2ed'
  on-surface-variant: '#c3c6d7'
  inverse-surface: '#e1e2ed'
  inverse-on-surface: '#2e3039'
  outline: '#8d90a0'
  outline-variant: '#434655'
  surface-tint: '#b4c5ff'
  primary: '#b4c5ff'
  on-primary: '#002a78'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#0053db'
  secondary: '#b7c8e1'
  on-secondary: '#213145'
  secondary-container: '#3a4a5f'
  on-secondary-container: '#a9bad3'
  tertiary: '#ffb596'
  on-tertiary: '#581e00'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#11131b'
  on-background: '#e1e2ed'
  surface-variant: '#32343d'
typography:
  display:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  code:
    fontFamily: jetbrainsMono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system is anchored in the principles of high-performance productivity and technical clarity. Inspired by modern developer tools, it prioritizes a "density without clutter" approach, ensuring that complex project data remains legible and actionable.

The aesthetic is a blend of **Minimalism** and **Corporate Modern**, utilizing a strictly dark-mode foundation. It evokes an emotional response of focus, reliability, and speed. Visual hierarchy is established through precise border treatments and purposeful contrast rather than heavy decorative elements. The goal is to provide a "pro-tool" feel that disappears into the background, allowing the user's work to take center stage.

## Colors
The palette is built on a deep slate foundation to reduce eye strain during long working sessions.

- **Primary:** Electric Blue (#2563EB) is used sparingly for primary actions, active states, and progress indicators.
- **Background:** Dark Slate (#0F172A) provides a deep, non-distracting canvas.
- **Surface:** A slightly lighter Slate (#1E293B) differentiates cards, sidebars, and modals.
- **Functional Colors:** 
    - Success: Emerald-500 for completed tasks.
    - Warning: Amber-500 for nearing deadlines.
    - Critical: Rose-500 for overdue tasks or high priority.
- **Text:** White (#F8FAFC) for primary content and Slate-400 (#94A3B8) for secondary labels and metadata.

## Typography
This design system utilizes **Geist** for its systematic, technical feel and exceptional legibility at small sizes. 

- **Headlines:** Use SemiBold weights with tighter letter spacing to create a compact, authoritative look.
- **Body:** Standardized at 14px for density, which is common in professional dashboards. 16px is reserved for long-form descriptions or empty states.
- **Labels:** Use Medium weight and slight letter spacing for uppercase or metadata-heavy UI elements like status badges and timestamps.
- **Monospace:** JetBrains Mono is integrated for IDs, commit hashes, or technical parameters within tasks.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a strict 4px base unit. 

- **Dashboard Structure:** A fixed 240px left-hand sidebar for navigation, with a fluid main content area.
- **Consistency:** Use 16px (`md`) for internal card padding and task list gutters to maintain a tight, professional rhythm.
- **Breakpoints:**
    - **Mobile (<768px):** Sidebar collapses into a hamburger menu; margins reduce to 16px.
    - **Tablet (768px - 1280px):** 2-column task layouts allowed.
    - **Desktop (>1280px):** Multi-column Kanban boards or expanded table views with 32px outer margins.

## Elevation & Depth
In this design system, depth is communicated through **Tonal Layers** and **Low-Contrast Outlines** rather than traditional shadows.

1.  **Level 0 (Background):** The darkest slate (#0F172A). All "static" layout elements sit here.
2.  **Level 1 (Surfaces/Cards):** #1E293B. Used for the primary work area and task cards. These are defined by a 1px border (#334155).
3.  **Level 2 (Popovers/Modals):** Lighter slate (#2D3748). These use a very subtle, diffused 15% black shadow to indicate they are floating above the main UI.
4.  **Active State:** Elements being dragged or hovered receive a subtle glow from the primary color or a secondary border highlight.

## Shapes
The shape language is controlled and modern. 

- **Components:** Standard UI elements (buttons, inputs, cards) use a **0.5rem (8px)** radius.
- **Large Elements:** Modals and large containers use **1rem (16px)**.
- **Small Elements:** Tooltips and tags use a tighter **0.25rem (4px)** radius to maintain visual sharpness despite their small footprint.

## Components
- **Buttons:** 
    - *Primary:* Solid Electric Blue with white text. 
    - *Secondary:* Ghost style with #334155 borders; hover state lightens the background.
- **Task Cards:** Minimum 1px border (#334155). Content should be stacked: Title (Body-md Bold), Meta-tags (Label-md), and Assignee Avatar.
- **Priority Badges:** 
    - *High:* Rose-500 text on a low-opacity Rose background. 
    - *Medium:* Amber-500.
    - *Low:* Slate-400.
- **Input Fields:** Darker than the surface background (#0F172A) with a subtle border. On focus, the border transitions to Electric Blue.
- **Chips/Status:** Rounded-pill shapes for status (e.g., "In Progress," "Backlog") using muted colors and dot indicators.
- **Navigation:** Vertical sidebar with icons from a minimalist set (e.g., Lucide). Active links use a subtle background tint and a vertical blue pill on the left edge.